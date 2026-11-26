# Reference

## JavaScript API

```ts
import { ApproovService, ApproovError, isApproovError, ApproovProvider, useApproov } from '@approov/approov-react-native';
```

The package also exports the class [`SigningOptionsError`](#message-signing) and these TypeScript types: `ServiceMutatorName`, `InstalledServiceMutator`, `LoggingLevel`, `ApproovErrorType`, `SigningOptions`, `SignatureSelection`, `BodyDigestMode`, `BodyDigestAlgorithm`, `DerivedComponent`, `ApproovProviderProps` and `ApproovState`.

`ApproovService` is also the default export. Each method returns a Promise. An argument of the wrong type throws a `TypeError` before anything reaches the native layer. A native failure rejects with an [`ApproovError`](#approoverror). The package gives `undefined` and `null` to the native layer as no value, never as an empty string.

### Initialization and state

| Method | Description |
| :--- | :--- |
| `initialize(accountId?: null): Promise<void>`, `initialize(accountId: string, comment?: string \| null): Promise<void>` | Initializes Approov with your account ID. With no arguments or a `null` account ID, initializes Approov from the bundled [`approov.config`](#approovconfig). The call that first initializes applies the settings of the file once. An empty string starts bypass mode. The package ignores bypass mode when protection is on. A repeat with the same account ID and comment, from JavaScript or natively, resolves immediately and keeps the configuration. Different values reject with type `initialization`. A file that the package cannot use (see [approov.config](#approovconfig)) also rejects with type `initialization`. Never resets configuration. A comment without an account ID is a type error. From untyped code, it throws a `TypeError`. |
| `isApproovServiceEnabled(): Promise<boolean>` | Tells if Approov was initialized, bypass mode included. |
| `isApproovProtectionEnabled(): Promise<boolean>` | Tells if Approov protects requests. This needs an initialization with an account ID. |
| `isInterceptionInstalled(): Promise<boolean>` | Tells if the hook that protects the networking of React Native is in place. On Android, the hook is the rewrite of `OkHttpClientProvider` by the Gradle plugin. On iOS, the hook is the universal interception, installed and first. Also true before `initialize`. On iOS, false in a Debug build of an Expo development client. The network inspector of that client puts its own `URLProtocol` in front of the Approov `URLProtocol`. Requests are still protected, and release builds return true. Thus, in debug builds, do not make app behaviour depend on this value (see [development builds](ADVANCED.md#development-builds-and-development-servers)). |

### Headers

| Method | Default |
| :--- | :--- |
| `setTokenHeader(header: string, prefix?: string \| null): Promise<void>` | `Approov-Token`, no prefix. A null or absent prefix means no prefix, never the text `"null"`. |
| `getTokenHeader(): Promise<string>`, `getTokenPrefix(): Promise<string>` | |
| `setTraceIDHeader(header: string \| null): Promise<void>`, `getTraceIDHeader(): Promise<string \| null>` | `Approov-TraceID`, a debug header. Null turns off the header. |
| `setStatusHeader(header: string \| null): Promise<void>`, `getStatusHeader(): Promise<string \| null>` | `Approov-Status`. Null turns off the header. |
| `setBindingHeader(header: string \| null): Promise<void>`, `getBindingHeader(): Promise<string \| null>` | None. Binds the token to the value of the header. Null removes the binding. Rejects for a header that is also a substitution header. |

### Secure strings and exclusions

| Method | Description |
| :--- | :--- |
| `addSubstitutionHeader(header: string, requiredPrefix?: string \| null): Promise<void>` | The value of the header, after the prefix, is a secure string key. The package replaces the key with its value. Rejects for the binding header. |
| `removeSubstitutionHeader(header: string): Promise<void>` | |
| `addSubstitutionQueryParam(key: string): Promise<void>` | The value of the query parameter is a secure string key. The package replaces the key with its value. |
| `removeSubstitutionQueryParam(key: string): Promise<void>` | |
| `addExclusionURLRegex(regex: string): Promise<void>` | The package does no Approov processing for a URL that matches the regular expression. Rejects for a regular expression that is not valid. |
| `removeExclusionURLRegex(regex: string): Promise<void>` | |

### Service mutator

| Method | Description |
| :--- | :--- |
| `setServiceMutator(name: 'CLOSE_FAILURE' \| 'ALWAYS_PROCEED' \| 'DEFAULT' \| null): Promise<void>` | Installs a standard mutator. `DEFAULT` and null select the default of the package, `ALWAYS_PROCEED` in 3.7.0. If this call replaces a mutator that your native code installed, the package logs a warning that names the class of that mutator. |
| `getServiceMutator(): Promise<'CLOSE_FAILURE' \| 'ALWAYS_PROCEED' \| 'CUSTOM'>` | The installed mutator, from either side. `ALWAYS_PROCEED` by default. `CUSTOM` for a mutator that your native code installed. |

`ALWAYS_PROCEED`, the default, lets each request proceed, and your backend decides. With `CLOSE_FAILURE`, the package fails a request to a protected domain when its token fetch fails. Exception: with `NO_APPROOV_SERVICE`, the request proceeds without a token. See [service mutators](ADVANCED.md#service-mutators).

### Message signing

| Method | Description |
| :--- | :--- |
| `enableMessageSigning(options?: SigningOptions): Promise<void>` | Turns on signing with the default factory of the package, overridden by the options. Signing is on by default, with both signatures. Call it to change the options, or to turn signing on again after `disableMessageSigning`. |
| `setMessageSigningHostOptions(hostName: string, options: SigningOptions \| null): Promise<void>` | Gives one host its own options. These options start from the default. Null removes them. |
| `disableMessageSigning(): Promise<void>` | Turns off signing and keeps the options. |
| `isMessageSigningEnabled(): Promise<boolean>` | True by default. |

`SigningOptions` has these keys. A key that you leave out keeps its default. An unknown option, or a value that is not in its list, throws a `SigningOptionsError` (a `TypeError`) and changes nothing. [Message signing](ADVANCED.md#message-signing) shows how to use them.

| Option | Values | Default |
| :--- | :--- | :--- |
| `signatures` | `both`, `install` (ecdsa-p256-sha256), `account` (hmac-sha256) | `both` |
| `bodyDigest` | `none`, `optional`, `required` (with `required`, a request fails when the package cannot calculate the digest of its body) | `optional` |
| `bodyDigestAlgorithm` | `sha-256`, `sha-512` | `sha-256` |
| `optionalHeaders` | Header names that the signature covers when the request has them, in addition to `Authorization`, `Content-Length` and `Content-Type`. | none added |
| `baseComponents` | Derived components that the signature always covers: `@method`, `@target-uri`, `@authority`, `@scheme`, `@request-target`, `@path`, `@query`. | `@method`, `@target-uri` |
| `coverTokenHeader`, `coverTraceIDHeader`, `coverStatusHeader` | Cover the Approov token header. Cover the trace ID and status headers when they are present. | `true` |
| `created` | Add the `created` parameter. Its value comes from the server adjusted time (`getServerAdjustedCurrentTimeMS()`), so that a wrong device clock does not make it invalid. | `true` |
| `expiresLifetime` | Seconds from `created` to `expires`. `0` means no `expires`. | `15` |

### Logging and development

| Method | Description |
| :--- | :--- |
| `setLoggingLevel(level: 'OFF' \| 'ERROR' \| 'WARNING' \| 'INFO' \| 'DEBUG'): Promise<void>` | Default `INFO`. |
| `setDevKey(devKey: string): Promise<void>` | Sets a development key, so that a development build can pass attestation. |

### Direct calls to the Approov SDK

All calls except `getLastARC` need Approov protection on. If protection is off, they reject with type `general` and a null status.

| Method | Description |
| :--- | :--- |
| `getDeviceID(): Promise<string>` | The Approov device ID of this install. |
| `getServerAdjustedCurrentTimeMS(): Promise<number>` | The current time in milliseconds since the epoch, corrected to the clock of the Approov servers. Message signatures take their `created` and `expires` times from it. Thus a device with a wrong clock still signs within the time window of your backend. Use it for your own timestamps that your backend compares with its clock. |
| `setDataHashInToken(data: string): Promise<void>` | Binds the token to a hash of the data, manually. Never use it together with `setBindingHeader`. |
| `fetchToken(url: string): Promise<string>` | An Approov token for the domain of the URL. Do not cache it. The package fetches a new token for each request. |
| `fetchSecureString(key: string, newDef?: string \| null): Promise<string \| null>` | The secure string for the key, or null if there is no secure string. With `newDef`, defines a new value for the key. |
| `fetchCustomJWT(payload: string): Promise<string \| null>` | A custom JWT carrying the payload. |
| `getAccountMessageSignature(message: string): Promise<string \| null>` | The account message signature of the message. |
| `getInstallMessageSignature(message: string): Promise<string \| null>` | The install message signature of the message. |
| `getMessageSignature(message: string): Promise<string \| null>` | Deprecated. Use `getAccountMessageSignature`. Writes a warning once in each process. |
| `getLastARC(): Promise<string>` | The Attestation Response Code of the most recent fetch, or an empty string. |
| `setInstallAttributes(attrs: string): Promise<void>` | Sets the install attributes carried in the token. |

### Persisted configuration

Options for the next launch, for example options delivered with an over-the-air update. Nothing changes in the running process. The package applies calls in the order you make them, awaited or not. See [over-the-air updates](ADVANCED.md#over-the-air-updates).

| Method | Description |
| :--- | :--- |
| `setPersistentConfiguration(json: string \| Record<string, unknown>, source?: string \| null): Promise<void>` | Stores [`approov.config`](#approovconfig) options, as a plain object or as its JSON text of 64 KiB or less. From the next launch, the file form of `initialize` applies these options over the bundled file. Each key fully replaces the bundled key. All keys are allowed, except `config`, `comment` and `devKey`. Rejects with type `general` and stores nothing for JSON that is not valid or for options larger than 64 KiB. Also rejects in this way for a forbidden key or a known key with a bad value. The error names the cause. Stores an unknown key, and ignores it when it applies the options. `source` is your tag for the options, for example the update ID. A `json` of a different type, for example an array, a `Map` or a class instance, throws a `TypeError`. |
| `clearPersistentConfiguration(): Promise<void>` | Removes the stored options. From the next launch, only the bundled file applies. |
| `getPersistentConfigurationSource(): Promise<string \| null>` | The `source` stored with the options. Null if no options are stored or the options have no source. |

### ApproovError

`ApproovError` extends `Error`. `isApproovError(value)` identifies it.

| Property | Type | Meaning |
| :--- | :--- | :--- |
| `code` | `string` | The method that failed. |
| `message` | `string` | The native message. It is the same on Android and iOS, and never contains a token or a secure string value. It is the message of the universal package after one of these prefixes: `ApproovService error: `, `ApproovService rejection: ` (with the ARC and reasons when reported), or `ApproovService network error (retry possible): `. For `initialize`, it is the message of the Approov SDK, unchanged. |
| `type` | `'rejection' \| 'network' \| 'general' \| 'initialization'` | `rejection`: attestation failed. `network`: retry later. `initialization`: the SDK refused `initialize`. |
| `status` | `string \| null` | The Approov SDK status name, for example `REJECTED` or `NO_NETWORK`. |
| `rejectionARC`, `rejectionReasons` | `string \| null` | For a rejection, when your account reports them. |
| `userInfo` | `Readonly<Record<string, unknown>>` | All data that the native module reported. On iOS, this includes `underlyingDomain` and `underlyingCode` for an initialization error. |

### ApproovProvider and useApproov

`<ApproovProvider accountId? comment?>` initializes Approov when you give it an account ID. When Approov is initialized natively or by your own `initialize()`, the provider only reads the state. It never configures Approov and never reads `approov.config`. `useApproov()` returns `{ approovReady, approovChecked, approovError }`. See [ApproovProvider](ADVANCED.md#approovprovider).

### approov.config

A JSON object in UTF-8, bundled in the Android assets and the iOS main bundle of the app. These read the file:

- `initialize()` with no arguments or a `null` account ID
- the native initialization of the config plugin

You can have one file for each build variant, through Gradle source sets and iOS target membership.

- Content whose first character that is not whitespace is `{` is JSON.
- The package rejects content that starts with `[`, and content that is a JSON string, number, `true`, `false` or `null`.
- All other content is a 3.5.x file. Its first line that is not blank is `config`, with no settings. The package rejects a first line that holds `{` or `"`.

Only `config` is required. A missing key leaves the setting as it is. The package ignores an unknown key and writes an `INFO` log line. The package skips a known key with a wrong type or value and writes an `ERROR` line that names the key. Neither case makes `initialize` fail. The package logs no value from the file.

| Key | Value | Same as |
| :--- | :--- | :--- |
| `config` | string, required. `""` is bypass mode. | the account ID of `initialize` |
| `comment` | string, or `null` for none | the comment of `initialize` |
| `devKey` | string. Only for debug variants. | `setDevKey` |
| `tokenHeader` | `{"name": string, "prefix": string}`, prefix default `""` | `setTokenHeader` |
| `traceIDHeader` | string, or `null` to turn it off | `setTraceIDHeader` |
| `statusHeader` | string, or `null` to turn it off | `setStatusHeader` |
| `bindingHeader` | string, or `null` | `setBindingHeader` |
| `mutator` | `"CLOSE_FAILURE"` or `"ALWAYS_PROCEED"` (the default) | `setServiceMutator` |
| `messageSigning` | boolean. `true` turns on signing with the default factory (both signatures), `false` turns it off. Signing is on by default. | `enableMessageSigning` / `disableMessageSigning` |
| `logLevel` | `"OFF"`, `"ERROR"`, `"WARNING"`, `"INFO"` or `"DEBUG"`, applied first | `setLoggingLevel` |
| `substitutionHeaders` | object of header name to required prefix | `addSubstitutionHeader` |
| `substitutionQueryParams` | array of strings | `addSubstitutionQueryParam` |
| `exclusionURLRegexes` | array of strings, JSON escaped, so `"\\."` is the regex `\.` | `addExclusionURLRegex` |

`initialize()` rejects with type `initialization` when the file has one of these problems:

- The file is missing or the package cannot read it.
- The file is larger than 1 MiB.
- The file is not valid UTF-8.
- The file is not valid JSON. The check is strict: no comments, trailing commas, duplicate keys, nesting deeper than 128 or numbers out of range.
- The file is not a JSON object, or has no `config`.

The package does not read the 3.5.x `init.prefetch`, `approov.props` or `approov.plist`. From the next launch, the package applies the options stored with [`setPersistentConfiguration`](#persisted-configuration) over the file.

### Jest mock

`jest.mock('@approov/approov-react-native', () => require('@approov/approov-react-native/jest'))`. See [testing with Jest](ADVANCED.md#testing-with-jest).

### Not in this package

These 3.5.x methods are removed:

- `isInitialized` and `isApproovEnabled` (use `isApproovServiceEnabled` and `isApproovProtectionEnabled`)
- `setProceedOnNetworkFail` (use the service mutator)
- `prefetch`
- `setInstallAttrsInToken` (use `setInstallAttributes`)
- `fetchWithApproov` (use `fetch`)
- `updateClientFactory`

The package does not read `approov.props` and `approov.plist`. Put their keys in [`approov.config`](#approovconfig).

These items are available only in native code, through the universal packages:

- custom service mutators
- custom signature parameters factories
- the stale protection refresh period on Android
- the challenge handler on iOS
- the pins APIs
- request processing

The references of `io.approov:service.android` (Android) and `approov-service-ios` (iOS) describe them.

## Expo config plugin

The config plugin is the entry point `app.plugin.js`. Use it as `["@approov/approov-react-native", { ...options }]` in the `plugins` of an Expo app config. [plugin/README.md](plugin/README.md#options) describes its options:

| Option | Default |
| :--- | :--- |
| `accountId` | the `APPROOV_ACCOUNT_ID` environment variable at prebuild |
| `comment` | none |
| `nativeInitialize` | `true` |
| `android.version` | `3.7.0` |
| `android.repositories` | `["mavenCentral"]` |
| `android.gradlePluginPath` | none (only for local development) |
| `android.cronetDependencyPackages` | the default of the Gradle plugin, `["com.margelo.nitro.nitrofetch"]` |
| `android.sdkVersion` | none (only for local development) |
| `ios.version` | `3.7.0` |
| `ios.sdkVersion` | `3.7.0` |
| `ios.podPath` | none (only for local development) |
| `ios.sdkPodPath` | none (only for local development) |

The plugin writes `approov.config` from the project, at the root or for each variant under `approov/android/<sourceSet>/` and `approov/ios/<Target>/`. It adds `accountId` (or `APPROOV_ACCOUNT_ID`) and `comment` to each file that does not have them. If there is no file, the plugin generates one from these values. Prebuild fails on a file that is not valid, or on a file whose `config` or `comment` is different from the option. An unknown option or a malformed value makes `expo prebuild` and `expo config` fail, with a message that names the option. Prebuild also fails when `@approov/approov-service-react-native` is a dependency of the app or is installed.

## Minimum versions

| Requirement | Minimum |
| :--- | :--- |
| React Native | 0.82 (New Architecture only) |
| Expo SDK, when used | 55 |
| Android | 6.0 (API 23), Android Gradle Plugin 8.6 |
| iOS | 15, Xcode 16 |
