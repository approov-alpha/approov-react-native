# Approov Expo Config Plugin

Add the plugin to your Expo app config and run `expo prebuild`. Then the generated Android and iOS projects contain the universal Approov packages. These packages initialize natively at app start from an `approov.config` file, before React Native starts.

Each request that your app sends to a domain you added to Approov then carries an Approov token that your backend can verify. The request goes over a validated TLS connection. The package validates it against the Managed Trust Roots Approov maintains for your account, or against the certificate public keys configured for the domain.

- On Android, the `io.approov.gradle` build plugin covers OkHttp, `HttpsURLConnection`, Volley and Cronet (react-native-nitro-fetch included).
- On iOS, the package covers each `URLSession` that the app creates, except background sessions. The package installs its interception when it loads, so this includes the sessions created before initialization.

The plugin targets the 3.7.0 universal packages: `io.approov:service.android` with its Gradle plugin, and `approov-service-ios`. The plugin is part of `@approov/approov-react-native`, the Approov Package for React Native, which uses those packages. The READMEs of those packages tell what the packages do after installation. This page tells only what the plugin adds and how to set up the plugin. The plugin configures Approov only through `approov.config`: your own file, or a file that it generates from your account ID (see [configuration](#configuration)).

## REQUIREMENTS

- React Native 0.82 or later, with Continuous Native Generation (`expo prebuild`). With Expo, this means SDK 55 or later.
- Android: Groovy Gradle files (`build.gradle`, as Expo generates them). For the build, Android Gradle Plugin 8.6 or later and JDK 17 or later. At run time, Android 6.0 (API 23) or later.
- iOS: iOS 15 or later, Xcode 16 or later (the iOS package builds with Swift 6), CocoaPods.
- **Published artifacts.** The defaults fetch these artifacts:
  - `io.approov:service.android` and `io.approov:service.android-gradle-plugin` from Maven Central
  - the `approov-ios-sdk` and `approov-service-ios` pods from GitHub at a tag (these pods are not published to CocoaPods trunk)
- **One Approov layer for each platform.** Do not install this package together with `@approov/approov-service-react-native` (the 3.5.x package). Each package brings its own Approov layer, and two layers in one app conflict. Remove the 3.5.x package first.

## INSTALLING

```sh
npx expo install @approov/approov-react-native
```

The plugin loads `expo/config-plugins`, which each Expo app has through its `expo` dependency. The plugin does not need a hoisted `@expo/config-plugins`. Thus it works with npm, Yarn classic, Yarn berry (including Plug'n'Play) and pnpm (isolated `node_modules`). `expo` is an optional peer dependency (`>=55.0.0`). Thus a bare React Native app that does not use Expo does not have to install it.

Add the plugin with your Approov account ID to `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["@approov/approov-react-native", { "accountId": "<your-approov-account-id>" }]
    ]
  }
}
```

or to `app.config.js`:

```js
export default ({ config }) => ({
  ...config,
  plugins: [
    [
      '@approov/approov-react-native',
      {
        // your Approov account ID, from your onboarding email or "approov sdk -getConfigString"
        accountId: '<your-approov-account-id>',
      },
    ],
  ],
});
```

Then generate the native projects:

```sh
npx expo prebuild
```

Your account ID is in your onboarding email. The Approov CLI also gives it at any time (the CLI calls it the SDK config string):

```sh
approov sdk -getConfigString
```

It looks like `#your-account#p6nZ...=`. It is the same for each app in your account and is not a secret. Thus you can keep it in your app config and in source control. To keep it out of the config, do not set `accountId`. Set the `APPROOV_ACCOUNT_ID` environment variable when you run `expo prebuild`. In both cases, the full value must arrive intact, punctuation included. To also set options, put them in an `approov.config` in the project and do not put `config` in that file. The plugin adds the account ID to each `approov.config` that it writes (see [configuration](#configuration)).

## OPTIONS

| Option | Default | What it does |
| :--- | :--- | :--- |
| `accountId` | the `APPROOV_ACCOUNT_ID` environment variable at prebuild | Your Approov account ID. It is the `config` of each `approov.config` that the plugin writes. The plugin adds it to each of your files that has no `config`. If the project has no file, the plugin puts it in the file that it generates. The plugin removes whitespace before and after the value. While `nativeInitialize` is true, prebuild fails if there is no account ID and no `approov.config`. Prebuild fails if a file has a different `config` (see [configuration](#configuration)). |
| `comment` | none | The initialization comment. The plugin gives it to the Approov SDK unchanged, for example `options:...` startup flags (see [SDK initialization options](https://docs.approov.io/direct-sdk-integration/initialization-options/#sdk-initialization-options)). The plugin adds it to each of your `approov.config` files that has no `comment`, or to the generated file. An empty string is a comment. It is different from no comment. The plugin rejects control characters. Prebuild fails if a file has a different `comment`. A 3.5.x file cannot take a comment. |
| `nativeInitialize` | `true` | Inserts the guarded native initialization in `MainApplication` and the Swift `AppDelegate`. With `false`, the plugin still adds the packages, the permissions and the `approov.config` (if there is one). Your app then initializes from JavaScript. |
| `android.version` | `3.7.0` | The version of both `io.approov:service.android` and the Gradle plugin `io.approov:service.android-gradle-plugin`. They are released together and must agree. Thus one option sets both. Only an exact version. The plugin rejects `+` and `latest.`. |
| `android.repositories` | `["mavenCentral"]` | The source of both artifacts: `mavenCentral`, `mavenLocal`, `google`, `gradlePluginPortal`, an `https://` URL, or a local Maven repository directory (relative to the project root). A directory in the project is supported, and the plugin gives no warning for it. An example is a committed vendor folder (see [installing from a vendor folder](#installing-from-a-vendor-folder)). A directory outside the project is only for local development. `mavenLocal`, URL and directory repositories are limited to the group `io.approov`. The plugin does not add again a `mavenCentral`, `google` or `gradlePluginPortal` that the template already has. |
| `android.gradlePluginPath` | none | Only for local development. An `approov-gradle-plugin` source directory. The plugin includes it in the build with `includeBuild`, in place of the published Gradle plugin. |
| `android.cronetDependencyPackages` | the default of the Gradle plugin, `["com.margelo.nitro.nitrofetch"]` | Dependency packages whose Cronet engine creation the Gradle plugin protects. `[]` limits the protection to the classes of your app. |
| `android.sdkVersion` | none | Only for local development. The exact version of `io.approov:approov-android-sdk`, the Approov SDK, in each module. The plugin sets it with a dependency substitution in `android/build.gradle`. It replaces the version that `io.approov:service.android` depends on. Example: a version installed in Maven Local, with `mavenLocal` in `android.repositories`. Only an exact version. The plugin rejects `+` and `latest.`. |
| `ios.version` | `3.7.0` | The git tag of `approov-service-ios`. Do not use together with `ios.podPath`. |
| `ios.sdkVersion` | `3.7.0` | The git tag of `approov-ios-sdk`, the Approov SDK pod that the iOS package depends on. It must agree with the podspec of the iOS package. For `approov-service-ios` 3.7.0, the podspec requires exactly `3.7.0`. If the tag does not agree, `pod install` fails. Do not use together with `ios.sdkPodPath`. |
| `ios.podPath` | none | An `approov-service-ios` folder (with its podspec). The plugin uses it as a `:path` pod, in place of the GitHub tag. A folder in the project is supported, and the plugin gives no warning for it. An example is a committed vendor folder (see [installing from a vendor folder](#installing-from-a-vendor-folder)). A path outside the project is only for local development. |
| `ios.sdkPodPath` | none | Only for local development. An `approov-ios-sdk` directory (with `approov-ios-sdk.podspec`). The plugin uses it as a `:path` pod, in place of the GitHub tag. The plugin reads the version of the pod from that podspec (a literal `version`). If the plugin cannot read it, prebuild fails. The plugin sets `ENV['APPROOV_IOS_SDK_VERSION']` to this version at the top of the Podfile. The `approov-service-ios` 3.7.0 podspec reads that variable for its SDK version. Thus `pod install` resolves the iOS package against the local SDK. After you change the version of the local SDK, `pod install` may keep a cached podspec. Then run `pod install --repo-update` or `pod cache clean approov-ios-sdk`, or prebuild with `--clean`. Do not use together with `ios.sdkVersion`. |

Unknown options and malformed values make the prebuild and `expo config` fail, with a message that names the option. The plugin checks the account ID and `approov.config` only when it generates native files. Thus `expo config`, `expo start`, EAS Update and the `expo-constants` build step work without them.

The plugin applies the local development options only when you set them. A path that does not exist makes the config fail. If you set local development options, prebuild writes a warning once for each platform, and names each option that is set: `android.sdkVersion`, `android.gradlePluginPath`, a `mavenLocal` or directory repository, `ios.podPath`, `ios.sdkPodPath`. When `EAS_BUILD` is set, the warning says this explicitly. The warning does not make the build fail.

A directory repository or `ios.podPath` in the project root is a vendored artifact committed with the project (see [installing from a vendor folder](#installing-from-a-vendor-folder)). The warning does not name it. The warning names a directory repository or `ios.podPath` outside the project root. Remove the other local development options before a release or an EAS build. The paths and Maven Local exist only on your machine. Thus they do not work on EAS, unless what they name is committed in the project.

## WHAT THE PLUGIN CHANGES

Each insertion is between `@generated begin approov-...` and `@generated end approov-...` markers. A later prebuild replaces it. When you remove an option, the plugin removes what the option added. Two prebuilds give identical files.

| File | Change |
| :--- | :--- |
| `android/settings.gradle` | `includeBuild(...)` of the local Gradle plugin, only with `android.gradlePluginPath` |
| `android/build.gradle` | `classpath("io.approov:service.android-gradle-plugin:<android.version>")` in `buildscript`. The configured repositories in `buildscript` and `allprojects`. With `android.sdkVersion`, a dependency substitution of `io.approov:approov-android-sdk` in `allprojects`. |
| `android/app/build.gradle` | `apply plugin: "io.approov.gradle"` on the line after `com.android.application`. `implementation("io.approov:service.android:<android.version>") { exclude group: "com.squareup.okhttp3" }` (see [OkHttp](#okhttp)). An `approov { cronetDependencyPackages = [...] }` block when that option is set. |
| `AndroidManifest.xml` | The `INTERNET` and `ACCESS_NETWORK_STATE` permissions. The plugin removes the meta-data `io.approov.ACCOUNT_ID` and `io.approov.INIT_COMMENT` if they are present. |
| `android/app/src/<sourceSet>/assets/approov.config` | the `approov.config` for each source set (see [configuration](#configuration)) |
| `MainApplication.kt` or `.java` | the guarded initialization immediately after `super.onCreate()` |
| `ios/Podfile` | With `ios.sdkPodPath`, `ENV['APPROOV_IOS_SDK_VERSION'] = '<its version>'` at the top. In the app target, `pod 'approov-ios-sdk', :git => ..., :tag => '<ios.sdkVersion>'` (or `:path` with `ios.sdkPodPath`) and `pod 'approov-service-ios', :git => ..., :tag => '<ios.version>'` (or `:path` with `ios.podPath`). |
| `Info.plist` | The plugin removes `ApproovAccountID` and `ApproovInitComment` if they are present. |
| `ios/approov/<Target>/approov.config` and the Xcode project | The `approov.config` for each target, added to the Copy Bundle Resources of the target in an `approov` group. |
| `AppDelegate.swift` | `import ApproovService` and the guarded initialization as the first statements of `application(_:didFinishLaunchingWithOptions:)` |

The plugin copies your `approov.config` files byte for byte. It adds `config` and `comment` from the options to a file that does not have them (see [configuration](#configuration)). Generated and merged files are JSON. Thus the account ID and comment reach the app exactly as you configured them. The plugin never writes the account ID into source code.

The plugin records the files that it wrote, copied, merged or generated, with a hash of each. The records are in `android/.approov-config-files.json` and `ios/.approov-config-files.json`.

- A later prebuild updates these files when their source or the options change.
- When you remove a source file, the plugin removes the file that it wrote, and the directories that become empty.
- The plugin never overwrites or removes a file that changed after the plugin wrote it. Prebuild fails when that file would change, and writes a warning when its source is missing.
- The plugin never overwrites or removes an `approov.config` that it did not write. An example is a file put there manually in a project without Continuous Native Generation. The plugin keeps an identical file as it is. A different file makes the prebuild fail. Then remove that file, or the source.
- The plugin uses from the record files only paths where the plugin writes.
- Prebuild also fails when an iOS target already has an `approov.config` resource that the plugin did not add (the 3.5.x layout). Remove the resource from the target and move its content to the `approov.config` of the project.

If you commit `android/` and `ios/`, commit the record files with them.

## OKHTTP

The universal Android package `io.approov:service.android` brings OkHttp 5 for native apps. A React Native app keeps the OkHttp 4 of React Native. React Native 0.82 to 0.87 declare OkHttp 4.9.2, and much of the React Native ecosystem is built on it. Thus the plugin declares the package with OkHttp excluded:

```groovy
implementation("io.approov:service.android:<android.version>") {
    exclude group: "com.squareup.okhttp3"
}
```

The exclusion removes the OkHttp of the package and its OkHttp BOM constraint. The Approov SDK works on the OkHttp 4 of React Native. The exclusion applies only to its own declaration. Thus, do not add a different line that brings `io.approov:service.android` without the same exclusion (for example in a library module of your app). That line brings OkHttp 5 back for the full app.

An app that wants OkHttp 5 (for its fast fallback between IPv6 and IPv4 addresses) can opt in. Declare these two lines in the `android/app/build.gradle` of the app. They move all OkHttp artifacts together:

```groovy
implementation(platform("com.squareup.okhttp3:okhttp-bom:5.3.2"))
implementation("com.squareup.okhttp3:okhttp")
```

Do not set only `okhttp` to a different major version. If you do, the cookie support of React Native crashes on the second launch.

Do not opt in if the app uses `@expo/ui`. Its image loader calls `Call.await()` from `expo-modules-core` (Expo SDK 57). This calls an OkHttp 4 internal that OkHttp 5 removed. On OkHttp 5, the app crashes with `NoClassDefFoundError: Failed resolution of: Lokhttp3/internal/Util;` when an `Image` changes its remote source, or unmounts, while its response arrives. R8 does not report the missing class, because the rules of React Native contain `-dontwarn okhttp3.**`.

Each other module that calls `await()` from `expo-modules-core` has the same risk.

## INITIALIZATION

**Native.** By default, the plugin initializes Approov in `Application.onCreate` and `application(_:didFinishLaunchingWithOptions:)`, before React Native starts. Thus no request from JavaScript or a native library goes out before initialization. The inserted code calls the file form of `ApproovService.initialize` inside a guard (`initialize(this)` on Android, `initialize()` on iOS). This call reads `approov.config` from the assets or the main bundle of the app.

Initialization fails in these cases:

- The file is missing, the package cannot read it, or it is not valid.
- The account ID in the file is not complete and unaltered. The Approov SDK then rejects it.

In these cases, the code logs the problem (only the class of the exception, never a value). Then it initializes with an empty account ID. The app starts in **bypass mode**, without Approov protection, and your backend stays the enforcement point. Then the code logs both state flags. Look for this line:

```
ApproovInit: Approov service enabled=true protection enabled=true
```

`protection enabled=false` means bypass mode. The native initialization applies the options in `approov.config` and nothing else.

**JavaScript as well.** One app process has one Approov service state. It does not matter which language calls `initialize`. With the plugin, call `ApproovService.initialize()` from JavaScript with no account ID. This is the file form, which reads the same `approov.config`. Thus, after the native initialization, it resolves immediately and changes nothing. Both flags are already true, and the package keeps the configuration. After `await ApproovService.initialize()`, the app configures Approov from JavaScript.

An explicit account ID and comment also work, but they must then agree exactly with `approov.config`. The Approov SDK rejects a different account ID or comment, including no comment against an empty comment. The error reaches the second caller as a rejected promise, and the native initialization stays in effect. Thus a rejection here does not mean that Approov is off. Check the protection state before you block requests because of the rejection.

**JavaScript only.** With `nativeInitialize: false`, nothing is initialized natively. Do these steps:

1. Call `initialize` from JavaScript before the first request.
2. Await it.
3. Configure.

A request made before `initialize` goes out without Approov protection. `initialize()` with no account ID reads the `approov.config` that the plugin still writes.

## CONFIGURATION

The plugin configures Approov only through `approov.config`. This is a JSON file that the universal packages read when they are initialized without an account ID. It names the account ID (`config`). Optionally, it also names the comment and the settings to apply at that initialization. Thus these settings are in force before the first request:

```json
{
  "config": "<your-approov-account-id>",
  "tokenHeader": { "name": "Authorization", "prefix": "Bearer " },
  "logLevel": "INFO"
}
```

The keys are `config`, `comment`, `devKey`, `tokenHeader`, `traceIDHeader`, `statusHeader`, `bindingHeader`, `mutator`, `messageSigning`, `logLevel`, `substitutionHeaders`, `substitutionQueryParams` and `exclusionURLRegexes`. Their names come from the setters. With `"mutator": "CLOSE_FAILURE"`, the package fails a request to a protected domain when its token fetch fails. `"messageSigning": false` turns off message signing, which is on by default. The [key table in REFERENCE.md](../REFERENCE.md#approovconfig) describes each key. A 3.5.x `approov.config` (only the account ID on its first line that is not blank) continues to work, without options.

The plugin takes the file from these locations, for each platform:

- `approov.config` in the project root. The plugin copies it to the assets of the Android `main` source set, and adds it to the iOS app target.
- For each variant:
  - The plugin copies `approov/android/<sourceSet>/approov.config` to `android/app/src/<sourceSet>/assets/`. The source set is a flavor, a build type such as `debug`, or a variant. Gradle selects the most specific file.
  - The plugin adds `approov/ios/<Target>/approov.config` to that Xcode target. The target must exist.
  - A file for a variant replaces the root file for that variant. Thus it must hold the full configuration.
  - Source set names are case-sensitive and start with a lowercase letter (`debug`, `freeDebug`). Prebuild fails on all other names. Prebuild also fails on a name that is different from `main`, or from a directory in `android/app/src/`, only in case.
  - Prebuild writes a warning for a variant directory without `approov.config`.
  - Keep a `devKey` only in the file of a development variant. A `devKey` in the root file ships in release builds, and the plugin writes a warning.
- A generated file. This applies when `accountId` or `APPROOV_ACCOUNT_ID` is set, and there is no file for `main` or the app target (no root file, no `approov/android/main/` or `approov/ios/<AppTarget>/`). Then the plugin generates `{"config": ..., "comment": ...}` there. It also does this when variants have their own files. Thus a build without its own file is also protected. Without the account ID and with only variant files, `main` and the app target receive no file. Then the plugin writes a warning that such a build initializes in bypass mode.

In each file that the plugin writes for either platform, the plugin adds these keys:

- `"config"`, when `accountId` or `APPROOV_ACCOUNT_ID` is set and the file has no `config`
- `"comment"`, when `comment` is set and the file has no `comment`

The added keys come first. The plugin keeps the rest of the file as you wrote it, unknown keys included. The plugin uses unchanged a file whose `config` or `comment` is equal to the option.

These files make the prebuild fail:

- A file whose `config` is different from the account ID, or whose `comment` is different from the `comment` option. The message names the file and the option or environment variable, never the values.
- A 3.5.x file that does not agree with the options. A 3.5.x file takes nothing. Its line must be equal to the account ID, and it cannot take the `comment` option.
- A file without `config`, when the account ID is not set.
- A root file together with `approov/android/main/` or the own file of the app target. These are two files for one location.

The prebuild checks each file as strictly as the universal packages read it. It fails on these problems, and names the file and the cause but never its content:

- JSON that is not valid. This includes nesting deeper than 128, a lone surrogate escape, a number out of range for a double, and Unicode whitespace before the opening brace.
- a duplicate key
- a top level that is not an object (content that starts with `[` is never a 3.5.x file)
- a file larger than 1 MiB
- a missing `config`
- a known key of the wrong type (this includes a list with an element of the wrong type)

The prebuild writes a warning for an unknown key, also in `tokenHeader`. It also writes a warning for a value that the packages skip at run time (an unknown `mutator` or `logLevel`, an empty name).

The build configurations in one iOS target share its resources. Thus they share one `approov.config`. Give each variant its own target, or copy the file in a Run Script build phase of your own.

Your app makes the settings that `approov.config` does not hold after initialization, from JavaScript or natively. An example is the stale protection refresh period on Android. From JavaScript, await `initialize()` with no account ID, and configure immediately after it. This call reads the same `approov.config`. It resolves immediately when the native initialization already ran.

```js
import { ApproovService } from '@approov/approov-react-native';

// the file form: resolves at once after the plugin's native initialization from approov.config
await ApproovService.initialize();
// then configure, before the app issues protected requests; only the settings your app uses, for example:
await ApproovService.setTokenHeader('Authorization', 'Bearer ');
```

`initialize` never resets configuration, and the package keeps configuration made before `initialize`. But the documented pattern is: initialize, then configure.

**Requests before your configuration.** Native initialization runs before React Native starts. Thus no request goes out before initialization, and the settings in `approov.config` apply from initialization. But the package can still process a request before a configuration call of your app runs. Such a request uses the settings in force at that moment. For all settings that `approov.config` does not set, these are the defaults:

- the `DEFAULT` service mutator (`ALWAYS_PROCEED` in 3.7.0), so each request proceeds
- the `Approov-Token` header with no prefix, and the `Approov-TraceID` and `Approov-Status` headers
- no binding header
- no exclusions
- no substitutions (thus a secure string placeholder goes out unchanged)
- message signing on, with the install and the account signature
- logging at `INFO`

A configuration change applies only to requests that the package processes after the call. The package does not process again a request that is already in progress. Connection validation does not depend on this order. The trust roots and keys come from the configuration of the Approov SDK and apply from initialization. These requests can run before your configuration call:

- Native code at startup. Examples are an update check by expo-updates, react-native-nitro-fetch `prefetchOnAppStart`, native SDKs, and Android headless JS tasks. On Android, `prefetchOnAppStart` is not supported with protected endpoints (see the ADVANCED.md of the Android package).
- JavaScript modules that fetch when they are imported.

Put in `approov.config` the settings that startup requests need. Configure the other settings immediately after `initialize`, before the app sends protected requests.

## THE JAVASCRIPT API

The JavaScript API of the package, `ApproovService`, configures Approov after the native initialization of the plugin. Do these steps:

1. Await `initialize()` with no account ID. It reads the same `approov.config` and resolves immediately.
2. Make your configuration calls.

Each method is in the [REFERENCE.md](../REFERENCE.md) of the package. The order of initialization and configuration is in [ADVANCED.md](../ADVANCED.md#initialize-then-configure). Native configuration through the `ApproovService` of the universal packages also works. Both sides share one configuration.

## EAS BUILD

- EAS Build runs `expo prebuild` on its servers. Thus the configuration must be available there. Do one of these:
  - Commit `approov.config` (and `approov/`) to the project.
  - Keep `accountId` in the app config.
  - Define `APPROOV_ACCOUNT_ID` as an EAS environment variable for the build profile.
- The recommended setup: define `APPROOV_ACCOUNT_ID` for each build profile. For example, use a development account for `development` and your production account for `production`. Commit the settings that the profiles share in an `approov.config` without `config`. The plugin adds the account ID of each profile to that file. The build fails at prebuild if a committed file has a `config` that is different from the `APPROOV_ACCOUNT_ID` of the profile. A broken `approov.config` also makes the build fail.
- EAS fetches the published artifacts. `android.version` must be on Maven Central, and the `ios.version` and `ios.sdkVersion` tags must be on GitHub. The local development options do not work on EAS, unless what they name is committed in the project. These options are `mavenLocal`, directory repositories, `-local` versions, `android.sdkVersion` with an SDK only in Maven Local, `android.gradlePluginPath`, `ios.podPath` and `ios.sdkPodPath`. A directory repository or `ios.podPath` in the project root is committed with the project and works on EAS.
- EAS Update needs no account ID. Native initialization ships with the binary.

## INSTALLING FROM A VENDOR FOLDER

Approov may give you a release of the three packages as one folder, in the release asset `approov-vendor-<release>.tar.gz`. The folder holds these items:

- `approov-react-native-<version>.tgz`, the npm package
- `android/maven/`, a Maven repository with `io.approov:service.android` and its Gradle plugin
- `ios/approov-service-ios/`, the pod folder of `approov-service-ios`
- `VERSIONS`, the version of each package and of the Approov SDK

The examples below use the folder name `approov-vendor`. Do these steps:

1. Download the `approov-vendor-<release>.tar.gz` asset.
2. Extract it in the project root.
3. Set the dependency in `package.json`:

   ```json
   "@approov/approov-react-native": "file:./approov-vendor/approov-react-native-<version>.tgz"
   ```

4. Add these options to the plugin entry in your app config, with the `io.approov:service.android` version from `VERSIONS`:

   ```json
   ["@approov/approov-react-native", {
     "android": { "version": "<version>", "repositories": ["mavenCentral", "./approov-vendor/android/maven"] },
     "ios": { "podPath": "./approov-vendor/ios/approov-service-ios" }
   }]
   ```

5. Run `npm install`. This updates the integrity of the tarball in the lockfile.
6. Commit the folder and the lockfile.

The paths point to the folder in your project. Thus prebuild writes no warning and EAS Build works.

- Make sure that no `.gitignore` or `.easignore` pattern excludes the folder, for example `*.tgz`, or `android/` or `ios/` without a leading slash.
- After you replace the folder, run `npm install` again before you commit.
- To use the published packages, remove the folder and those options.

## NOT SUPPORTED

- **Objective-C AppDelegate** (Expo SDK 52 and earlier): the universal iOS package has an API only for Swift. Thus prebuild fails with a message, unless `nativeInitialize` is `false`. Upgrade to Expo SDK 53 or later, or call `ApproovService.initialize` from Swift yourself.
- **Kotlin DSL Gradle files** (`build.gradle.kts`): prebuild fails and names the file.
- A `MainApplication` without `super.onCreate()` in `onCreate()`, or an `AppDelegate` without `application(_:didFinishLaunchingWithOptions:)`: prebuild fails, so that it does not leave the app uninitialized.

## TROUBLESHOOTING

| Symptom | Cause and fix |
| :--- | :--- |
| prebuild: `the Approov account ID is missing` | Do one of these: add `approov.config` to the project root (or for each variant of that platform). Set `accountId`. Set `APPROOV_ACCOUNT_ID` for the prebuild (on EAS, as an EAS environment variable). Set `nativeInitialize: false`. |
| prebuild: `approov.config has a "config" different from ...` or `has a "comment" different from ...` | The file does not agree with the option or environment variable that the message names. Make them equal, or remove one. Usually, remove `config` from the file. Then the account ID comes from `accountId` or `APPROOV_ACCOUNT_ID` (on EAS, from the environment of the build profile). |
| prebuild: `approov.config is a 3.5.x configuration file, which has no "comment"` | Write the file as JSON, `{"config": ...}`, so that the plugin can add the `comment` option. Or remove the option. |
| prebuild: `approov.config is not valid JSON`, `has the key ... twice`, `has no "config"`, `has a wrong type for ...` | Fix the file that the message names. A file without `config` needs `accountId` or `APPROOV_ACCOUNT_ID`. |
| prebuild: `... was changed after the plugin wrote it` | Somebody edited a file that the plugin wrote under `android/` or `ios/`. Make the change in the `approov.config` of the project, and remove the edited file. |
| prebuild: `the Xcode project has no target` | Rename `approov/ios/<Target>/` to a target that exists. |
| prebuild: `... exists and was not written by the plugin` | An `approov.config` with different content was put manually where the plugin writes. Remove it, or remove the source. |
| prebuild: `the Xcode target ... already has an approov.config resource` | A resource from the 3.5.x layout. Remove it from the target and move its content to the `approov.config` of the project. |
| prebuild: `... is not a Gradle source set name` or `differs ... only in case` | Rename the directory under `approov/android/` to the exact, case-sensitive source set name. |
| prebuild: `"accountId" is still the placeholder` | Replace `<your-approov-account-id>` with your account ID. |
| prebuild: `unterminated generated block` | Somebody edited a generated block manually. Run `npx expo prebuild --clean`. |
| Gradle: `Approov version mismatch` | Something in the app resolves a version of `io.approov:service.android` that is different from `android.version`. Make the versions agree. |
| `pod install` cannot find a tag | No published tag matches `ios.version` or `ios.sdkVersion`. Set a published version. For local development, use `ios.podPath` or `ios.sdkPodPath`. |
| `pod install` during prebuild: `Unicode Normalization not appropriate for ASCII-8BIT` | CocoaPods needs a UTF-8 locale. Run prebuild with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` set, or set them in your shell profile. |
| Android debug build of an Expo development client: `ASM Instrumentation process wasn't able to resolve some classes ... io.approov.service.android.cronet.ApproovCronetEngineBuilder` | Harmless. No action is necessary. The Approov Gradle plugin weaves Cronet in react-native-nitro-fetch and copies the stack map frames. Only in debug builds, the network inspector of the Expo dev launcher tells the Android Gradle Plugin to calculate the frames again. That step cannot load the Approov class from the transform classpath of the library module. Release builds do not show the message. The debug app runs normally, because D8 does not use these frames. |
| iOS debug build of an Expo development client: `isInterceptionInstalled()` is false, and the log says `EXRequestInterceptorProtocol` is ahead of `ApproovURLProtocol` | Only in debug builds, the Expo network inspector puts its own `URLProtocol` in front of the Approov `URLProtocol` when a project loads. Requests are still protected, and release builds return true. In debug builds, do not make app behaviour depend on this value. See [development builds](../ADVANCED.md#development-builds-and-development-servers). |
| prebuild warning: `local development option set` or `local development options set` | One of the local development options is in the app config. Remove it before a production or EAS build. |
| Duplicate classes, or two Approov layers that write logs | `@approov/approov-service-react-native` (the 3.5.x package) is still installed. Remove it. |
| Log: `Approov initialization failed (<exception class>)` | `approov.config` is missing from this build (a variant without its own file), or its account ID did not reach the SDK intact. Compare the file with the output of `approov sdk -getConfigString`, and run prebuild again. The app is in bypass mode. |
| JavaScript `initialize` rejected after a native initialization | The account ID or comment is different from the one that the plugin used. See [initialization](#initialization). |
| A startup request went out with a placeholder, the default token header, or signatures that your configuration turns off | The package processed the request before your configuration call ran. Thus the request used the defaults. Put that setting in `approov.config` (see [configuration](#configuration)). |
