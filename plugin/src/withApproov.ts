//
// MIT License
// 
// Copyright (c) 2016-present, Approov Ltd.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
// (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
// ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH
// THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/**
 * Expo config plugin for the universal Approov Android layer (io.approov:service.android) and its
 * Gradle plugin io.approov.gradle, which weaves OkHttp, HttpsURLConnection, Volley and Cronet
 * (react-native-nitro-fetch included) at build time.
 *
 * Android: resolves io.approov.gradle onto the buildscript classpath (published coordinate, or a local
 * source build with gradlePluginPath), applies it right after com.android.application, adds the
 * universal library, optionally configures approov.cronetDependencyPackages and, for local development, pins the
 * Approov SDK to another version, writes approov.config to the app's assets and inserts a guarded native
 * ApproovService.initialize in MainApplication.
 * iOS: adds the universal iOS pod (approov-ios-sdk and approov-service-ios from GitHub at a tag, either optionally
 * from a local path) to the Podfile,
 * adds approov.config to the app target's resources and inserts a guarded native ApproovService.initialize
 * at the start of application(_:didFinishLaunchingWithOptions:) in the Swift AppDelegate (Expo SDK 53 and later).
 *
 * approov.config is copied from the project root, and per variant from approov/android/<sourceSet>/ and
 * approov/ios/<Target>/, with the account ID and comment options merged into each file that lacks them, or
 * generated from those options when the project has none.
 *
 * Every generated block is tagged, so running prebuild again replaces it rather than duplicating it.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  AndroidConfig,
  ConfigPlugin,
  createRunOncePlugin,
  InfoPlist,
  withAndroidManifest,
  withAppBuildGradle,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withMainApplication,
  withPodfile,
  withProjectBuildGradle,
  withSettingsGradle,
  withGradleProperties,
  withXcodeProject,
  WarningAggregator,
} from 'expo/config-plugins';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg: { name: string; version: string } = require('../../package.json');

export const ACCOUNT_ID_ENV = 'APPROOV_ACCOUNT_ID';
// manifest meta-data and Info.plist keys that once held the account ID: never written, removed when present
export const ACCOUNT_ID_META_DATA = 'io.approov.ACCOUNT_ID';
export const INIT_COMMENT_META_DATA = 'io.approov.INIT_COMMENT';
export const INFO_PLIST_ACCOUNT_ID = 'ApproovAccountID';
export const INFO_PLIST_INIT_COMMENT = 'ApproovInitComment';

// One version for the library and the Gradle plugin: they are released together and the plugin fails
// the build when the library it resolves has a different version, so both coordinates derive from it.
export const DEFAULT_ANDROID_VERSION = '3.7.0';
export const SERVICE_ARTIFACT = 'io.approov:service.android';
/** Maven group of OkHttp, excluded from the layer so a React Native app keeps its own OkHttp 4. */
const OKHTTP_GROUP = 'com.squareup.okhttp3';
export const GRADLE_PLUGIN_ARTIFACT = 'io.approov:service.android-gradle-plugin';
const APPROOV_GROUP = 'io.approov';
/** The Approov SDK for Android, which io.approov:service.android depends on at the version it was released with. */
export const ANDROID_SDK_ARTIFACT = 'io.approov:approov-android-sdk';

// The universal iOS layer (approov-service-ios) and the platform SDK (approov-ios-sdk), as CocoaPods pods
// taken from their GitHub repositories at a tag. Neither is published to CocoaPods trunk, so the Podfile
// must name the git source (a podspec dependency cannot carry one). The layer version is independent of
// the Android one; ios.podPath and ios.sdkPodPath replace the git source of the layer and of the SDK with a local
// checkout for development.
export const IOS_POD_NAME = 'approov-service-ios';
export const IOS_POD_GIT = 'https://github.com/approov-alpha/approov-service-ios.git';
export const IOS_SDK_POD_NAME = 'approov-ios-sdk';
export const IOS_SDK_POD_GIT = 'https://github.com/approov/approov-ios-sdk.git';
export const DEFAULT_IOS_VERSION = '3.7.0';
export const DEFAULT_IOS_SDK_VERSION = '3.7.0';
/** The environment variable the approov-service-ios podspec reads for the version of its approov-ios-sdk dependency. */
export const IOS_SDK_VERSION_ENV = 'APPROOV_IOS_SDK_VERSION';
const LOG_TAG = 'ApproovInit';

export type AndroidProps = {
  /**
   * Version of io.approov:service.android and of io.approov:service.android-gradle-plugin (always the
   * same version; default 3.7.0). Use 3.7.0-local with the mavenLocal repository for a local build.
   */
  version?: string;
  /** Repositories for both artifacts: mavenCentral, mavenLocal, google, gradlePluginPortal, a URL or a path. */
  repositories?: string[];
  /** Local development: the approov-gradle-plugin source directory, used as an included build. */
  gradlePluginPath?: string;
  /** approov { cronetDependencyPackages = [...] }; left to the Gradle plugin default when unset. */
  cronetDependencyPackages?: string[];
  /**
   * Local development: the exact version io.approov:approov-android-sdk resolves to in every module, in place of the
   * one io.approov:service.android depends on, such as a release candidate in mavenLocal.
   */
  sdkVersion?: string;
};

export type IosProps = {
  /** Git tag of approov-service-ios, the universal iOS layer (default 3.7.0). */
  version?: string;
  /** Git tag of approov-ios-sdk, the platform SDK pod the layer depends on (default 3.7.0). */
  sdkVersion?: string;
  /** Local development: the approov-service-ios source directory (with its podspec), used as a :path pod. */
  podPath?: string;
  /** Local development: an approov-ios-sdk directory (with its podspec), used as a :path pod in place of the tag. */
  sdkPodPath?: string;
};

export type ApproovPluginProps = {
  /**
   * The Approov account ID, else the APPROOV_ACCOUNT_ID environment variable at prebuild: the "config" of every
   * approov.config the plugin writes, merged into a project file without one, or of a generated file when the
   * project has none. A project file with a different "config" fails the prebuild.
   */
  accountId?: string;
  /**
   * The initialization comment of every approov.config the plugin writes, unchanged, merged into a project file
   * without one; null (default) for none. A project file with a different "comment" fails the prebuild.
   */
  comment?: string | null;
  /** Insert native initialization in MainApplication and AppDelegate (default true). */
  nativeInitialize?: boolean;
  android?: AndroidProps;
  ios?: IosProps;
};

type KeywordRepository = 'mavenCentral' | 'mavenLocal' | 'google' | 'gradlePluginPortal';
export type Repository = { kind: KeywordRepository } | { kind: 'path'; path: string } | { kind: 'url'; url: string };

export type ResolvedProps = {
  accountId?: string;
  // where the account ID came from, named in a conflict message
  accountIdSource?: 'option' | 'env';
  comment: string | null;
  nativeInitialize: boolean;
  android: {
    version: string;
    serviceDependency: string;
    gradlePluginDependency: string;
    repositories: Repository[];
    gradlePluginPath?: string;
    cronetDependencyPackages?: string[];
    sdkVersion?: string;
  };
  ios: {
    version: string;
    sdkVersion: string;
    podPath?: string;
    sdkPodPath?: string;
    // the version of the pod at sdkPodPath, read from its podspec
    sdkPodVersion?: string;
  };
};

const KEYWORD_REPOSITORIES: KeywordRepository[] = ['mavenCentral', 'mavenLocal', 'google', 'gradlePluginPortal'];
const TOP_LEVEL_KEYS = ['accountId', 'comment', 'nativeInitialize', 'android', 'ios'];
const IOS_KEYS = ['version', 'sdkVersion', 'podPath', 'sdkPodPath'];
const ANDROID_KEYS = [
  'version',
  'repositories',
  'gradlePluginPath',
  'cronetDependencyPackages',
  'sdkVersion',
];
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_.+-]*$/;
// Gradle dynamic versions: the library and the Gradle plugin must resolve to one exact release
const DYNAMIC_VERSION = /\+|^latest\./;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const JAVA_PACKAGE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function fail(message: string): never {
  throw new Error(`${pkg.name} config plugin: ${message}`);
}

function checkKeys(value: Record<string, unknown>, allowed: string[], prefix: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`unknown option "${prefix}${key}" (allowed: ${allowed.join(', ')})`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveDirectory(option: string, value: unknown, projectRoot: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`"${option}" must be a non-empty path`);
  const resolved = path.resolve(projectRoot, value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    fail(`"${option}" ${resolved} does not exist or is not a directory`);
  }
  return resolved;
}

// an exact Gradle version option, or undefined when it is not set: "+" and "latest." are refused, as the version must
// name one release
function exactVersion(option: string, value: unknown, example: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !VERSION.test(value)) fail(`"${option}" must be a version string such as ${example}`);
  if (DYNAMIC_VERSION.test(value)) {
    fail(`"${option}" must be an exact version such as ${example}, not a dynamic one ("+" or "latest.")`);
  }
  return value;
}

// a local pod directory, which must hold the pod's podspec
function podDirectory(option: string, value: unknown, pod: string, projectRoot: string): string {
  const resolved = resolveDirectory(option, value, projectRoot);
  if (!fs.existsSync(path.join(resolved, `${pod}.podspec`)) && !fs.existsSync(path.join(resolved, `${pod}.podspec.json`))) {
    fail(`"${option}" ${resolved} has no ${pod}.podspec`);
  }
  return resolved;
}

/**
 * Reads the version of a local pod from its podspec: the JSON form's "version", or the Ruby form's literal
 * `<spec>.version = '...'`. Fails when there is none, or it is computed rather than written as a version string.
 */
