# Advanced Usage

A standard integration needs nothing on this page. This page explains the defaults and how to change them. Each method is in [REFERENCE.md](REFERENCE.md).

The package is a bridge to the universal Approov packages, `io.approov:service.android` on Android and `approov-service-ios` on iOS. Each method returns a Promise. A call that the package cannot apply rejects. A call with an argument of the wrong type throws a `TypeError` before anything reaches the native layer.

## What each request carries

What the package adds to a request depends on the host and on the result of the token fetch:

| Request goes to | Token fetch result | What the package adds |
| :--- | :--- | :--- |
| a protected domain | `SUCCESS` | the token header, the status header, the trace header when the SDK gives a trace ID, your secure strings, and the signatures. A validated connection. |
| a protected domain | any failure status | the status header only. A validated connection. |
| a secrets-only domain, added with `approov api -add <domain> -noApproovToken` | `UNPROTECTED_URL` | your secure strings. A validated connection. No token, status or trace header, and no signatures. |
| a host that is not in your Approov account | any | nothing |

A failure status means that the app could not complete the attestation. For example, there was no network, or the app could not reach the Approov service. The status header then gives the reason.

Only your backend can tell from the token whether the app passed attestation. The `Approov-Status` header carries the status names of the SDK, the same on both platforms. `Approov-TraceID` is an optional debug header that your backend passes through unchanged.

## What happens by default

