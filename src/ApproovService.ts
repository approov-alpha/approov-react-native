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
 * ApproovService, the JavaScript API of @approov/approov-react-native: ApproovService, a thin forwarding layer over the universal
 * Approov layer of each platform. Every method returns a Promise and calls exactly one method of the
 * native module ApproovReactNative, after checking its arguments; there is no request processing here.
 * React Native's own networking is protected natively (Android: the io.approov.gradle weave of
 * OkHttpClientProvider; iOS: the universal URLSession interception), so no special fetch call is needed.
 *
 * Initialize, then configure: await initialize (or let the native bootstrap of the Expo config plugin do it),
 * check isApproovServiceEnabled() and isApproovProtectionEnabled(), then make the configuration calls.
 * initialize() with no arguments, or with a null account ID, reads the bundled approov.config;
 * initialize(accountId, comment) does not.
 */
import Native from './NativeApproovReactNative';
import { toApproovError } from './errors';
import { SigningOptions, validateSigningOptions } from './signing';

/** The standard service mutators, by name. DEFAULT selects the layer's default, ALWAYS_PROCEED in 3.7.0. */
export type ServiceMutatorName = 'CLOSE_FAILURE' | 'ALWAYS_PROCEED' | 'DEFAULT';

/** The installed mutator: a standard one by name, or CUSTOM for an app's own native mutator. */
export type InstalledServiceMutator = 'CLOSE_FAILURE' | 'ALWAYS_PROCEED' | 'CUSTOM';

/** The logging levels of the universal layers. */
export type LoggingLevel = 'OFF' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';

const MUTATORS: readonly string[] = ['CLOSE_FAILURE', 'ALWAYS_PROCEED', 'DEFAULT'];
const LOGGING_LEVELS: readonly string[] = ['OFF', 'ERROR', 'WARNING', 'INFO', 'DEBUG'];

function requireString(method: string, name: string, value: unknown): string {
  if (typeof value !== 'string') throw new TypeError(`ApproovService.${method}: "${name}" must be a string`);
  return value;
}

// undefined and null become null, never ""
function optionalString(method: string, name: string, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requireString(method, name, value);
}

// the JSON text of setPersistentConfiguration's options: a string unchanged, a plain object stringified; any other
// object, such as a Map, a Set, a Date or a class instance, would not stringify to the options it holds
function persistentConfigurationText(json: unknown): string {
  if (typeof json === 'string') return json;
  const prototype = (json !== null && typeof json === 'object') ? Object.getPrototypeOf(json) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('ApproovService.setPersistentConfiguration: "json" must be a string or a plain object');
  }
  const text = JSON.stringify(json);
  if (typeof text !== 'string') {
    throw new TypeError('ApproovService.setPersistentConfiguration: "json" has no JSON representation');
  }
  return text;
}

// runs the native call and turns its rejection into an ApproovError
async function call<T>(method: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw toApproovError(method, e);
  }
}

let warnedGetMessageSignature = false;

// the file form takes no comment and the explicit form a string account ID, so initialize(undefined, 'c') is a
// type error (and a TypeError at run time for untyped callers)
/**
 * Initializes Approov. With no arguments, or a null account ID, it reads the approov.config file bundled in the
 * app (the Android assets, the iOS main bundle) and initializes with its config and comment; the other options in
 * the file are applied once, by the call that first initializes Approov. With an account ID, and an optional
 * comment, it initializes with those and never reads the file. Calling it again after Approov is initialized with the
 * same values, from JavaScript or natively, resolves at once and keeps the configuration.
 *
 * @param accountId is the Approov account ID, or null or left out to read approov.config
 * @param comment is the initialization comment, or null or absent for none, and only with an account ID
 * @return a Promise that rejects with an ApproovError of type "initialization" if the SDK refuses the
 * values, or if approov.config is missing, unreadable, not valid or has no config
 */
function initialize(accountId?: null): Promise<void>;
/**
 * Initializes Approov with an account ID and an optional comment, never reading approov.config. Calling it again
 * with the same values, from JavaScript or natively, resolves at once and keeps the configuration.
 *
 * @param accountId is the Approov account ID, or "" for bypass mode
 * @param comment is the initialization comment, or null or absent for none
 * @return a Promise that rejects with an ApproovError of type "initialization" if the SDK refuses the values
 */