export function podspecVersion(option: string, dir: string, pod: string): string {
  const jsonFile = path.join(dir, `${pod}.podspec.json`);
  const rubyFile = path.join(dir, `${pod}.podspec`);
  let version: unknown;
  if (fs.existsSync(rubyFile)) {
    const match = /^\s*\w+\.version\s*=\s*(['"])([^'"]*)\1\s*(#.*)?$/m.exec(fs.readFileSync(rubyFile, 'utf8'));
    version = match?.[2];
  } else {
    try {
      const spec: unknown = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      version = isPlainObject(spec) ? spec.version : undefined;
    } catch {
      version = undefined;
    }
  }
  if (typeof version !== 'string' || !VERSION.test(version)) {
    fail(`"${option}": the version of ${pod} cannot be read from its podspec in ${dir} (it must be a version string)`);
  }
  return version;
}

// whether a resolved path is the project root or inside it (never true without a project root)
function isInside(projectRoot: string | undefined, resolved: string): boolean {
  if (projectRoot === undefined) return false;
  const relative = path.relative(path.resolve(projectRoot), resolved);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Gets the warning for the local development options that are set for a platform, or null when none is set. These
 * options name what exists only on the developer's machine, or pin an SDK that is not published, so they must never reach a
 * production or EAS build; the build is not failed, as a committed path or a published version can be intended.
 *
 * @param platform is the platform whose options are checked
 * @param props are the resolved options
 * @param env is the environment of the prebuild, where EAS_BUILD is set on EAS Build
 * @param projectRoot is the project root: a directory repository or ios.podPath inside it is a vendored artifact
 *     committed with the project, not a local development option, so it is not named; without it every one is
 * @return the warning, or null
 */
export function localDevelopmentWarning(
  platform: 'android' | 'ios',
  props: ResolvedProps,
  env: NodeJS.ProcessEnv,
  projectRoot?: string,
): string | null {
  const set: string[] = [];
  if (platform === 'android') {
    if (props.android.sdkVersion !== undefined) set.push('android.sdkVersion');
    if (props.android.gradlePluginPath !== undefined) set.push('android.gradlePluginPath');
    if (props.android.repositories.some((r) => r.kind === 'mavenLocal')) set.push('android.repositories mavenLocal');
    if (props.android.repositories.some((r) => r.kind === 'path' && !isInside(projectRoot, r.path))) {
      set.push('android.repositories directory');
    }
  } else {
    if (props.ios.podPath !== undefined && !isInside(projectRoot, props.ios.podPath)) set.push('ios.podPath');
    if (props.ios.sdkPodPath !== undefined) set.push('ios.sdkPodPath');
  }
  if (set.length === 0) return null;
  const eas =
    typeof env.EAS_BUILD === 'string' && env.EAS_BUILD !== '' && env.EAS_BUILD !== 'false'
      ? ' This is an EAS build (EAS_BUILD is set): remove them unless this is a development build.'
      : '';
  return `local development option${set.length > 1 ? 's' : ''} set: ${set.join(', ')}. ` +
    `They must not be in a production or EAS build.${eas}`;
}

function failMissingConfig(platform?: 'android' | 'ios'): never {
  const variants =
    platform === 'ios'
      ? `${VARIANT_DIR}/ios/<Target>/${CONFIG_FILE}`
      : platform === 'android'
        ? `${VARIANT_DIR}/android/<sourceSet>/${CONFIG_FILE}`
        : `${VARIANT_DIR}/android/<sourceSet>/ and ${VARIANT_DIR}/ios/<Target>/`;
  fail(
    `the Approov account ID is missing${platform === undefined ? '' : ` for ${platform === 'ios' ? 'iOS' : 'Android'}`}. ` +
      `Add ${CONFIG_FILE} to the project root (or per variant, ${variants}), or set the "accountId" option or ` +
      `the ${ACCOUNT_ID_ENV} environment variable when running expo prebuild, or set "nativeInitialize": false ` +
      'to initialize Approov from JavaScript only.',
  );
}

// the 3.5.x package, which brings its own Approov layer and SDK and must never be in the same app
export const LEGACY_PACKAGE = '@approov/approov-service-react-native';

/**
 * Prebuild-time check: fails when the app depends on the 3.5.x package, or has it installed, as both
 * packages intercept the app's networking and both bring an Approov SDK.
 */
export function assertNoLegacyPackage(projectRoot: string): void {
  let declared = false;
  const manifest = path.join(projectRoot, 'package.json');
  if (fs.existsSync(manifest)) {
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (pkg[field] && Object.prototype.hasOwnProperty.call(pkg[field], LEGACY_PACKAGE)) declared = true;
    }
  }
  const installed = fs.existsSync(path.join(projectRoot, 'node_modules', LEGACY_PACKAGE, 'package.json'));
  if (declared || installed) {
    fail(
      `${LEGACY_PACKAGE} is ${declared ? 'a dependency of' : 'installed in'} this app. It cannot be used together ` +
        `with @approov/approov-react-native, as both bring an Approov layer: remove ${LEGACY_PACKAGE}`,
    );
  }
}

function warn(platform: 'android' | 'ios', warnings: string[]): void {
  for (const warning of warnings) WarningAggregator.addWarningForPlatform(platform, '@approov/approov-react-native', warning);
}

/**
 * Validates the plugin options and applies the defaults. Throws a clear error on any invalid option and,
 * unless requireAccountId is false, on a missing account ID with nativeInitialize and no approov.config in
 * the project.
 */
export function resolveProps(
  props: unknown,
  env: NodeJS.ProcessEnv,
  projectRoot: string,
  { requireAccountId = true }: { requireAccountId?: boolean } = {},
): ResolvedProps {
  const p = props === undefined || props === null ? {} : props;
  if (!isPlainObject(p)) fail('the options must be an object');
  checkKeys(p, TOP_LEVEL_KEYS, '');

  if (p.nativeInitialize !== undefined && typeof p.nativeInitialize !== 'boolean') {
    fail('"nativeInitialize" must be true or false');
  }
  const nativeInitialize = p.nativeInitialize !== false;

  if (p.accountId !== undefined && typeof p.accountId !== 'string') fail('"accountId" must be a string');
  // an empty or blank option is unset, so it never hides the environment variable
  const fromOption = typeof p.accountId === 'string' && p.accountId.trim() !== '' ? p.accountId.trim() : undefined;
  const fromEnv = typeof env[ACCOUNT_ID_ENV] === 'string' && env[ACCOUNT_ID_ENV].trim() !== '' ? env[ACCOUNT_ID_ENV].trim() : undefined;
  const accountId = fromOption ?? fromEnv;
  const accountIdSource = fromOption !== undefined ? 'option' : fromEnv !== undefined ? 'env' : undefined;
  if (requireAccountId && accountId === undefined && nativeInitialize && !hasConfigFiles(findConfigSources(projectRoot))) {
    failMissingConfig();
  }
  if (accountId !== undefined) {
    if (/[<>]/.test(accountId)) fail('"accountId" is still the placeholder: set your Approov account ID');
    if (/\s/.test(accountId) || CONTROL_CHARACTERS.test(accountId)) {
      fail('"accountId" must not contain whitespace or control characters');
    }
  }

  if (p.comment !== undefined && p.comment !== null && typeof p.comment !== 'string') {
    fail('"comment" must be a string or null');
  }
  const comment = typeof p.comment === 'string' ? p.comment : null;
  // a newline or tab in a comment is a mistake, such as a line ending carried over from an env file
  if (comment !== null && CONTROL_CHARACTERS.test(comment)) fail('"comment" must not contain control characters');

  const a = p.android === undefined ? {} : p.android;
  if (!isPlainObject(a)) fail('"android" must be an object');
  checkKeys(a, ANDROID_KEYS, 'android.');

  const version = exactVersion('android.version', a.version, '3.7.0') ?? DEFAULT_ANDROID_VERSION;
  const androidSdkVersion = exactVersion('android.sdkVersion', a.sdkVersion, '3.7.0');

  let repositories: Repository[] = [{ kind: 'mavenCentral' }];
  if (a.repositories !== undefined) {
    if (!Array.isArray(a.repositories) || a.repositories.length === 0) {
      fail('"android.repositories" must be a non-empty list');
    }
    repositories = a.repositories.map((entry: unknown): Repository => {
      if (typeof entry !== 'string' || entry.trim() === '') fail('"android.repositories" entries must be strings');
      if ((KEYWORD_REPOSITORIES as string[]).includes(entry)) return { kind: entry as KeywordRepository };
      if (/^https?:\/\//.test(entry)) return { kind: 'url', url: entry };
      return { kind: 'path', path: resolveDirectory('android.repositories', entry, projectRoot) };
    });
  }

  const gradlePluginPath =
    a.gradlePluginPath === undefined ? undefined : resolveDirectory('android.gradlePluginPath', a.gradlePluginPath, projectRoot);

  let cronetDependencyPackages: string[] | undefined;
  if (a.cronetDependencyPackages !== undefined) {
    const list = a.cronetDependencyPackages;
    if (!Array.isArray(list) || !list.every((x) => typeof x === 'string' && JAVA_PACKAGE.test(x))) {
      fail('"android.cronetDependencyPackages" must be a list of dotted Java package names');
    }
    cronetDependencyPackages = list as string[];
  }

  const i = p.ios === undefined ? {} : p.ios;
  if (!isPlainObject(i)) fail('"ios" must be an object');
  checkKeys(i, IOS_KEYS, 'ios.');
  if (i.version !== undefined && (typeof i.version !== 'string' || !VERSION.test(i.version))) {
    fail('"ios.version" must be a version string such as 3.7.0');
  }
  if (i.sdkVersion !== undefined && (typeof i.sdkVersion !== 'string' || !VERSION.test(i.sdkVersion))) {
    fail('"ios.sdkVersion" must be a version string such as 3.7.0');
  }
  if (i.version !== undefined && i.podPath !== undefined) fail('set "ios.version" or "ios.podPath", not both');
  if (i.sdkVersion !== undefined && i.sdkPodPath !== undefined) {
    fail('set "ios.sdkVersion" or "ios.sdkPodPath", not both');
  }
  const podPath = i.podPath === undefined ? undefined : podDirectory('ios.podPath', i.podPath, IOS_POD_NAME, projectRoot);
  const sdkPodPath =
    i.sdkPodPath === undefined ? undefined : podDirectory('ios.sdkPodPath', i.sdkPodPath, IOS_SDK_POD_NAME, projectRoot);
  const sdkPodVersion = sdkPodPath === undefined ? undefined : podspecVersion('ios.sdkPodPath', sdkPodPath, IOS_SDK_POD_NAME);

  return {
    accountId,
    accountIdSource,
    comment,
    nativeInitialize,
    android: {
      version,
      serviceDependency: `${SERVICE_ARTIFACT}:${version}`,
      gradlePluginDependency: `${GRADLE_PLUGIN_ARTIFACT}:${version}`,
      repositories,
      gradlePluginPath,
      cronetDependencyPackages,
      sdkVersion: androidSdkVersion,
    },
    ios: {
      version: typeof i.version === 'string' ? i.version : DEFAULT_IOS_VERSION,
      sdkVersion: typeof i.sdkVersion === 'string' ? i.sdkVersion : DEFAULT_IOS_SDK_VERSION,
      podPath,
      sdkPodPath,
      sdkPodVersion,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// approov.config: the configuration file the universal layers read when initialized without an account ID

export const CONFIG_FILE = 'approov.config';
// the project directory with the per variant files, approov/android/<sourceSet>/ and approov/ios/<Target>/
export const VARIANT_DIR = 'approov';
// the record, in android/ and ios/, of the files the plugin wrote there, so a later prebuild removes only those
export const WRITTEN_FILES_RECORD = '.approov-config-files.json';
// a Gradle source set name (main, debug, release, a flavor or a variant): lower camel case, case-sensitive
const SOURCE_SET = /^[a-z][A-Za-z0-9_]*$/;

export type ConfigSources = {
  /** <projectRoot>/approov.config, when present */
  root?: string;
  /** approov/android/<sourceSet>/approov.config by source set */
  android: Record<string, string>;
  /** approov/ios/<Target>/approov.config by Xcode target */
  ios: Record<string, string>;
};

/** A file the plugin puts in a native project: its location (source set or Xcode target) and its bytes. */
export type PlannedFile = { location: string; label: string; contents: Buffer; keys: string[] };

const isFile = (file: string) => fs.existsSync(file) && fs.statSync(file).isFile();
const isDirectory = (dir: string) => fs.existsSync(dir) && fs.statSync(dir).isDirectory();
const displayPath = (from: string, file: string) => path.relative(from, file).split(path.sep).join('/');

/** Finds the approov.config files of the project: at its root and per variant under approov/android and approov/ios. */
export function findConfigSources(projectRoot: string): ConfigSources {
  const sources: ConfigSources = { android: {}, ios: {} };
  const root = path.join(projectRoot, CONFIG_FILE);
  if (fs.existsSync(root)) {
    if (!isFile(root)) fail(`${CONFIG_FILE} in the project root is not a file`);
    sources.root = root;
  }
  for (const platform of ['android', 'ios'] as const) {
    const dir = path.join(projectRoot, VARIANT_DIR, platform);
    if (!isDirectory(dir)) continue;
    const level = platform === 'android' ? '<sourceSet>' : '<Target>';
    for (const entry of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, entry, CONFIG_FILE);
      if (entry === CONFIG_FILE) {
        fail(`${displayPath(projectRoot, path.join(dir, entry))} is not used: put it in ${VARIANT_DIR}/${platform}/${level}/ or in the project root`);
      }
      if (!isDirectory(path.join(dir, entry)) || !fs.existsSync(file)) continue;
      if (!isFile(file)) fail(`${displayPath(projectRoot, file)} is not a file`);
      if (platform === 'android' && !SOURCE_SET.test(entry)) {
        fail(
          `${displayPath(projectRoot, file)}: "${entry}" is not a Gradle source set name, which starts with a ` +
            'lowercase letter (main, debug, freeDebug) and is case-sensitive',
        );
      }
      if (platform === 'android' && entry !== 'main' && entry.toLowerCase() === 'main') {
        fail(`${displayPath(projectRoot, file)}: "${entry}" differs from the source set "main" only in case`);
      }
      const twin = Object.keys(sources[platform]).find((other) => other.toLowerCase() === entry.toLowerCase());
      if (twin !== undefined) {
        fail(`${VARIANT_DIR}/${platform}/${twin}/ and ${VARIANT_DIR}/${platform}/${entry}/ differ only in case: keep one`);
      }
      sources[platform][entry] = file;
    }
  }
  return sources;
}

/** Whether the project has any approov.config file. */
export function hasConfigFiles(sources: ConfigSources): boolean {
  return sources.root !== undefined || Object.keys(sources.android).length > 0 || Object.keys(sources.ios).length > 0;
}

/**
 * Prebuild-time check of where the configuration comes from: with nativeInitialize, approov.config files or the
 * account ID for the platform, and never two files for one place. Whether a file and the options agree is
 * checked when the file is merged (mergeConfigFile). Called from the mods, which run only when native files are
 * generated, not when Expo merely reads the config (expo config, expo start, the expo-constants build step,
 * EAS Update), where the environment variable may legitimately be absent.
 */
export function assertConfigSource(platform: 'android' | 'ios', props: ResolvedProps, sources: ConfigSources): void {
  if (platform === 'android' && sources.root !== undefined && sources.android.main !== undefined) {
    fail(`${CONFIG_FILE} in the project root and ${VARIANT_DIR}/android/main/${CONFIG_FILE} are both for the main source set: keep one`);
  }
  const files = sources.root !== undefined || Object.keys(sources[platform]).length > 0;
  if (props.nativeInitialize && !files && props.accountId === undefined) failMissingConfig(platform);
}

/**
 * The approov.config generated from the account ID and comment options: a JSON object with "config" and,
 * unless the comment is null, "comment".
 */
export function generateConfigFile(accountId: string, comment: string | null): Buffer {
  const contents: Record<string, string> = { config: accountId };
  if (comment !== null) contents.comment = comment;
  return Buffer.from(JSON.stringify(contents, null, 2) + '\n', 'utf8');
}

class JsonError extends Error {}

// the deepest nesting of objects and arrays the universal layers accept
export const MAX_DEPTH = 128;
// the largest approov.config the universal layers accept
export const MAX_SIZE = 1024 * 1024;

/** A key for a message: quoted and escaped, so a control character never reaches the terminal, and cut short. */
const quoteKey = (key: string) => (key.length > 40 ? `${JSON.stringify(key.slice(0, 40))}...` : JSON.stringify(key));

/**
 * Parses JSON as JSON.parse does, but as strictly as the universal layers: it rejects a duplicate key (JSON.parse
 * keeps the last one), nesting deeper than MAX_DEPTH, a lone surrogate escape and a number that is not finite
 * as a double. Objects have no prototype, so a "__proto__" key is an ordinary key. The error names the position
 * and never the content.
 */
export function parseStrictJson(text: string): unknown {
  let i = 0;
  const where = (at: number) => {
    const lines = text.slice(0, at).split('\n');
    return `line ${lines.length}, column ${lines[lines.length - 1].length + 1}`;
  };
  const syntaxError = (): never => {
    throw new JsonError(i >= text.length ? 'is not valid JSON: it ends early' : `is not valid JSON (${where(i)})`);
  };
  const space = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const ESCAPES: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const string = (): string => {
    let out = '';
    i++;
    for (;;) {
      if (i >= text.length || text.charCodeAt(i) < 0x20) syntaxError();
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch !== '\\') {
        out += ch;
        i++;
      } else if (text[i + 1] === 'u') {
        const at = i;
        const unit = (from: number) => {
          const hex = text.slice(from + 2, from + 6);
          return text[from + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(hex) ? parseInt(hex, 16) : -1;
        };
        const code = unit(i);
        if (code < 0) syntaxError();
        i += 6;
        // a surrogate escape is valid only as a high and low pair, as iOS requires
        if (code >= 0xdc00 && code <= 0xdfff) throw new JsonError(`is not valid JSON: a lone surrogate escape (${where(at)})`);
        if (code >= 0xd800 && code <= 0xdbff) {
          const low = text[i] === '\\' ? unit(i) : -1;
          if (low < 0xdc00 || low > 0xdfff) throw new JsonError(`is not valid JSON: a lone surrogate escape (${where(at)})`);
          out += String.fromCharCode(code, low);
          i += 6;
        } else {
          out += String.fromCharCode(code);
        }
      } else {
        const escaped = ESCAPES[text[i + 1]];
        if (escaped === undefined) syntaxError();
        out += escaped;
        i += 2;
      }
    }
  };
  const value = (depth: number): unknown => {
    space();
    const ch = text[i];
    if ((ch === '{' || ch === '[') && depth >= MAX_DEPTH) {
      throw new JsonError(`is not valid JSON: nested more than ${MAX_DEPTH} deep (${where(i)})`);
    }
    if (ch === '{') {
      const object: Record<string, unknown> = Object.create(null);
      i++;
      space();
      if (text[i] === '}') {
        i++;
        return object;
      }
      for (;;) {
        space();
        if (text[i] !== '"') syntaxError();
        const at = i;
        const key = string();
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          throw new JsonError(`has the key ${quoteKey(key)} twice (${where(at)})`);
        }
        space();
        if (text[i] !== ':') syntaxError();
        i++;
        object[key] = value(depth + 1);
        space();
        if (text[i] === ',') i++;
        else if (text[i] === '}') {
          i++;
          return object;
        } else syntaxError();
      }
    }
    if (ch === '[') {
      const array: unknown[] = [];
      i++;
      space();
      if (text[i] === ']') {
        i++;
        return array;
      }
      for (;;) {
        array.push(value(depth + 1));
        space();
        if (text[i] === ',') i++;
        else if (text[i] === ']') {
          i++;
          return array;
        } else syntaxError();
      }
    }
    if (ch === '"') return string();
    for (const [word, literal] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return literal;
      }
    }
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(text);
    if (number === null) return syntaxError();
    // a number too large for a double, such as 1e400, is invalid for the universal layers
    if (!Number.isFinite(Number(number[0]))) throw new JsonError(`is not valid JSON: a number out of range (${where(i)})`);
    i += number[0].length;
    return Number(number[0]);
  };
  const result = value(0);
  space();
  if (i < text.length) throw new JsonError(`is not valid JSON: there is more after the end of the value (${where(i)})`);
  return result;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isNullableString = (v: unknown) => v === null || typeof v === 'string';
const isStringList = (v: unknown) => Array.isArray(v) && v.every(isString);
export const MUTATORS = ['CLOSE_FAILURE', 'ALWAYS_PROCEED'];
export const LOG_LEVELS = ['OFF', 'ERROR', 'WARNING', 'INFO', 'DEBUG'];

// the keys of approov.config, each with its type check and the type for the error message
const CONFIG_KEYS: Record<string, [(v: unknown) => boolean, string]> = {
  config: [isString, 'a string'],
  comment: [isNullableString, 'a string or null'],
  devKey: [isString, 'a string'],
  tokenHeader: [
    (v) => isPlainObject(v) && isString(v.name) && (v.prefix === undefined || isString(v.prefix)),
    'an object with a string "name" and an optional string "prefix"',
  ],
  traceIDHeader: [isNullableString, 'a string or null'],
  statusHeader: [isNullableString, 'a string or null'],
  bindingHeader: [isNullableString, 'a string or null'],
  mutator: [isString, `a string (${MUTATORS.join(' or ')})`],
  messageSigning: [(v) => typeof v === 'boolean', 'true or false'],
  logLevel: [isString, `a string (${LOG_LEVELS.join(', ')})`],
  substitutionHeaders: [(v) => isPlainObject(v) && Object.values(v).every(isString), 'an object of header names to string prefixes'],
  substitutionQueryParams: [isStringList, 'a list of strings'],
  exclusionURLRegexes: [isStringList, 'a list of strings'],
};
// the key names, looked up as own names only, so "constructor" or "toString" is an unknown key
const KNOWN_KEYS = new Set(Object.keys(CONFIG_KEYS));

/** The warnings for values the layers skip at run time: the prebuild cannot fix them, but names them. */
function configValueWarnings(label: string, file: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const skipped = (key: string, why: string) => warnings.push(`${label}: "${key}" ${why}; the layer skips it`);
  for (const key of Object.keys(file)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`${label}: unknown key ${quoteKey(key)} is ignored`);
  }
  if (isPlainObject(file.tokenHeader)) {
    for (const key of Object.keys(file.tokenHeader)) {
      if (key !== 'name' && key !== 'prefix') warnings.push(`${label}: unknown key ${quoteKey(key)} in "tokenHeader" is ignored`);
    }
  }
  if (isString(file.mutator) && !MUTATORS.includes(file.mutator)) skipped('mutator', `is none of ${MUTATORS.join(', ')}`);
  if (isString(file.logLevel) && !LOG_LEVELS.includes(file.logLevel)) skipped('logLevel', `is none of ${LOG_LEVELS.join(', ')}`);
  for (const key of ['devKey', 'traceIDHeader', 'statusHeader', 'bindingHeader']) {
    if (file[key] === '') skipped(key, 'is empty');
  }
  if (isPlainObject(file.tokenHeader) && file.tokenHeader.name === '') skipped('tokenHeader', 'has an empty "name"');
  if (isPlainObject(file.substitutionHeaders) && '' in file.substitutionHeaders) skipped('substitutionHeaders', 'has an empty header name');
  for (const key of ['substitutionQueryParams', 'exclusionURLRegexes']) {
    if (Array.isArray(file[key]) && (file[key] as unknown[]).includes('')) skipped(key, 'has an empty entry');
  }
  return warnings;
}

/**
 * Prebuild-time check of an approov.config: fails, naming the file and the cause and never its content, when
 * the universal layers would refuse it or a known key has the wrong type. A file whose first non-whitespace
 * character is not "{" is a 3.5.x configuration file: its first line is the account ID and it has no options.
 * Returns the warnings for what the layers would accept but skip, and the keys of the file.
 */
export function validateConfigFile(label: string, contents: Buffer): { warnings: string[]; keys: string[] } {
  const { warnings, keys } = readConfigFile(label, contents);
  return { warnings, keys };
}

/** An approov.config as read by readConfigFile. */
type ConfigFileContents = {
  warnings: string[];
  keys: string[];
  // the decoded text, without a leading byte order mark
  text: string;
  // the parsed object, or null for a 3.5.x configuration file
  file: Record<string, unknown> | null;
  // the account ID, undefined when a JSON file has no "config"
  config?: string;
};

/**
 * Reads and checks an approov.config as validateConfigFile describes. With requireConfig false, a JSON object
 * without "config" passes, for the account ID option to be merged into it.
 */
function readConfigFile(
  label: string,
  contents: Buffer,
  { requireConfig = true } = {},
): ConfigFileContents {
  const failFile = (cause: string): never => fail(`${label} ${cause}`);
  if (contents.length > MAX_SIZE) failFile(`is larger than ${MAX_SIZE} bytes (1 MiB), the most the layers read`);
  let text = '';
  try {
    // decoding drops a leading byte order mark, which the layers ignore as well
    text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    failFile('is not valid UTF-8');
  }
  // the first character that is not whitespace, Unicode whitespace included
  const start = text.search(/\S/);
  if (start < 0) failFile('is empty');
  const warnings: string[] = [];
  let keys: string[] = [];
  let config: string | undefined;
  let parsed: Record<string, unknown> | null = null;
  // JSON, or a JSON value the layers reject as one (a number out of range included), never a 3.5.x file
  const isJson = (candidate: string) => {
    try {
      parseStrictJson(candidate);
      return true;
    } catch (e) {
      return e instanceof JsonError && e.message.includes('a number out of range');
    }
  };
  const json = text[start] === '{' || text[start] === '[' || isJson(text) || isJson(text.slice(start).split(/[\r\n]/)[0]);

  if (!json) {
    // a 3.5.x configuration file: its first non-blank line is the account ID, and it has no options
    config = text.slice(start).split(/[\r\n]/)[0].trim();
    // an account ID never holds { or ", so such a line is JSON behind an invisible character or a broken file
    if (/[{"]/.test(config)) failFile('is not valid JSON, and not a 3.5.x configuration file either, as its first line holds { or "');
    warnings.push(`${label} is a 3.5.x configuration file: the layer initializes with its first line and it carries no options`);
  } else if (text[start] !== '{') {
    // an array, a string, a number or a literal; parsed first so a broken file is named as such
    try {
      parseStrictJson(text);
    } catch (e) {
      if (e instanceof JsonError) failFile(e.message);
      throw e;
    }
    failFile('is not a JSON object: its top level must be an object, {"config": ...}');
  } else {
    let file: Record<string, unknown> = {};
    try {
      file = parseStrictJson(text) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof JsonError) failFile(e.message);
      throw e;
    }
    if (requireConfig && !('config' in file)) {
      failFile(
        `has no "config", the account ID: add it, or set the "accountId" option or the ${ACCOUNT_ID_ENV} ` +
          'environment variable for the plugin to add it',
      );
    }
    for (const [key, [check, type]] of Object.entries(CONFIG_KEYS)) {
      if (key in file && !check(file[key])) failFile(`has a wrong type for "${key}": it must be ${type}`);
    }
    config = file.config as string | undefined;
    keys = Object.keys(file);
    parsed = file;
    warnings.push(...configValueWarnings(label, file));
  }

  if (config !== undefined) {
    if (/[<>]/.test(config)) failFile('has "config" still set to the placeholder: set your Approov account ID');
    if (config === '') {
      warnings.push(`${label} has an empty "config": the app initializes in bypass mode, without Approov protection`);
    }
  }
  return { warnings, keys, text, file: parsed, config };
}

/** The option or environment variable the account ID came from, for a message. */
const accountIdSourceName = (props: ResolvedProps) =>
  props.accountIdSource === 'env' ? `the ${ACCOUNT_ID_ENV} environment variable` : 'the "accountId" option';

/**
 * Inserts keys at the start of the JSON object in text, which has at least one key, and keeps everything else
 * byte for byte: the other keys, their values (numbers and escapes as written) and the layout. The inserted keys
 * follow the layout of the first key, on its own line or on the same line.
 */
function insertKeys(text: string, additions: [string, string][]): string {
  const open = text.indexOf('{') + 1;
  const lead = (/^[ \t\r\n]*/.exec(text.slice(open)) as RegExpExecArray)[0];
  const fields = additions.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  const lineBreak = lead.lastIndexOf('\n');
  if (lineBreak < 0) return text.slice(0, open + lead.length) + fields.join(' ') + ' ' + text.slice(open + lead.length);
  const newline = lead.includes('\r\n') ? '\r\n' : '\n';
  const indent = lead.slice(lineBreak + 1);
  return text.slice(0, open) + fields.map((field) => newline + indent + field).join('') + text.slice(open);
}

/**
 * The approov.config the plugin writes for a project file: the file with the account ID option (or
 * APPROOV_ACCOUNT_ID) merged in as "config" and the comment option as "comment" when it has none, else the file
 * unchanged. Fails, naming the file and both sources and never a value, when the file has a different "config"
 * or "comment", or has no "config" and the account ID is not set. A 3.5.x configuration file takes nothing: its
 * line must equal the account ID, and it cannot carry the comment option. Returns the contents, the warnings for
 * the project file and its keys after the merge.
 */
export function mergeConfigFile(
  label: string,
  contents: Buffer,
  props: ResolvedProps,
): { contents: Buffer; warnings: string[]; keys: string[] } {
  const read = readConfigFile(label, contents, { requireConfig: props.accountId === undefined });
  const source = accountIdSourceName(props);
  const failConflict = (key: string, other: string, hint = ''): never =>
    fail(
      `${label} has a "${key}" different from ${other}. Make them equal, or remove one of them${hint}.`,
    );
  const eas = props.accountIdSource === 'env' ? ` (on EAS, ${ACCOUNT_ID_ENV} comes from the build profile's environment)` : '';
  if (props.accountId !== undefined && read.config !== undefined && read.config !== props.accountId) {
    failConflict('config', source, eas);
  }
  if (read.file === null) {
    // a 3.5.x configuration file is used as it is, so it cannot carry a comment
    if (props.comment !== null) {
      fail(
        `${label} is a 3.5.x configuration file, which has no "comment" for the "comment" option: write it as ` +
          `JSON, {"config": ...}, to have the comment merged in, or remove the option`,
      );
    }
    return { contents, warnings: read.warnings, keys: read.keys };
  }
  if (props.comment !== null && 'comment' in read.file && read.file.comment !== props.comment) {
    failConflict('comment', 'the "comment" option');
  }

  // the keys the file lacks, "config" first, then "comment"
  const additions: [string, string][] = [];
  if (props.accountId !== undefined && read.config === undefined) additions.push(['config', props.accountId]);
  if (props.comment !== null && !('comment' in read.file)) additions.push(['comment', props.comment]);
  if (additions.length === 0) return { contents, warnings: read.warnings, keys: read.keys };

  const text = read.keys.length === 0 ? JSON.stringify(Object.fromEntries(additions), null, 2) + '\n' : insertKeys(read.text, additions);
  // a leading byte order mark, which decoding dropped, is kept
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const merged = Buffer.concat([contents.subarray(0, 3).equals(bom) ? bom : Buffer.alloc(0), Buffer.from(text, 'utf8')]);
  // the merged file must pass the same check as a project file
  const checked = readConfigFile(`the ${CONFIG_FILE} merged from ${label}`, merged);
  return { contents: merged, warnings: read.warnings, keys: checked.keys };
}

/**
 * The approov.config files of one platform, checked: the project's own files with the account ID and comment
 * options merged in (mergeConfigFile), and one generated from the account ID for the main source set or the app
 * target when the project has no file there. On Android the root file is for the main source set; on iOS it is
 * for the app target. Returns the files and the warnings to report.
 */
export function planConfigFiles(
  platform: 'android' | 'ios',
  props: ResolvedProps,
  sources: ConfigSources,
  projectRoot: string,
  appTarget = 'main',
): { files: PlannedFile[]; warnings: string[] } {
  assertConfigSource(platform, props, sources);
  const main = platform === 'android' ? 'main' : appTarget;
  const files: PlannedFile[] = [];
  const warnings: string[] = [];
  const add = (location: string, file: string) => {
    const label = displayPath(projectRoot, file);
    const merged = mergeConfigFile(label, fs.readFileSync(file), props);
    warnings.push(...merged.warnings);
    files.push({ location, label, contents: merged.contents, keys: merged.keys });
  };

  if (sources.root !== undefined) {
    if (sources[platform][main] !== undefined) {
      fail(`${CONFIG_FILE} in the project root and ${VARIANT_DIR}/${platform}/${main}/${CONFIG_FILE} are both for ${main}: keep one`);
    }
    add(main, sources.root);
  }
  for (const [location, file] of Object.entries(sources[platform])) add(location, file);
  // with only variant files, the account ID still gives the main source set or the app target a file, so a
  // build without a file of its own is protected too
  if (props.accountId !== undefined && !files.some((f) => f.location === main)) {
    const label = `the ${CONFIG_FILE} generated from "accountId"`;
    const contents = generateConfigFile(props.accountId, props.comment);
    const checked = validateConfigFile(label, contents);
    files.unshift({ location: main, label, contents, keys: checked.keys });
  }
  // a variant directory without the file, for example with a misnamed one, is easily missed
  const variantDir = path.join(projectRoot, VARIANT_DIR, platform);
  if (isDirectory(variantDir)) {
    for (const entry of fs.readdirSync(variantDir).sort()) {
      if (isDirectory(path.join(variantDir, entry)) && sources[platform][entry] === undefined) {
        warnings.push(`${VARIANT_DIR}/${platform}/${entry}/ has no ${CONFIG_FILE}, so it is not used`);
      }
    }
  }
  if (props.nativeInitialize && files.length > 0 && !files.some((f) => f.location === main)) {
    const what = platform === 'android' ? 'the main source set' : `the app target ${main}`;
    warnings.push(
      `there is no ${CONFIG_FILE} for ${what}: a build without one of its own initializes in bypass mode, ` +
        'without Approov protection',
    );
  }
  for (const file of files) {
    if (file.location === main && file.keys.includes('devKey')) {
      warnings.push(`${file.label} has a "devKey", which then ships in release builds: keep it in a development variant's file`);
    }
  }
  return { files, warnings };
}

type WrittenFiles = { files: Record<string, string> };

const sha256 = (contents: Buffer) => crypto.createHash('sha256').update(contents).digest('hex');

// the paths, relative to android/ and ios/, where the plugin writes approov.config
export const ANDROID_CONFIG_PATH = /^app\/src\/[a-z][A-Za-z0-9_]*\/assets\/approov\.config$/;
export const IOS_CONFIG_PATH = /^approov\/(?!\.{1,2}\/)[^/\\]+\/approov\.config$/;

/**
 * The record of the files the plugin wrote. Only entries at a path where the plugin writes, inside platformRoot,
 * are taken: the record is a committed file, so it is never trusted to name a file to delete elsewhere.
 */
function readWrittenFiles(platformRoot: string, allowed: RegExp): Record<string, string> {
  let files: unknown;
  try {
    files = (JSON.parse(fs.readFileSync(path.join(platformRoot, WRITTEN_FILES_RECORD), 'utf8')) as WrittenFiles).files;
  } catch {
    return {};
  }
  if (!isPlainObject(files)) return {};
  const written: Record<string, string> = {};
  for (const [rel, hash] of Object.entries(files)) {
    const inside = path.resolve(platformRoot, rel).startsWith(path.resolve(platformRoot) + path.sep);
    if (allowed.test(rel) && inside && typeof hash === 'string') written[rel] = hash;
  }
  return written;
}

/** Removes the empty directories from dir up to, and not including, stop. */
function removeEmptyDirectories(dir: string, stop: string): void {
  for (let d = dir; d !== stop && d.startsWith(stop + path.sep); d = path.dirname(d)) {
    if (!isDirectory(d) || fs.readdirSync(d).length > 0) return;
    fs.rmdirSync(d);
  }
}

/**
 * Writes the files (paths relative to platformRoot, android/ or ios/) and removes the ones an earlier prebuild
 * wrote that are no longer wanted. What the plugin wrote is recorded, with a hash of each file, in
 * WRITTEN_FILES_RECORD: the plugin never overwrites or removes a file it did not write (an identical one is left
 * as it is and not recorded), and never overwrites or removes one changed since it wrote it. Only record entries
 * matching allowed are taken. Returns the warnings to report.
 */
export function syncConfigFiles(platformRoot: string, wanted: Record<string, Buffer>, allowed: RegExp): string[] {
  const written = readWrittenFiles(platformRoot, allowed);
  const label = (rel: string) => `${path.basename(platformRoot)}/${rel}`;
  const warnings: string[] = [];

  // check first, so nothing is written when a file is in the way
  for (const [rel, contents] of Object.entries(wanted)) {
    const file = path.join(platformRoot, rel);
    if (!fs.existsSync(file) || (isFile(file) && fs.readFileSync(file).equals(contents))) continue;
    if (written[rel] === undefined) {
      fail(
        `${label(rel)} exists and was not written by the plugin. Remove it to have the plugin write it from ` +
          `the project's ${CONFIG_FILE}, or remove the source of the plugin's file to keep yours.`,
      );
    }
    if (isFile(file) && sha256(fs.readFileSync(file)) !== written[rel]) {
      fail(
        `${label(rel)} was changed after the plugin wrote it. Make the change in the project's ${CONFIG_FILE} ` +
          'instead, and remove this file to have the plugin write it again.',
      );
    }
  }

  const record: Record<string, string> = {};
  for (const [rel, contents] of Object.entries(wanted)) {
    const file = path.join(platformRoot, rel);
    // an identical file the plugin did not write stays the developer's: not recorded, so never removed
    if (written[rel] === undefined && fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!isFile(file) || !fs.readFileSync(file).equals(contents)) fs.writeFileSync(file, contents);
    record[rel] = sha256(contents);
  }
  for (const [rel, hash] of Object.entries(written)) {
    if (wanted[rel] !== undefined) continue;
    const file = path.join(platformRoot, rel);
    if (!isFile(file)) continue;
    if (sha256(fs.readFileSync(file)) !== hash) {
      warnings.push(`${label(rel)} was changed after the plugin wrote it, so it is left in place although its source is gone`);
      continue;
    }
    fs.rmSync(file);
    removeEmptyDirectories(path.dirname(file), platformRoot);
  }

  const recordFile = path.join(platformRoot, WRITTEN_FILES_RECORD);
  if (Object.keys(record).length > 0) {
    const contents = JSON.stringify({ note: `files the ${pkg.name} config plugin wrote`, files: record }, null, 2) + '\n';
    if (!isFile(recordFile) || fs.readFileSync(recordFile, 'utf8') !== contents) fs.writeFileSync(recordFile, contents);
  } else if (fs.existsSync(recordFile)) {
    fs.rmSync(recordFile);
  }
  return warnings;
}

/**
 * Fails when a source set the plugin writes to differs only in case from a directory already in android/app/src,
 * which Gradle would not take as the same source set (and a case-insensitive file system would merge).
 */
export function assertSourceSetCase(androidRoot: string, sourceSets: string[]): void {
  const src = path.join(androidRoot, 'app', 'src');
  const existing = isDirectory(src) ? fs.readdirSync(src) : [];
  for (const sourceSet of sourceSets) {
    const other = existing.find((dir) => dir !== sourceSet && dir.toLowerCase() === sourceSet.toLowerCase());
    if (other !== undefined) {
      fail(`${VARIANT_DIR}/android/${sourceSet}/ differs only in case from android/app/src/${other}/: source set names are case-sensitive`);
    }
  }
}

/** android/: the path of a source set's approov.config. */
export const androidConfigPath = (sourceSet: string) => `app/src/${sourceSet}/assets/${CONFIG_FILE}`;
/** ios/: the path of an Xcode target's approov.config. */
export const iosConfigPath = (target: string) => `${VARIANT_DIR}/${target}/${CONFIG_FILE}`;

// ---------------------------------------------------------------------------------------------
// Tagged blocks: every insertion sits between begin/end markers and is removed before reinsertion.

const beginMarker = (tag: string, comment: string) => `${comment} @generated begin ${tag} - expo prebuild (DO NOT MODIFY)`;
const endMarker = (tag: string, comment: string) => `${comment} @generated end ${tag}`;

function removeBlock(src: string, tag: string, comment = '//'): string {
  const lines = src.split('\n');
  for (;;) {
    const start = lines.findIndex((l) => l.trim() === beginMarker(tag, comment));
    if (start < 0) return lines.join('\n');
    const end = lines.findIndex((l, i) => i > start && l.trim() === endMarker(tag, comment));
    if (end < 0) fail(`unterminated generated block "${tag}": remove it by hand or run prebuild --clean`);
    lines.splice(start, end - start + 1);
  }
}

function insertBlock(lines: string[], index: number, tag: string, body: string[], indent: string, comment = '//') {
  lines.splice(
    index,
    0,
    indent + beginMarker(tag, comment),
    ...body.map((l) => (l === '' ? '' : indent + l)),
    indent + endMarker(tag, comment),
  );
}

const indentOf = (line: string) => (/^\s*/.exec(line) as RegExpExecArray)[0];

/** Index of the line closing the brace block opened on line `start`. */
function blockEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return i;
    }
  }
  return -1;
}

function findAfter(lines: string[], from: number, re: RegExp): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

/** Groovy single-quoted string literal (no interpolation). */
const groovyString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const gradlePath = (from: string, to: string) => path.relative(from, to).split(path.sep).join('/');

function checkGroovy(language: string, file: string) {
  if (language !== 'groovy') fail(`${file} must be Groovy (build.gradle); ${language} is not supported yet`);
}

// ---------------------------------------------------------------------------------------------
// Android: Gradle

/** settings.gradle: includes the local io.approov.gradle source build when gradlePluginPath is set. */
// the Gradle property the package's own Android module reads for its io.approov:service.android version, so the
// module, the library line the plugin adds and the Gradle plugin always resolve the same release
export const SERVICE_VERSION_PROPERTY = 'approovServiceAndroidVersion';

type PropertiesItem = { type: 'property'; key: string; value: string } | { type: 'comment'; value: string } | { type: 'empty' };

/** Sets approovServiceAndroidVersion to android.version in gradle.properties, once, replacing an earlier value. */
export function modifyGradleProperties(items: PropertiesItem[], props: ResolvedProps): PropertiesItem[] {
  const out = items.filter((i) => !(i.type === 'property' && i.key === SERVICE_VERSION_PROPERTY));
  out.push({ type: 'property', key: SERVICE_VERSION_PROPERTY, value: props.android.version });
  return out;
}

export function modifySettingsGradle(src: string, props: ResolvedProps, androidDir: string): string {
  const tag = 'approov-gradle-plugin-build';
  const out = removeBlock(src, tag);
  if (!props.android.gradlePluginPath) return out;
  const lines = out.replace(/\n+$/, '').split('\n');
  insertBlock(
    lines,
    lines.length,
    tag,
    [
      '// Approov: local source build of the io.approov.gradle plugin (substitutes its classpath dependency)',
      `includeBuild(${groovyString(gradlePath(androidDir, props.android.gradlePluginPath))})`,
    ],
    '',
  );
  return lines.join('\n') + '\n';
}

function repositoryLines(repo: Repository, androidDir: string): string[] {
  const onlyApproov = ['    content {', `        includeGroup("${APPROOV_GROUP}")`, '    }'];
  switch (repo.kind) {
    case 'mavenLocal':
      return ['mavenLocal {', ...onlyApproov, '}'];
    case 'path':
      return [
        'maven {',
        `    url = uri(new File(rootDir, ${groovyString(gradlePath(androidDir, repo.path))}))`,
        ...onlyApproov,
        '}',
      ];
    case 'url':
      return ['maven {', `    url = uri(${groovyString(repo.url)})`, ...onlyApproov, '}'];
    default:
      return [`${repo.kind}()`];
  }
}

function upsertRepositories(lines: string[], ownerRe: RegExp, tag: string, props: ResolvedProps, androidDir: string) {
  const owner = findAfter(lines, 0, ownerRe);
  const repos = owner < 0 ? -1 : findAfter(lines, owner, /^\s*repositories\s*\{/);
  if (owner < 0 || repos < 0 || repos > blockEnd(lines, owner)) {
    fail(`android/build.gradle: no "repositories {" in the ${ownerRe.source.replace(/[^a-z]/g, '')} block`);
  }
  const existing = lines.slice(repos, blockEnd(lines, repos) + 1).map((l) => l.trim());
  const body = props.android.repositories
    .filter((r) => !(KEYWORD_REPOSITORIES as string[]).includes(r.kind) || r.kind === 'mavenLocal' || !existing.includes(`${r.kind}()`))
    .flatMap((r) => repositoryLines(r, androidDir));
  if (body.length) insertBlock(lines, repos + 1, tag, body, indentOf(lines[repos]) + '  ');
}

/**
 * android/build.gradle: repositories for the plugin (buildscript) and the library (allprojects), and
 * io.approov.gradle on the buildscript classpath, so the app module can apply it after AGP.
 */
export function modifyProjectBuildGradle(src: string, props: ResolvedProps, androidDir: string): string {
  let out = src;
  for (const tag of ['approov-buildscript-repositories', 'approov-classpath', 'approov-allprojects-repositories',
    'approov-sdk-version']) {
    out = removeBlock(out, tag);
  }
  const lines = out.split('\n');
  upsertRepositories(lines, /^\s*buildscript\s*\{/, 'approov-buildscript-repositories', props, androidDir);
  const buildscript = findAfter(lines, 0, /^\s*buildscript\s*\{/);
  const deps = findAfter(lines, buildscript, /^\s*dependencies\s*\{/);
  if (deps < 0 || deps > blockEnd(lines, buildscript)) fail('android/build.gradle: no buildscript dependencies block');
  insertBlock(
    lines,
    deps + 1,
    'approov-classpath',
    [`classpath("${props.android.gradlePluginDependency}")`],
    indentOf(lines[deps]) + '  ',
  );
  upsertRepositories(lines, /^\s*allprojects\s*\{/, 'approov-allprojects-repositories', props, androidDir);
  const sdkVersion = props.android.sdkVersion;
  if (sdkVersion !== undefined) {
    // at the end of allprojects, so it applies to every module: the app, this package's module and any library
    const allprojects = findAfter(lines, 0, /^\s*allprojects\s*\{/);
    insertBlock(
      lines,
      blockEnd(lines, allprojects),
      'approov-sdk-version',
      [
        '// Approov: local development only, the Approov SDK at android.sdkVersion in place of the release the layer uses',
        'configurations.configureEach {',
        '    resolutionStrategy.dependencySubstitution {',
        `        substitute(module(${groovyString(ANDROID_SDK_ARTIFACT)})).using(module(${groovyString(
          `${ANDROID_SDK_ARTIFACT}:${sdkVersion}`,
        )}))`,
        '    }',
        '}',
      ],
      indentOf(lines[allprojects]) + '  ',
    );
  }
  return lines.join('\n');
}

/**
 * android/app/build.gradle: applies io.approov.gradle right after com.android.application (the plugin
 * requires AGP first), adds the universal library and, when set, approov.cronetDependencyPackages.
 */
export function modifyAppBuildGradle(src: string, props: ResolvedProps): string {
  let out = src;
  for (const tag of ['approov-apply-plugin', 'approov-dependency', 'approov-cronet']) out = removeBlock(out, tag);
  const lines = out.split('\n');

  const applyLine = findAfter(lines, 0, /^\s*apply\s+plugin:\s*["']com\.android\.application["']/);
  const idLine = findAfter(lines, 0, /^\s*id\s*\(?\s*["']com\.android\.application["']\s*\)?\s*$/);
  if (applyLine >= 0) {
    insertBlock(lines, applyLine + 1, 'approov-apply-plugin', ['apply plugin: "io.approov.gradle"'], indentOf(lines[applyLine]));
  } else if (idLine >= 0) {
    insertBlock(lines, idLine + 1, 'approov-apply-plugin', ['id("io.approov.gradle")'], indentOf(lines[idLine]));
  } else {
    fail('android/app/build.gradle does not apply com.android.application; io.approov.gradle must follow it');
  }

  const deps = findAfter(lines, 0, /^dependencies\s*\{/);
  if (deps < 0) fail('android/app/build.gradle: no top-level dependencies block');
  // the layer brings OkHttp 5 for native apps; a React Native app keeps React Native's own OkHttp 4, so the
  // layer is declared with OkHttp excluded (this also removes the layer's OkHttp BOM constraint)
  insertBlock(
    lines,
    deps + 1,
    'approov-dependency',
    [`implementation("${props.android.serviceDependency}") {`, `    exclude group: "${OKHTTP_GROUP}"`, '}'],
    '    ',
  );

  const packages = props.android.cronetDependencyPackages;
  if (packages !== undefined) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('');
    insertBlock(
      lines,
      lines.length,
      'approov-cronet',
      [
        'approov {',
        "    // dependency packages whose Cronet builder creation io.approov.gradle weaves; [] = the app's own classes only",
        `    cronetDependencyPackages = [${packages.map((x) => groovyString(x)).join(', ')}]`,
        '}',
      ],
      '',
    );
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Android: manifest and MainApplication

export const PERMISSIONS = ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'];

/**
 * AndroidManifest.xml: the permissions the package needs. The account ID is in approov.config, so the
 * meta-data that once held it is removed when present.
 */
export function modifyAndroidManifest(manifest: AndroidConfig.Manifest.AndroidManifest): AndroidConfig.Manifest.AndroidManifest {
  // required by the package, whichever way it is initialized (the Approov SDK does not declare them)
  AndroidConfig.Permissions.ensurePermissions(manifest, PERMISSIONS);
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, ACCOUNT_ID_META_DATA);
  AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, INIT_COMMENT_META_DATA);
  return manifest;
}

const SVC = 'io.approov.service.android.ApproovService';
const BYPASS_NOTE = 'continuing without Approov protection';

function kotlinInit(): string[] {
  return [
    '// Approov: initialize the universal Android layer before React Native starts, from the approov.config',
    `// the ${pkg.name} config plugin put in the app's assets. A missing or invalid file`,
    '// or a rejected account ID is logged and the app continues in bypass mode, without Approov protection.',
    'try {',
    `  ${SVC}.initialize(this)`,
    '} catch (e: Exception) {',
    `  android.util.Log.e("${LOG_TAG}", "Approov initialization failed (\${e.javaClass.name}): ${BYPASS_NOTE}")`,
    '  try {',
    `    ${SVC}.initialize(this, "", null)`,
    '  } catch (bypass: Exception) {',
    `    android.util.Log.e("${LOG_TAG}", "Approov bypass initialization failed (\${bypass.javaClass.name})")`,
    '  }',
    '}',
    `android.util.Log.i("${LOG_TAG}", "Approov service enabled=\${${SVC}.isApproovServiceEnabled()} " +`,
    `  "protection enabled=\${${SVC}.isApproovProtectionEnabled()}")`,
  ];
}

function javaInit(): string[] {
  return [
    '// Approov: initialize the universal Android layer before React Native starts, from the approov.config',
    `// the ${pkg.name} config plugin put in the app's assets. A missing or invalid file`,
    '// or a rejected account ID is logged and the app continues in bypass mode, without Approov protection.',
    'try {',
    `  ${SVC}.initialize(this);`,
    '} catch (Exception e) {',
    `  android.util.Log.e("${LOG_TAG}", "Approov initialization failed (" + e.getClass().getName() + "): ${BYPASS_NOTE}");`,
    '  try {',
    `    ${SVC}.initialize(this, "", null);`,
    '  } catch (Exception bypass) {',
    `    android.util.Log.e("${LOG_TAG}", "Approov bypass initialization failed (" + bypass.getClass().getName() + ")");`,
    '  }',
    '}',
    `android.util.Log.i("${LOG_TAG}", "Approov service enabled=" + ${SVC}.isApproovServiceEnabled()`,
    `    + " protection enabled=" + ${SVC}.isApproovProtectionEnabled());`,
  ];
}

/** MainApplication: guarded native initialize right after super.onCreate(), before React Native starts. */
export function modifyMainApplication(src: string, language: string, props: ResolvedProps): string {
  const tag = 'approov-initialize';
  const out = removeBlock(src, tag);
  if (!props.nativeInitialize) return out;
  if (language !== 'kt' && language !== 'java') fail(`MainApplication language "${language}" is not supported`);
  const lines = out.split('\n');
  const onCreate = findAfter(lines, 0, language === 'kt' ? /fun\s+onCreate\s*\(\s*\)/ : /void\s+onCreate\s*\(\s*\)/);
  const superCall = onCreate < 0 ? -1 : findAfter(lines, onCreate, /^\s*super\.onCreate\(\)\s*;?\s*$/);
  if (superCall < 0) fail('MainApplication: no super.onCreate() in onCreate() to insert Approov initialization after');
  insertBlock(lines, superCall + 1, tag, language === 'kt' ? kotlinInit() : javaInit(), indentOf(lines[superCall]));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// iOS

/** Info.plist: the account ID is in approov.config, so the keys that once held it are removed when present. */
export function modifyInfoPlist(plist: InfoPlist): InfoPlist {
  const out: InfoPlist = { ...plist };
  delete out[INFO_PLIST_ACCOUNT_ID];
  delete out[INFO_PLIST_INIT_COMMENT];
  return out;
}

// the parsed ios/<name>.xcodeproj/project.pbxproj (the xcode package's project), as far as the plugin uses it
type XcodeProject = {
  hash: { project: { objects: Record<string, Record<string, any>> } };
  getFirstProject(): { firstProject: { mainGroup: string } };
};
type XcodeReference = { value: string; comment?: string };

/** A stable object ID for what the plugin adds, so prebuild writes the same project file every time. */
const xcodeId = (kind: string) => crypto.createHash('sha1').update(`${pkg.name}:${kind}`).digest('hex').slice(0, 24).toUpperCase();
const unquote = (value: unknown) => String(value).replace(/^"(.*)"$/, '$1').replace(/\\(.)/g, '$1');
/** A pbxproj string value, quoted unless it is a plain word. */
const pbxString = (value: string) => (/^[A-Za-z0-9_./]+$/.test(value) ? value : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
const objectIds = (section: Record<string, unknown>) => Object.keys(section).filter((id) => !id.endsWith('_comment'));

function setObject(section: Record<string, any>, id: string, object: Record<string, unknown>, comment: string): void {
  section[id] = object;
  section[`${id}_comment`] = comment;
}

function deleteObject(section: Record<string, any> | undefined, id: string): void {
  if (section === undefined) return;
  delete section[id];
  delete section[`${id}_comment`];
}

/** The native targets of the Xcode project by name, mapped to their object IDs. */
export function xcodeTargets(project: XcodeProject): Record<string, string> {
  const targets = project.hash.project.objects.PBXNativeTarget ?? {};
  return Object.fromEntries(objectIds(targets).map((id) => [unquote(targets[id].name), id]));
}

/** The app target: the application target named after the project, else the first application target. */
export function xcodeAppTarget(project: XcodeProject, projectName?: string): string {
  const targets = project.hash.project.objects.PBXNativeTarget ?? {};
  const apps = objectIds(targets)
    .filter((id) => unquote(targets[id].productType) === 'com.apple.product-type.application')
    .map((id) => unquote(targets[id].name));
  if (apps.length === 0) fail('the Xcode project has no application target');
  return projectName !== undefined && apps.includes(projectName) ? projectName : apps[0];
}

/**
 * The Xcode project: approov/<Target>/approov.config as a resource (Copy Bundle Resources) of each of the
 * given targets, in an "approov" group with one subgroup per target. What the plugin added for a target no
 * longer given is removed. The object IDs are derived from the target names, so the result is the same
 * on every prebuild.
 */
export function modifyXcodeProject(project: XcodeProject, targetNames: string[]): XcodeProject {
  const objects = project.hash.project.objects;
  for (const isa of ['PBXGroup', 'PBXFileReference', 'PBXBuildFile', 'PBXResourcesBuildPhase']) objects[isa] = objects[isa] ?? {};
  const groups = objects.PBXGroup;
  const fileReferences = objects.PBXFileReference;
  const buildFiles = objects.PBXBuildFile;
  const phases = objects.PBXResourcesBuildPhase;
  const mainGroup = groups[project.getFirstProject().firstProject.mainGroup];
  const targets = xcodeTargets(project);
  const wanted = [...new Set(targetNames)].sort();
  const ids = (target: string) => ({
    group: xcodeId(`group:${target}`),
    file: xcodeId(`file:${target}`),
    build: xcodeId(`build:${target}`),
  });
  const approovGroup = xcodeId('group');
  const inResources = `${CONFIG_FILE} in Resources`;

  // an approov.config resource the plugin did not add (the 3.5.x layout) would be a second one in the bundle
  for (const target of wanted) {
    const targetId = targets[target];
    if (targetId === undefined) fail(`the Xcode project has no target "${target}"`);
    for (const { value: phase } of (objects.PBXNativeTarget[targetId].buildPhases ?? []) as XcodeReference[]) {
      for (const { value: build } of (phases[phase]?.files ?? []) as XcodeReference[]) {
        const reference = fileReferences[buildFiles[build]?.fileRef];
        const name = reference === undefined ? '' : path.posix.basename(unquote(reference.name ?? reference.path));
        if (build !== ids(target).build && name === CONFIG_FILE) {
          fail(
            `the Xcode target "${target}" already has an ${CONFIG_FILE} resource the plugin did not add. Remove it ` +
              `from the target (and move its content to the project's ${CONFIG_FILE}), as the app can bundle only one.`,
          );
        }
      }
    }
  }

  // remove the subgroups, files and build files of targets no longer given
  const keep = new Set(wanted.map((target) => ids(target).group));
  const staleFiles = new Set<string>();
  for (const { value: group } of (groups[approovGroup]?.children ?? []) as XcodeReference[]) {
    if (keep.has(group)) continue;
    for (const { value: file } of (groups[group]?.children ?? []) as XcodeReference[]) {
      staleFiles.add(file);
      deleteObject(fileReferences, file);
    }
    deleteObject(groups, group);
  }
  const staleBuildFiles = new Set(objectIds(buildFiles).filter((id) => staleFiles.has(buildFiles[id].fileRef)));
  for (const id of staleBuildFiles) deleteObject(buildFiles, id);
  for (const id of objectIds(phases)) {
    phases[id].files = ((phases[id].files ?? []) as XcodeReference[]).filter((f) => !staleBuildFiles.has(f.value));
  }
  // a Copy Bundle Resources phase the plugin added, once empty, goes as well
  for (const [target, targetId] of Object.entries(targets)) {
    const phase = xcodeId(`resources:${target}`);
    if (wanted.includes(target) || phases[phase] === undefined || phases[phase].files.length > 0) continue;
    deleteObject(phases, phase);
    const nativeTarget = objects.PBXNativeTarget[targetId];
    nativeTarget.buildPhases = (nativeTarget.buildPhases as XcodeReference[]).filter((p) => p.value !== phase);
  }

  if (wanted.length === 0) {
    deleteObject(groups, approovGroup);
    mainGroup.children = (mainGroup.children as XcodeReference[]).filter((c) => c.value !== approovGroup);
    return project;
  }

  setObject(
    groups,
    approovGroup,
    {
      isa: 'PBXGroup',
      children: wanted.map((target) => ({ value: ids(target).group, comment: target })),
      path: VARIANT_DIR,
      sourceTree: '"<group>"',
    },
    VARIANT_DIR,
  );
  if (!(mainGroup.children as XcodeReference[]).some((c) => c.value === approovGroup)) {
    mainGroup.children.push({ value: approovGroup, comment: VARIANT_DIR });
  }
  for (const target of wanted) {
    const targetId = targets[target];
    const id = ids(target);
    setObject(
      groups,
      id.group,
      { isa: 'PBXGroup', children: [{ value: id.file, comment: CONFIG_FILE }], path: pbxString(target), sourceTree: '"<group>"' },
      target,
    );
    setObject(
      fileReferences,
      id.file,
      { isa: 'PBXFileReference', fileEncoding: 4, lastKnownFileType: 'text', path: CONFIG_FILE, sourceTree: '"<group>"' },
      CONFIG_FILE,
    );
    setObject(buildFiles, id.build, { isa: 'PBXBuildFile', fileRef: id.file, fileRef_comment: CONFIG_FILE }, inResources);

    // the target's Copy Bundle Resources phase, added when it has none
    const nativeTarget = objects.PBXNativeTarget[targetId];
    nativeTarget.buildPhases = nativeTarget.buildPhases ?? [];
    let phase = (nativeTarget.buildPhases as XcodeReference[]).map((p) => p.value).find((p) => phases[p] !== undefined);
    if (phase === undefined) {
      phase = xcodeId(`resources:${target}`);
      setObject(
        phases,
        phase,
        { isa: 'PBXResourcesBuildPhase', buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 },
        'Resources',
      );
      nativeTarget.buildPhases.push({ value: phase, comment: 'Resources' });
    }
    const files = (phases[phase].files = phases[phase].files ?? []) as XcodeReference[];
    if (!files.some((f) => f.value === id.build)) files.push({ value: id.build, comment: inResources });
  }
  return project;
}

/** Ruby single-quoted string literal. */
const rubyString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * ios/Podfile: the platform SDK pod and the universal iOS layer pod in the app target, both from GitHub at a
 * tag (ios.sdkVersion, ios.version); the layer from a local path with ios.podPath, and the SDK with ios.sdkPodPath.
 * The SDK is named here because the layer's podspec depends on it by version only and cannot say where to fetch it.
 * With ios.sdkPodPath, APPROOV_IOS_SDK_VERSION is set at the top to the local pod's version, which the layer's podspec
 * reads for its SDK dependency, so pod install resolves the layer against the local SDK.
 * Added with nativeInitialize false too: JavaScript initialization needs the layer as well.
 */
export function modifyPodfile(src: string, props: ResolvedProps, iosDir: string): string {
  const tag = 'approov-pod';
  const out = removeBlock(removeBlock(src, tag, '#'), 'approov-sdk-version', '#');
  const lines = out.split('\n');
  const expoModules = findAfter(lines, 0, /^\s*use_expo_modules!/);
  const target = findAfter(lines, 0, /^\s*target\s+['"].+['"]\s+do\s*$/);
  if (target < 0) fail(`ios/Podfile: no "target ... do" block to add the ${IOS_POD_NAME} pod to`);
  const after = expoModules > target ? expoModules : target;
  const localPath = (dir: string) => `:path => ${rubyString(path.relative(iosDir, dir).split(path.sep).join('/'))}`;
  const source = props.ios.podPath
    ? localPath(props.ios.podPath)
    : `:git => ${rubyString(IOS_POD_GIT)}, :tag => ${rubyString(props.ios.version)}`;
  const sdkSource = props.ios.sdkPodPath
    ? localPath(props.ios.sdkPodPath)
    : `:git => ${rubyString(IOS_SDK_POD_GIT)}, :tag => ${rubyString(props.ios.sdkVersion)}`;
  insertBlock(
    lines,
    after + 1,
    tag,
    [
      props.ios.podPath || props.ios.sdkPodPath
        ? '# Approov: the platform SDK and the universal iOS service layer; a :path pod comes from a local folder, such as the vendor package'
        : '# Approov: the platform SDK and the universal iOS service layer, from GitHub (not on CocoaPods trunk)',
      `pod ${rubyString(IOS_SDK_POD_NAME)}, ${sdkSource}`,
      `pod ${rubyString(IOS_POD_NAME)}, ${source}`,
    ],
    expoModules > target ? indentOf(lines[expoModules]) : indentOf(lines[target]) + '  ',
    '#',
  );
  if (props.ios.sdkPodVersion !== undefined) {
    // before anything else, so the approov-service-ios podspec depends on the version of the local SDK pod
    insertBlock(
      lines,
      0,
      'approov-sdk-version',
      [
        '# Approov: local development only, the approov-ios-sdk version the approov-service-ios podspec depends on,',
        '# read from the local pod at ios.sdkPodPath',
        `ENV[${rubyString(IOS_SDK_VERSION_ENV)}] = ${rubyString(props.ios.sdkPodVersion)}`,
      ],
      '',
      '#',
    );
  }
  return lines.join('\n');
}

function swiftInit(): string[] {
  const log = (msg: string) => `NSLog("%@", "${LOG_TAG}: ${msg}")`;
  return [
    '// Approov: initialize the universal iOS layer before React Native starts, from the approov.config',
    `// the ${pkg.name} config plugin added to the app bundle. A missing or invalid file`,
    '// or a rejected account ID is logged and the app continues in bypass mode, without Approov protection.',
    'do {',
    '  try ApproovService.initialize()',
    '} catch {',
    `  ${log(`Approov initialization failed (\\(String(reflecting: type(of: error)))): ${BYPASS_NOTE}`)}`,
    '  try? ApproovService.initialize("")',
    '}',
    `NSLog("%@", "${LOG_TAG}: Approov service enabled=\\(ApproovService.isApproovServiceEnabled()) " +`,
    '  "protection enabled=\\(ApproovService.isApproovProtectionEnabled())")',
  ];
}

/**
 * AppDelegate: `import ApproovService` and a guarded native initialize as the first statements of
 * application(_:didFinishLaunchingWithOptions:), before the React Native factory is created. Swift only
 * (Expo SDK 53 and later); the Objective-C AppDelegate of SDK 52 and earlier cannot call the Swift-only
 * universal API and fails with a clear message unless nativeInitialize is false.
 */
export function modifyAppDelegate(src: string, language: string, props: ResolvedProps): string {
  const importTag = 'approov-import';
  const initTag = 'approov-initialize';
  const out = removeBlock(removeBlock(src, importTag), initTag);
  if (!props.nativeInitialize) return out;
  if (language !== 'swift') {
    fail(
      `native iOS initialization needs a Swift AppDelegate (Expo SDK 53 and later); this project has an ` +
        `Objective-C AppDelegate (${language}). Set "nativeInitialize": false and initialize Approov from ` +
        'JavaScript, or call ApproovService.initialize from Swift by hand.',
    );
  }
  const lines = out.split('\n');
  const signature = findAfter(lines, 0, /didFinishLaunchingWithOptions\s+launchOptions/);
  const bodyOpen = signature < 0 ? -1 : findAfter(lines, signature, /\)\s*->\s*Bool\s*\{\s*$/);
  if (bodyOpen < 0) fail('AppDelegate: no application(_:didFinishLaunchingWithOptions:) to insert Approov initialization in');
  const firstStatement = findAfter(lines, bodyOpen + 1, /\S/);
  const indent = firstStatement < 0 ? indentOf(lines[bodyOpen]) + '  ' : indentOf(lines[firstStatement]);
  insertBlock(lines, bodyOpen + 1, initTag, swiftInit(), indent);

  let lastImport = -1;
  for (let i = 0; i < lines.length && i < signature; i++) {
    if (/^\s*(@\w+\s+)*((public|internal|private|fileprivate|package)\s+)?import\s+\w/.test(lines[i])) lastImport = i;
  }
  insertBlock(lines, lastImport + 1, importTag, ['import ApproovService'], '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------

const withApproov: ConfigPlugin<ApproovPluginProps | void> = (config, props) => {
  const projectRoot = (config as { _internal?: { projectRoot?: string } })._internal?.projectRoot ?? process.cwd();
  // the configuration is checked in the mods (assertConfigSource): reading the config must not need it
  const resolved = resolveProps(props, process.env, projectRoot, { requireAccountId: false });

  config = withSettingsGradle(config, (c) => {
    checkGroovy(c.modResults.language, 'android/settings.gradle');
    c.modResults.contents = modifySettingsGradle(c.modResults.contents, resolved, c.modRequest.platformProjectRoot);
    return c;
  });
  config = withProjectBuildGradle(config, (c) => {
    checkGroovy(c.modResults.language, 'android/build.gradle');
    // once per prebuild for the platform: this mod runs once
    const local = localDevelopmentWarning('android', resolved, process.env, projectRoot);
    if (local !== null) warn('android', [local]);
    c.modResults.contents = modifyProjectBuildGradle(c.modResults.contents, resolved, c.modRequest.platformProjectRoot);
    return c;
  });
  config = withGradleProperties(config, (c) => {
    c.modResults = modifyGradleProperties(c.modResults as PropertiesItem[], resolved) as typeof c.modResults;
    return c;
  });
  config = withAppBuildGradle(config, (c) => {
    checkGroovy(c.modResults.language, 'android/app/build.gradle');
    c.modResults.contents = modifyAppBuildGradle(c.modResults.contents, resolved);
    return c;
  });
  config = withDangerousMod(config, [
    'android',
    (c) => {
      // approov.config in the assets of each source set it is given for, checked before anything is written
      const plan = planConfigFiles('android', resolved, findConfigSources(c.modRequest.projectRoot), c.modRequest.projectRoot);
      assertSourceSetCase(c.modRequest.platformProjectRoot, plan.files.map((f) => f.location));
      const wanted = Object.fromEntries(plan.files.map((f) => [androidConfigPath(f.location), f.contents]));
      warn('android', [...plan.warnings, ...syncConfigFiles(c.modRequest.platformProjectRoot, wanted, ANDROID_CONFIG_PATH)]);
      return c;
    },
  ]);
  config = withAndroidManifest(config, (c) => {
    // only permissions and key removal: the configuration is checked by the MainApplication and dangerous mods,
    // so that reading the config under introspection needs neither an account ID nor a file
    assertNoLegacyPackage(c.modRequest.projectRoot);
    c.modResults = modifyAndroidManifest(c.modResults);
    return c;
  });
  config = withMainApplication(config, (c) => {
    assertConfigSource('android', resolved, findConfigSources(c.modRequest.projectRoot));
    c.modResults.contents = modifyMainApplication(c.modResults.contents, c.modResults.language, resolved);
    return c;
  });
  config = withInfoPlist(config, (c) => {
    // only removes keys: the configuration is checked by the Xcode project and AppDelegate mods, so that
    // reading the config under introspection needs neither an account ID nor a file
    assertNoLegacyPackage(c.modRequest.projectRoot);
    c.modResults = modifyInfoPlist(c.modResults);
    return c;
  });
  config = withXcodeProject(config, (c) => {
    // approov.config as a resource of the app target, and of each target it is given for per variant
    const project = c.modResults as unknown as XcodeProject;
    const sources = findConfigSources(c.modRequest.projectRoot);
    const targets = Object.keys(xcodeTargets(project));
    for (const target of Object.keys(sources.ios)) {
      if (!targets.includes(target)) {
        fail(
          `${VARIANT_DIR}/ios/${target}/${CONFIG_FILE}: the Xcode project has no target "${target}" ` +
            `(its targets: ${targets.join(', ')})`,
        );
      }
    }
    const appTarget = xcodeAppTarget(project, c.modRequest.projectName);
    const plan = planConfigFiles('ios', resolved, sources, c.modRequest.projectRoot, appTarget);
    const wanted = Object.fromEntries(plan.files.map((f) => [iosConfigPath(f.location), f.contents]));
    // the project first: it fails on a resource in the way before any file is written
    modifyXcodeProject(project, plan.files.map((f) => f.location));
    const warnings = [...plan.warnings];
    if (!c.modRequest.introspect) warnings.push(...syncConfigFiles(c.modRequest.platformProjectRoot, wanted, IOS_CONFIG_PATH));
    warn('ios', warnings);
    return c;
  });
  config = withPodfile(config, (c) => {
    // once per prebuild for the platform: this mod runs once
    const local = localDevelopmentWarning('ios', resolved, process.env, projectRoot);
    if (local !== null) warn('ios', [local]);
    c.modResults.contents = modifyPodfile(c.modResults.contents, resolved, c.modRequest.platformProjectRoot);
    return c;
  });
  config = withAppDelegate(config, (c) => {
    assertConfigSource('ios', resolved, findConfigSources(c.modRequest.projectRoot));
    c.modResults.contents = modifyAppDelegate(c.modResults.contents, c.modResults.language, resolved);
    return c;
  });
  return config;
};

export default createRunOncePlugin(withApproov, pkg.name, pkg.version);