Each request goes out. The package never fails a request because of its token fetch, and your backend decides whether to accept it. This is the `ALWAYS_PROCEED` [service mutator](#service-mutators). To fail requests in the app instead, select `CLOSE_FAILURE`.

With the default settings, the package fails a request only when the connection to a protected domain fails [validation](#connection-validation). `CLOSE_FAILURE`, a native mutator of your own, and the `bodyDigest: 'required'` signing option can also fail a request.

The package processes a request only after `initialize` succeeds with an account ID. In [bypass mode](#bypass-initialization), and for an [excluded URL](#excluding-urls), the package sends the request untouched.

## Message signing

Message signing is on by default. The package signs each request that carries the Approov token with two signatures (RFC 9421):

- the install signature (`install`, ecdsa-p256-sha256), with a key unique to the app installation
- the account signature (`account`, hmac-sha256), with an account key that the app receives when it passes attestation

Both are members of the same `Signature` and `Signature-Input` headers. The package also adds a `Content-Digest` of the body when it can calculate one. A request that carries no token, for example after a failed token fetch, is not signed.

To change the default, call `enableMessageSigning` with options. To turn signing off, call `disableMessageSigning()`.

```ts
// the install signature only, and a body digest on every request
await ApproovService.enableMessageSigning({ signatures: 'install', bodyDigest: 'required' });

// one host with its own options, which start from the default, not from enableMessageSigning's
await ApproovService.setMessageSigningHostOptions('upload.example.com', { bodyDigest: 'none' });

// no signatures
await ApproovService.disableMessageSigning();
```

Each option, with its values and its default, is in [REFERENCE.md](REFERENCE.md#message-signing). Options apply to a host, never to a path. `setMessageSigningHostOptions(host, null)` removes the options of a host. `disableMessageSigning()` keeps the options for a later `enableMessageSigning`.

A rule that depends on the path needs a custom signature parameters factory in native code. `enableMessageSigning` and `setMessageSigningHostOptions` replace such a factory, and the package logs a warning that names its class.

If the package cannot produce one signature, the request goes out with the other signature. If it can produce neither, the request goes out unsigned. The package logs each case once in each process: a warning for each missing signature, and an error for an unsigned request.

Your backend verifies the signatures as the [Approov documentation](https://approov.io/docs/latest/approov-usage-documentation/) describes for installation and account message signing.

## Header names

By default, the token goes in `Approov-Token` with no prefix. Change the header when your backend expects the token somewhere else:

```ts
// the token in the Authorization header, as "Bearer <token>"
await ApproovService.setTokenHeader('Authorization', 'Bearer ');

// no trace ID header, and no status header
await ApproovService.setTraceIDHeader(null);
await ApproovService.setStatusHeader(null);
```

## Bypass initialization

`initialize('')` starts bypass mode. `isApproovServiceEnabled()` is then true and `isApproovProtectionEnabled()` is false. Requests go out untouched, as they do before any `initialize`, and the calls that need Approov protection reject with type `general`. The [README](README.md#initializing) example uses bypass mode as a fallback when the account ID does not reach the app intact. A later `initialize` with the account ID turns protection on. The package ignores `initialize('')` when protection is on.

## Initialize, then configure

Always use this order, before the app makes protected requests:

1. `await initialize(...)`.
2. Call `isApproovServiceEnabled()` and `isApproovProtectionEnabled()`.
3. Make your configuration calls.

The app process shares one Approov service and one configuration, natively and from JavaScript. The last write wins, so configure in one place. A configuration call applies to requests that the package processes after the call.

Initialization can occur natively (the Expo config plugin or your own code) and from JavaScript:

- Each `initialize` must give the same account ID and comment. A repeat with the same values resolves immediately and keeps the configuration.
- The Approov SDK refuses a different account ID or comment. The promise rejects with an `ApproovError` of type `initialization`, and the first initialization stays in force.
- Your app must not call `Approov.initialize` of the Approov SDK directly. With a different comment, the `initialize` of the package then fails.
- `initialize()` with no arguments, or `initialize(null)`, reads the bundled `approov.config` and applies its settings once, at the call that first initializes Approov ([keys](REFERENCE.md#approovconfig)). `initialize(accountId, comment)` never reads the file and applies no settings.
- `initialize` never resets configuration.

A request that the package processes before your configuration calls uses the settings in force at that moment. For each setting that `approov.config` does not hold, these are the defaults:

- the `ALWAYS_PROCEED` service mutator
- the `Approov-Token` header with no prefix, and the `Approov-TraceID` and `Approov-Status` headers
- no binding header, no exclusions and no substitutions (a secure string placeholder goes out unchanged)
- message signing on, with both signatures
- logging at `INFO`

With the config plugin, native initialization runs before React Native starts, so no request goes out before Approov is initialized. Without it, the package sends untouched a request made before your JavaScript `initialize`. Requests are protected from the moment `initialize` succeeds, also on connections that React Native created before.

### Over-the-air updates

The bundled `approov.config` changes only with a store release. Configuration calls in an Expo over-the-air update (EAS Update) apply on each launch only after they run. Earlier requests, for example the expo-updates request for a new update, use the settings in force natively. To change the settings that apply from the first request, an update stores them with `setPersistentConfiguration`:

```ts
import { ApproovService } from '@approov/approov-react-native';
import * as Updates from 'expo-updates';

// run at startup in every bundle you ship, the embedded one included
export async function applyApproovOverrides(): Promise<void> {
  if (Updates.isEmbeddedLaunch) {
    // the bundled approov.config alone, from the next launch
    await ApproovService.clearPersistentConfiguration();
  } else {
    // this update's options over the bundled approov.config, from the next launch
    await ApproovService.setPersistentConfiguration(
      { exclusionURLRegexes: ['^https://status\\.example\\.com/'] },
      Updates.updateId,
    );
  }
}
```

- **What persists.** `approov.config` options, except `config`, `comment` and `devKey`. Each key fully replaces the same key of the bundled file. The limits are in [REFERENCE.md](REFERENCE.md#persisted-configuration).
- **When it applies.** Never in the running process. At the next launch, the file form of `initialize` applies the stored options over the bundled file. Your configuration calls still apply after that.
- **Set or clear in each bundle.** Make each bundle that you ship, the embedded one included, call one of the two methods at startup. Then a rollback clears what a later update stored.
- **Store releases.** The package removes the stored options at the first launch after the app version or the bundled `approov.config` changes.
- **Sign your updates.** A person who can change your JavaScript bundle can change these settings. Use [EAS Update code signing](https://docs.expo.dev/eas-update/code-signing/).

### ApproovProvider

`ApproovProvider` and `useApproov()` tell your components when Approov is ready. They never configure Approov.

```tsx
import { ApproovProvider, useApproov } from '@approov/approov-react-native';

export default function App() {
  // leave accountId out when Approov is initialized natively, for example by the Expo config plugin, or by your
  // own call to ApproovService.initialize() before rendering
  return (
    <ApproovProvider accountId="<your-approov-account-id>">
      <Home />
    </ApproovProvider>
  );
}

function Home() {
  const { approovReady, approovChecked, approovError } = useApproov();
  // ...
}
```

Without `accountId`, or with a `null` `accountId`, the provider only reads the state. It never calls `initialize()` and never reads `approov.config` itself.

- `approovReady` is true when Approov is initialized and protects requests.
- `approovChecked` is true when the provider knows the result, success or error.
- `approovError` holds the initialization error if `initialize` rejected.

## Token binding

Token binding ties the Approov token to the value of a header, for example an OAuth `Authorization` header. A token then cannot be replayed with different credentials.

```ts
await ApproovService.setBindingHeader('Authorization');
```

`setBindingHeader` binds automatically. `setDataHashInToken(data)` binds manually. Use one or the other, never both. A header cannot be both the binding header and a substitution header.

## Secure strings

Secure strings let you remove API keys and other secrets from your app. An app that passes attestation receives them at runtime from the Approov service. The package replaces a placeholder in a request header or query parameter with the secret.

```ts
await ApproovService.addSubstitutionHeader('Api-Key', null);
await ApproovService.addSubstitutionQueryParam('api_key');
```

When the package cannot deliver a secure string, the request still goes out, and the value that your backend receives is not the secret. Set the logging level to `DEBUG` to see the reason (see [diagnostics](#diagnostics)).

## Excluding URLs

The package does no Approov processing for a URL that matches an exclusion regular expression.

```ts
await ApproovService.addExclusionURLRegex('^https://api\\.example\\.com/health');
```

`addExclusionURLRegex` rejects an expression that is not a valid regular expression.

## Connection validation

The package validates the TLS connection to each protected domain and each secrets-only domain. It validates the connection against the certificate public keys configured for the domain. For a domain with none, it uses the Managed Trust Roots Approov maintains for your account. Validation is on whatever the token fetch result is. A request whose connection fails validation fails.

## Service mutators

The service mutator decides what occurs when a token fetch does not succeed. From JavaScript, you select a standard mutator by name:

```ts
await ApproovService.setServiceMutator('CLOSE_FAILURE');
```

| Name | Behaviour |
| :--- | :--- |
| `ALWAYS_PROCEED` | The default. Each request proceeds, and your backend decides. |
| `CLOSE_FAILURE` | The package fails a request to a protected domain when its token fetch fails. Exception: with `NO_APPROOV_SERVICE`, the request proceeds with the status header and no token. |
| `DEFAULT` or `null` | The default of the package, `ALWAYS_PROCEED` in 3.7.0. |

`getServiceMutator()` returns `ALWAYS_PROCEED` or `CLOSE_FAILURE` for a standard mutator, and `CUSTOM` for a mutator that your native code installed.

For another decision, for example to abort a request on one status only, write a custom mutator in native code. It can extend a standard mutator and change one decision. The references of the universal packages describe the hooks. `setServiceMutator` replaces such a mutator, and the package logs a warning that names its class.

## Errors

A native failure rejects with an `ApproovError`:

```ts
import { ApproovService, isApproovError } from '@approov/approov-react-native';

try {
  const token = await ApproovService.fetchToken('https://api.example.com');
} catch (e) {
  if (isApproovError(e) && e.type === 'network') {
    // retry later
  }
}
```

The properties of `ApproovError` are in [REFERENCE.md](REFERENCE.md#approoverror). Use `type` to decide what to do, and `status` for logging. The `status` names come from the SDK without conversion, and the `Approov-Status` header carries the same names. An untrusted network or a captive portal gives `MITM_DETECTED`, a `network` error. The SDK of each platform has some statuses of its own, for example `NOT_INITIALIZED` on iOS and `NO_NETWORK_PERMISSION` on Android.

While protection is off, a call that needs Approov protection rejects with `type` `general` and a null `status`. No message contains a token or a secure string value.

## Diagnostics

The package never logs a token. At the default logging level, it writes no line for each request, and your backend sees the result in the `Approov-Status` header.

- `setLoggingLevel('DEBUG')` shows the processing of each request in the device log. On Android, `adb shell setprop log.tag.ApproovService DEBUG` and an app restart do the same without a code change. The lines of the package use the tag `ApproovReactNative` on Android and the prefix `ApproovService: React Native:` on iOS.
- `getLastARC()` returns the [Attestation Response Code](https://approov.io/docs/latest/approov-usage-documentation/#attestation-response-code) of the most recent fetch on the device. It tells why attestation gave its result. Decode it with `approov token -showArcInfoCurl`. The [live metrics](https://approov.io/docs/latest/approov-usage-documentation/#metrics-graphs) of your account show the same reasons in aggregate.
- A [development key](https://approov.io/docs/latest/approov-usage-documentation/#using-a-development-key) lets debug builds, emulators and simulators pass attestation while you develop. Set it with `setDevKey`.

The first protected request waits for the first token fetch, which includes the attestation of the app. Expect a few seconds on a fresh install, and much less than a second after that.

## What is covered

| Stack | Android | iOS |
| :--- | :--- | :--- |
| React Native `fetch` and `XMLHttpRequest` | covered | covered |
| Expo `fetch` | covered | covered |
| [react-native-nitro-fetch](https://github.com/margelo/react-native-nitro-fetch) | covered | covered |
| expo-file-system `DownloadTask` | covered | not covered: it runs on a background `URLSession` |
| expo-file-system `File.downloadFileAsync` | not covered: it builds its own OkHttp client | covered |
| React Native `WebSocket` | not supported: the upgrade goes out without Approov processing | not covered: React Native opens it with SocketRocket, not `URLSession` |
| native code in your app | your own networking stacks, as for a native app | every `URLSession` your app creates |

**Android.** When it builds your app, the `io.approov.gradle` Gradle plugin rewrites the React Native `OkHttpClientProvider`. It covers each module that builds its client from that provider, also through a client factory of your app. It does not cover a module that creates its own `OkHttpClient`. Approov is the last network interceptor of that client, after your interceptors, redirects and retries. A network interceptor that React Native adds for one request, for example for a development tool, runs after Approov. The signature does not cover its changes.

**iOS.** The package installs the universal interception when it loads, before React Native creates its sessions. It cannot cover background `URLSession` transfers and `WKWebView`.

**WebSocket.** The package does not support WebSockets, also for GraphQL subscriptions.

`isInterceptionInstalled()` reports only the hook, so it is also true before `initialize`. On iOS, it is false while a different `URLProtocol` is in front of the Approov `URLProtocol`, as in an Expo development client (see below).

### Build reports on Android

The Gradle plugin writes reports with each build, under `android/app/build/outputs/approov/`:

- `react-native-weave-<variant>.txt` lists the `OkHttpClientProvider` sites that the plugin rewrote. The task `checkApproovReactNativeWeave<Variant>` fails the build when the class is missing or its shape changed.
- `cronet-weave-<variant>.txt` lists the Cronet engine creation sites that the plugin protected in dependency packages. react-native-nitro-fetch appears here.
- `weave-<variant>.txt` covers the classes of your app module. In an app with no native networking code, it counts no sites. This is expected.

## Development builds and development servers

App development is the same as without the package. Metro, Fast Refresh, the Expo development server and an Expo development client all work. The package sends a cleartext (`http`) request to a host that is not a protected domain untouched and immediately, without a token fetch.

- **Do not add your development host as an Approov API domain.** Approov cannot protect a cleartext request. A cleartext request to a protected domain still waits for a token fetch, carries no token, and fails with `CLOSE_FAILURE`. If your account lists `localhost`, open the development server as `http://127.0.0.1:8081`, or remove `localhost` from the account.
- **iOS, Expo development client.** In a Debug build, the network inspector of the development client puts its own `URLProtocol` in front of the Approov `URLProtocol`. Requests are still protected, but `isInterceptionInstalled()` returns false. Assert on it only in release builds, or set `EX_DEV_CLIENT_NETWORK_INSPECTOR` to `false` in `ios/Podfile.properties.json`.
- **Android, debug builds with the Expo development client.** The build prints a warning that the instrumentation "wasn't able to resolve some classes", and names an Approov class. This warning is harmless. The app runs protected, and release builds do not show the warning.

## Testing with Jest

The package ships a Jest mock that loads without React Native or the native module:

```js
jest.mock('@approov/approov-react-native', () => require('@approov/approov-react-native/jest'));
```

Each `ApproovService` method is a `jest.fn` that resolves with a plausible value. Change the value with `mockResolvedValue` or `mockRejectedValue`. `ApproovError` and `isApproovError` behave as in the app.

## Differences between the platforms

- Only on iOS, an `initialization` error carries the underlying error domain and code in `userInfo` (`underlyingDomain`, `underlyingCode`).
- Error message texts come from the package of each platform and have different wording.

## Do not combine with the 3.5.x package

`@approov/approov-service-react-native` (3.5.x) brings its own Approov layer and its own Approov SDK. Thus the two packages must never be in one app. `npx expo prebuild`, the Android build and `pod install` each fail when they find the 3.5.x package.

The package never reads `approov.props` (Android) or `approov.plist` (iOS). Move their keys to `approov.config` (`token.name` and `token.prefix` become `tokenHeader`, and `binding.name` becomes `bindingHeader`), then remove the file. While one of these files is in the app, the package logs a warning that names it. The 3.5.x `init.prefetch` has no replacement, because the SDK manages prefetching.