function initialize(accountId: string, comment?: string | null): Promise<void>;
async function initialize(accountId?: string | null, comment?: string | null): Promise<void> {
  if (accountId === undefined || accountId === null) {
    // the file form, where the comment comes from approov.config
    if (comment !== undefined && comment !== null)
      throw new TypeError('ApproovService.initialize: a comment needs an account ID, approov.config has its own');
    return call('initialize', () => Native.initialize(null, null));
  }
  const id = requireString('initialize', 'accountId', accountId);
  const c = optionalString('initialize', 'comment', comment);
  return call('initialize', () => Native.initialize(id, c));
}

export const ApproovService = {
  initialize,
  /** Whether Approov was initialized, even in bypass mode. */
  isApproovServiceEnabled(): Promise<boolean> {
    return call('isApproovServiceEnabled', () => Native.isApproovServiceEnabled());
  },
  /** Whether Approov protects requests (initialized with a valid account ID). */
  isApproovProtectionEnabled(): Promise<boolean> {
    return call('isApproovProtectionEnabled', () => Native.isApproovProtectionEnabled());
  },
  /**
   * Whether the hook that protects React Native's networking is installed: on Android, that the io.approov.gradle
   * weave protects OkHttpClientProvider; on iOS, that the universal URLSession interception is installed and
   * first. It reports the hook only, so it is true before initialize too, while requests still go out untouched;
   * isApproovProtectionEnabled tells whether they are protected.
   */
  isInterceptionInstalled(): Promise<boolean> {
    return call('isInterceptionInstalled', () => Native.isInterceptionInstalled());
  },

  async setTokenHeader(header: string, prefix?: string | null): Promise<void> {
    const h = requireString('setTokenHeader', 'header', header);
    const p = optionalString('setTokenHeader', 'prefix', prefix);
    return call('setTokenHeader', () => Native.setTokenHeader(h, p));
  },
  getTokenHeader(): Promise<string> {
    return call('getTokenHeader', () => Native.getTokenHeader());
  },
  getTokenPrefix(): Promise<string> {
    return call('getTokenPrefix', () => Native.getTokenPrefix());
  },
  /** Sets the TraceID header name, or turns the header off with null. */
  async setTraceIDHeader(header: string | null): Promise<void> {
    const h = optionalString('setTraceIDHeader', 'header', header);
    return call('setTraceIDHeader', () => Native.setTraceIDHeader(h));
  },
  getTraceIDHeader(): Promise<string | null> {
    return call('getTraceIDHeader', () => Native.getTraceIDHeader());
  },
  /** Sets the Approov-Status header name, or turns the header off with null. */
  async setStatusHeader(header: string | null): Promise<void> {
    const h = optionalString('setStatusHeader', 'header', header);
    return call('setStatusHeader', () => Native.setStatusHeader(h));
  },
  getStatusHeader(): Promise<string | null> {
    return call('getStatusHeader', () => Native.getStatusHeader());
  },
  /** Sets the header whose value is bound into the token, or removes the binding with null. */
  async setBindingHeader(header: string | null): Promise<void> {
    const h = optionalString('setBindingHeader', 'header', header);
    return call('setBindingHeader', () => Native.setBindingHeader(h));
  },
  getBindingHeader(): Promise<string | null> {
    return call('getBindingHeader', () => Native.getBindingHeader());
  },

  async addSubstitutionHeader(header: string, requiredPrefix?: string | null): Promise<void> {
    const h = requireString('addSubstitutionHeader', 'header', header);
    const p = optionalString('addSubstitutionHeader', 'requiredPrefix', requiredPrefix);
    return call('addSubstitutionHeader', () => Native.addSubstitutionHeader(h, p));
  },
  async removeSubstitutionHeader(header: string): Promise<void> {
    const h = requireString('removeSubstitutionHeader', 'header', header);
    return call('removeSubstitutionHeader', () => Native.removeSubstitutionHeader(h));
  },
  async addSubstitutionQueryParam(key: string): Promise<void> {
    const k = requireString('addSubstitutionQueryParam', 'key', key);
    return call('addSubstitutionQueryParam', () => Native.addSubstitutionQueryParam(k));
  },
  async removeSubstitutionQueryParam(key: string): Promise<void> {
    const k = requireString('removeSubstitutionQueryParam', 'key', key);
    return call('removeSubstitutionQueryParam', () => Native.removeSubstitutionQueryParam(k));
  },
  async addExclusionURLRegex(regex: string): Promise<void> {
    const r = requireString('addExclusionURLRegex', 'regex', regex);
    return call('addExclusionURLRegex', () => Native.addExclusionURLRegex(r));
  },
  async removeExclusionURLRegex(regex: string): Promise<void> {
    const r = requireString('removeExclusionURLRegex', 'regex', regex);
    return call('removeExclusionURLRegex', () => Native.removeExclusionURLRegex(r));
  },

  /**
   * Selects a standard mutator by name; null selects DEFAULT. A JavaScript choice replaces a mutator native
   * code installed, as the last write, and the layer logs a warning when that was an app's own mutator.
   */
  async setServiceMutator(name: ServiceMutatorName | null): Promise<void> {
    if (name !== null && name !== undefined && (typeof name !== 'string' || !MUTATORS.includes(name))) {
      throw new TypeError(`ApproovService.setServiceMutator: the mutator must be one of ${MUTATORS.join(', ')} or null`);
    }
    const n = name ?? null;
    return call('setServiceMutator', () => Native.setServiceMutator(n));
  },
  /** The installed mutator, whichever side installed it; DEFAULT is reported as the mutator it points to. */
  async getServiceMutator(): Promise<InstalledServiceMutator> {
    return (await call('getServiceMutator', () => Native.getServiceMutator())) as InstalledServiceMutator;
  },

  /** Switches message signing on with the layer's default factory, overridden by the given options. */
  async enableMessageSigning(options?: SigningOptions): Promise<void> {
    const o = validateSigningOptions(options);
    return call('enableMessageSigning', () => Native.enableMessageSigning(o));
  },
  /** Gives one host its own options, starting from the layer's default; null removes them. */
  async setMessageSigningHostOptions(hostName: string, options: SigningOptions | null): Promise<void> {
    const h = requireString('setMessageSigningHostOptions', 'hostName', hostName);
    const o = options === null ? null : validateSigningOptions(options);
    return call('setMessageSigningHostOptions', () => Native.setMessageSigningHostOptions(h, o));
  },
  disableMessageSigning(): Promise<void> {
    return call('disableMessageSigning', () => Native.disableMessageSigning());
  },
  isMessageSigningEnabled(): Promise<boolean> {
    return call('isMessageSigningEnabled', () => Native.isMessageSigningEnabled());
  },

  async setLoggingLevel(level: LoggingLevel): Promise<void> {
    if (typeof level !== 'string' || !LOGGING_LEVELS.includes(level)) {
      throw new TypeError(`ApproovService.setLoggingLevel: the level must be one of ${LOGGING_LEVELS.join(', ')}`);
    }
    return call('setLoggingLevel', () => Native.setLoggingLevel(level));
  },
  async setDevKey(devKey: string): Promise<void> {
    const k = requireString('setDevKey', 'devKey', devKey);
    return call('setDevKey', () => Native.setDevKey(k));
  },

  getDeviceID(): Promise<string> {
    return call('getDeviceID', () => Native.getDeviceID());
  },
  /**
   * The current time in milliseconds since the epoch, corrected to the Approov servers' clock; message signatures
   * take their created and expires times from it. Needs Approov SDK 3.7.0; with an earlier SDK it is the device clock.
   */
  getServerAdjustedCurrentTimeMS(): Promise<number> {
    return call('getServerAdjustedCurrentTimeMS', () => Native.getServerAdjustedCurrentTimeMS());
  },
  async setDataHashInToken(data: string): Promise<void> {
    const d = requireString('setDataHashInToken', 'data', data);
    return call('setDataHashInToken', () => Native.setDataHashInToken(d));
  },
  async fetchToken(url: string): Promise<string> {
    const u = requireString('fetchToken', 'url', url);
    return call('fetchToken', () => Native.fetchToken(u));
  },
  async fetchSecureString(key: string, newDef?: string | null): Promise<string | null> {
    const k = requireString('fetchSecureString', 'key', key);
    const d = optionalString('fetchSecureString', 'newDef', newDef);
    return call('fetchSecureString', () => Native.fetchSecureString(k, d));
  },
  async fetchCustomJWT(payload: string): Promise<string | null> {
    const p = requireString('fetchCustomJWT', 'payload', payload);
    return call('fetchCustomJWT', () => Native.fetchCustomJWT(p));
  },
  async getAccountMessageSignature(message: string): Promise<string | null> {
    const m = requireString('getAccountMessageSignature', 'message', message);
    return call('getAccountMessageSignature', () => Native.getAccountMessageSignature(m));
  },
  async getInstallMessageSignature(message: string): Promise<string | null> {
    const m = requireString('getInstallMessageSignature', 'message', message);
    return call('getInstallMessageSignature', () => Native.getInstallMessageSignature(m));
  },
  /** @deprecated Use getAccountMessageSignature. */
  async getMessageSignature(message: string): Promise<string | null> {
    if (!warnedGetMessageSignature) {
      warnedGetMessageSignature = true;
      console.warn('ApproovService.getMessageSignature is deprecated: use getAccountMessageSignature');
    }
    return ApproovService.getAccountMessageSignature(message);
  },
  getLastARC(): Promise<string> {
    return call('getLastARC', () => Native.getLastARC());
  },
  async setInstallAttributes(attrs: string): Promise<void> {
    const a = requireString('setInstallAttributes', 'attrs', attrs);
    return call('setInstallAttributes', () => Native.setInstallAttributes(a));
  },

  /**
   * Stores approov.config options that apply over the bundled approov.config from the next launch, such as options
   * delivered with an over-the-air update. Nothing changes in the running process: the options are
   * applied by the file form of initialize (initialize() with no account ID, or the native initialization of the
   * Expo config plugin) at the next launch, and never by initialize(accountId, comment). Each key replaces the same
   * key of the bundled file whole, so a list or object replaces the bundled one. Every key is allowed but config,
   * comment and devKey; a known key with a bad value rejects and nothing is stored, while an unknown key is stored
   * and ignored when applied. The options are dropped at the first launch after the app version or the bundled
   * approov.config changes, so a store release starts from its own bundled file.
   *
   * Call setPersistentConfiguration or clearPersistentConfiguration at startup in every JavaScript bundle you ship,
   * so that a rollback to the bundle embedded in the app clears options an update stored. Calls are applied in the
   * order they are made, awaited or not, as the native bridge runs them one after another on a serial queue.
   * Whoever can change your JavaScript bundle can change these options, so sign your over-the-air updates (EAS
   * Update code signing).
   *
   * @param json is the options as a plain object, or as its JSON text, of at most 64 KiB
   * @param source is a tag naming where the options came from, such as the update ID, or null or absent for none
   * @return a Promise that rejects with an ApproovError of type "general" naming the cause, never a value, if the
   * options are not valid or cannot be stored, and with a TypeError if json is neither a string nor a plain object
   */
  async setPersistentConfiguration(
    json: string | Record<string, unknown>,
    source?: string | null,
  ): Promise<void> {
    const j = persistentConfigurationText(json);
    const s = optionalString('setPersistentConfiguration', 'source', source);
    return call('setPersistentConfiguration', () => Native.setPersistentConfiguration(j, s));
  },
  /**
   * Deletes the options stored by setPersistentConfiguration, so the bundled approov.config alone applies from the
   * next launch. Nothing changes in the running process, and it is not an error if none are stored.
   *
   * @return a Promise that rejects with an ApproovError of type "general" if the stored options cannot be deleted
   */
  clearPersistentConfiguration(): Promise<void> {
    return call('clearPersistentConfiguration', () => Native.clearPersistentConfiguration());
  },
  /**
   * Gets the source tag stored with the options of setPersistentConfiguration. This is what is stored, which may
   * only apply from the next launch, not what is in force in the running process.
   *
   * @return a Promise of the source, or null if no options are stored or they were stored without one
   */
  getPersistentConfigurationSource(): Promise<string | null> {
    return call('getPersistentConfigurationSource', () => Native.getPersistentConfigurationSource());
  },
};
