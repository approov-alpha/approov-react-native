# Approov Package for React Native

![React Native](https://img.shields.io/badge/React%20Native-0.82%2B-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2055%2B-000020?logo=expo&logoColor=white)
![Android](https://img.shields.io/badge/Android-minSdk%2023-3DDC84?logo=android&logoColor=white)
![iOS](https://img.shields.io/badge/iOS-15%2B-000000?logo=apple&logoColor=white)
![Approov SDK](https://img.shields.io/badge/Approov%20SDK-3.7.0-0A66C2)
![Message Signing](https://img.shields.io/badge/Message%20Signing-RFC%209421-1f6feb)

This package is the client API of Approov for React Native apps. After you initialize it with your Approov account ID, each request that your app sends to a protected domain carries an Approov token. A protected domain is an API domain that you added to [Approov](https://www.approov.io). The token is proof of attestation, and your backend verifies it. A valid token shows that the request came from a genuine, unmodified copy of your app.

The package also signs each request that carries a token, and validates the connection to each protected domain. It validates the connection against the Managed Trust Roots Approov maintains for your account, or against the certificate public keys configured for the domain.

On each platform, the package uses a universal Approov package that does the protection natively: `io.approov:service.android` on Android and `approov-service-ios` on iOS. This package is different from `@approov/approov-service-react-native` (3.5.x). Never install the two packages in the same app.

## BEFORE YOU START

You need:

- React Native 0.82 or later. The package supports only the New Architecture. An app on an earlier React Native stays on `@approov/approov-service-react-native` 3.5.x until it upgrades.
- Expo SDK 55 or later, when the app uses Expo. Expo is optional.
- Android 6.0 (API 23) or later, and Android Gradle Plugin 8.6 or later.
- iOS 15 or later, Xcode 16 or later, and CocoaPods.
- an Approov account, and its [account ID](#your-account-id)
- your API domains [added to Approov](https://approov.io/docs/latest/approov-usage-documentation/#managing-api-domains)

Then do these steps:

1. [Add the dependency](#adding-the-dependency).
2. [Initialize](#initializing) the package with your account ID.
3. [Make your requests](#making-requests) as you do now.
4. [Look in the debug log](ADVANCED.md#diagnostics) to see the result of each token fetch.
5. [Register your app and verify tokens on your backend](#next-steps). Until your backend verifies the token, your API is not protected.

Optional features are in [ADVANCED.md](ADVANCED.md). Each method is in [REFERENCE.md](REFERENCE.md).

## ADDING THE DEPENDENCY

```sh
npm install @approov/approov-react-native
```

The package has no runtime dependencies of its own. It brings the universal Approov package for each platform, and with it the Approov SDK.

**Expo.** Add the config plugin with your account ID and run `npx expo prebuild`. The plugin adds these items to the generated projects:

- the universal Android library and its Gradle plugin
- the universal iOS pod
- the network permissions
- an `approov.config` (your own, or one generated from your account ID)

The plugin also initializes Approov natively from the `approov.config`. Each option is in [plugin/README.md](plugin/README.md).

```json
{
  "expo": {
    "plugins": [
      ["@approov/approov-react-native", { "accountId": "<your-approov-account-id>" }]
    ]
  }
}
```

**React Native without Expo.** Make the changes that the plugin makes yourself:

1. Apply the `io.approov.gradle` Gradle plugin in `android/app/build.gradle`.
2. Declare `io.approov:service.android` and exclude the `com.squareup.okhttp3` group, so that the app keeps the OkHttp of React Native.
3. Add the `INTERNET` and `ACCESS_NETWORK_STATE` permissions.
4. Add the `approov-ios-sdk` and `approov-service-ios` pods to the `Podfile`.
5. Run `pod install`.

The exact lines are in [what the plugin changes](plugin/README.md#what-the-plugin-changes). On Android, the Gradle plugin protects the networking of React Native. Thus you must apply it in the app module.

## INITIALIZING

Initialize once, as early as possible. Read the protection state before you treat Approov as active:

```ts
import { ApproovService, isApproovError } from '@approov/approov-react-native';

// your Approov account ID, from your onboarding email or `approov sdk -getConfigString`
const APPROOV_ACCOUNT_ID = '<your-approov-account-id>';

export async function startApproov(sessionId: string): Promise<void> {
  try {
    await ApproovService.initialize(APPROOV_ACCOUNT_ID);
  } catch (e) {
    // the account ID did not reach the app intact: continue without Approov protection, so requests
    // go out as they would without Approov and your backend stays the enforcement point
    console.warn(`Approov not started (session ${sessionId}): ${isApproovError(e) ? e.message : String(e)}`);
    await ApproovService.initialize('');
  }
  if ((await ApproovService.isApproovServiceEnabled()) && (await ApproovService.isApproovProtectionEnabled())) {
    // ties this install together across your app logs, your backend and Approov's metrics
    console.log(`Approov device ID ${await ApproovService.getDeviceID()} (session ${sessionId})`);
  }

  // then configure, before the app makes protected requests; only the settings your app uses, for example:
  // await ApproovService.setTokenHeader('Authorization', 'Bearer ');
}
```

About this example:

- `initialize` rejects only when the account ID does not reach it complete and unaltered. The `catch` block then starts [bypass mode](ADVANCED.md#bypass-initialization) with `initialize('')`. In bypass mode, requests go out without Approov protection.
- Logging the device ID is optional. `sessionId` is any identifier that your app already uses to correlate its logs.
- Make your configuration calls after `initialize`, before the app makes protected requests. See [initialize, then configure](ADVANCED.md#initialize-then-configure).

### Your account ID

Your account ID is in your onboarding email. The Approov CLI also gives it, and calls it the SDK config string:

```sh
approov sdk -getConfigString
```

The account ID is the same for each app in your account, and it is not a secret. You can keep it in your code or deliver it with the configuration of the app.

To keep the account ID out of your code, bundle an `approov.config` file in the app and call `await ApproovService.initialize()` with no arguments. With Expo, the config plugin adds the file. The call reads the account ID, the comment and the settings from the file. It rejects with an `ApproovError` of type `initialization` when the file is missing or not valid. The keys are in [REFERENCE.md](REFERENCE.md#approovconfig).

With Expo, the config plugin initializes Approov natively from `approov.config`, before React Native starts. Your JavaScript `initialize()` then resolves immediately and keeps the configuration. Put in the file the settings that must apply from the first request.

## MAKING REQUESTS

You do not need a network object or a special call. Make requests as you do now:

```ts
const response = await fetch('https://api.example.com/v1/items');
```

On both platforms, the package covers the React Native `fetch` and `XMLHttpRequest`, Expo `fetch`, react-native-nitro-fetch, and libraries built on them. [What is covered](ADVANCED.md#what-is-covered) lists the exceptions, for example WebSocket.

A request to a protected domain goes over a validated connection. When the token fetch succeeds, the request carries these items:

- the Approov token, in the `Approov-Token` header
- the install signature and the account signature, in the `Signature` and `Signature-Input` headers
- the result of the token fetch, in the `Approov-Status` header
- the trace ID, in the `Approov-TraceID` header, when the SDK gives one
- your [secure strings](ADVANCED.md#secure-strings), if you use them

By default, when the token fetch fails, the request still goes out with only the `Approov-Status` header, and your backend decides. The package sends requests to all other domains unchanged. [What each request carries](ADVANCED.md#what-each-request-carries) has the details.

## CUSTOMIZING THE BEHAVIOUR

The defaults are ready to use. [ADVANCED.md](ADVANCED.md) explains how to change them:

- [What happens by default](ADVANCED.md#what-happens-by-default), and [service mutators](ADVANCED.md#service-mutators), which let the app fail a request when its token fetch fails
- [Message signing](ADVANCED.md#message-signing), which is on with both signatures
- [Header names](ADVANCED.md#header-names), [token binding](ADVANCED.md#token-binding), [secure strings](ADVANCED.md#secure-strings) and [excluded URLs](ADVANCED.md#excluding-urls)
- [Over-the-air updates](ADVANCED.md#over-the-air-updates), [development builds](ADVANCED.md#development-builds-and-development-servers) and [testing with Jest](ADVANCED.md#testing-with-jest)
- [Diagnostics](ADVANCED.md#diagnostics), which show the result of each token fetch in the log

The Expo config plugin has its own guide in [plugin/README.md](plugin/README.md).

## NEXT STEPS

1. [Register your app](https://approov.io/docs/latest/approov-usage-documentation/#registering-apps), so that your release builds pass attestation.
2. Make your backend verify the Approov token and the message signatures. Use the [Approov documentation](https://approov.io/docs/latest/approov-usage-documentation/#approov-tokens). This is the step that protects your API.

## UPGRADING FROM 3.5.x

This is a new package, not a new version of `@approov/approov-service-react-native`. Remove the 3.5.x package first. The build fails while both packages are present. Each change is in the [changelog](CHANGELOG.md). Test your app and backend together before you ship.

### Code changes

- The package now protects the React Native `fetch`. Thus `fetchWithApproov` is removed.
- By default, each request goes out and your backend decides. To fail a request in the app when its token fetch fails, call `setServiceMutator('CLOSE_FAILURE')`.
- Message signing is on by default, with both signatures. `disableMessageSigning()` turns it off.
- `initialize()` and the native initialization of the config plugin read a bundled `approov.config` again. The file is now a JSON object that can also carry settings. A one-line 3.5.x file with the account ID continues to work.
- The package does not read `approov.props` or `approov.plist`. Put their keys in `approov.config`. The package writes a warning while one of these files is still in the app ([details](ADVANCED.md#do-not-combine-with-the-35x-package)).
- `getMessageSignature` is deprecated. Use `getAccountMessageSignature`.

## LICENSE

This package is licensed under the [MIT License](LICENSE). It uses the Approov SDK, which is proprietary software of Approov Ltd and is not covered by the MIT License. See [NOTICE](NOTICE).
