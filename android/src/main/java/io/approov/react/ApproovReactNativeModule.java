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

package io.approov.react;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.modules.network.OkHttpClientProvider;

/**
 * ApproovReactNativeModule is the TurboModule ApproovReactNative, which implements the codegen spec
 * NativeApproovReactNativeSpec generated from src/NativeApproovReactNative.ts. Each method hands its arguments and
 * its promise to the method of the same name of ApproovReactNativeCore, which forwards it to exactly one call of
 * the universal layer; nothing else happens here.
 */
public class ApproovReactNativeModule extends NativeApproovReactNativeSpec {
    // the name the module is registered under
    public static final String NAME = NativeApproovReactNativeSpec.NAME;

    // what the module does
    private final ApproovReactNativeCore core;

    /**
     * Constructs the module. It sets the user property approov-react-native/version, in case the
     * package's static initialization did not, logs an error if React Native's networking is not protected, and
     * warns once if the approov.props file of @approov/approov-service-react-native 3.5.x is still in the
     * app.
     *
     * @param reactContext is the React application context
     */
    public ApproovReactNativeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        ApproovReactNativeCore.identify(ApproovServiceApi.STATICS, BuildConfig.APPROOV_REACT_NATIVE_VERSION,
                ApproovReactNativeCore.APPROOV_LOG);
        core = new ApproovReactNativeCore(ApproovServiceApi.STATICS, reactContext.getApplicationContext(),
                ApproovReactNativeCore.newExecutor(),
                () -> ApproovReactNativeInterception.carriesApproov(OkHttpClientProvider.createClientBuilder()),
                ApproovReactNativeCore.APPROOV_LOG);
        core.checkInterception();
        ApproovReactNativeCore.warnAboutLegacyFiles(() -> reactContext.getAssets().list(""),
                ApproovReactNativeCore.APPROOV_LOG);
    }

    @Override
    public void invalidate() {
        core.invalidate();
        super.invalidate();
    }

    // settles a promise from the core's reply
    private static ApproovReactNativeCore.Reply reply(Promise promise) {
        return new ApproovReactNativeCore.Reply() {
            @Override
            public void resolve(Object value) {
                promise.resolve(value);
            }

            @Override
            public void reject(ApproovReactNativeErrors.Rejection rejection) {
                promise.reject(rejection.code, rejection.message, Arguments.makeNativeMap(rejection.userInfo));
            }
        };
    }

    // ---- initialization and state ----

    @Override
    public void initialize(@Nullable String accountId, @Nullable String comment, Promise promise) {
        core.initialize(accountId, comment, reply(promise));
    }

    @Override
    public void isApproovServiceEnabled(Promise promise) {
        core.isApproovServiceEnabled(reply(promise));
    }

    @Override
    public void isApproovProtectionEnabled(Promise promise) {
        core.isApproovProtectionEnabled(reply(promise));
    }

    @Override
    public void isInterceptionInstalled(Promise promise) {
        core.isInterceptionInstalled(reply(promise));
    }

    // ---- header names ----

    @Override
    public void setTokenHeader(String header, @Nullable String prefix, Promise promise) {
        core.setTokenHeader(header, prefix, reply(promise));
    }

    @Override
    public void getTokenHeader(Promise promise) {
        core.getTokenHeader(reply(promise));
    }

    @Override
    public void getTokenPrefix(Promise promise) {
        core.getTokenPrefix(reply(promise));
    }

    @Override
    public void setTraceIDHeader(@Nullable String header, Promise promise) {
        core.setTraceIDHeader(header, reply(promise));
    }

    @Override
    public void getTraceIDHeader(Promise promise) {
        core.getTraceIDHeader(reply(promise));
    }

    @Override
    public void setStatusHeader(@Nullable String header, Promise promise) {
        core.setStatusHeader(header, reply(promise));
    }

    @Override
    public void getStatusHeader(Promise promise) {
        core.getStatusHeader(reply(promise));
    }

    @Override
    public void setBindingHeader(@Nullable String header, Promise promise) {
        core.setBindingHeader(header, reply(promise));
    }

    @Override
    public void getBindingHeader(Promise promise) {
        core.getBindingHeader(reply(promise));
    }

    // ---- substitutions and exclusions ----

    @Override
    public void addSubstitutionHeader(String header, @Nullable String requiredPrefix, Promise promise) {
        core.addSubstitutionHeader(header, requiredPrefix, reply(promise));
    }

    @Override
    public void removeSubstitutionHeader(String header, Promise promise) {
        core.removeSubstitutionHeader(header, reply(promise));
    }

    @Override
    public void addSubstitutionQueryParam(String key, Promise promise) {
        core.addSubstitutionQueryParam(key, reply(promise));
    }

    @Override
    public void removeSubstitutionQueryParam(String key, Promise promise) {
        core.removeSubstitutionQueryParam(key, reply(promise));
    }

    @Override
    public void addExclusionURLRegex(String regex, Promise promise) {
        core.addExclusionURLRegex(regex, reply(promise));
    }

    @Override
    public void removeExclusionURLRegex(String regex, Promise promise) {
        core.removeExclusionURLRegex(regex, reply(promise));
    }

    // ---- the service mutator, by name only ----

    @Override
    public void setServiceMutator(@Nullable String name, Promise promise) {
        core.setServiceMutator(name, reply(promise));
    }

    @Override
    public void getServiceMutator(Promise promise) {
        core.getServiceMutator(reply(promise));
    }

    // ---- message signing with the layer's standard factory ----

    @Override
    public void enableMessageSigning(ReadableMap options, Promise promise) {
        core.enableMessageSigning((options == null) ? null : options.toHashMap(), reply(promise));
    }

    @Override
    public void setMessageSigningHostOptions(String hostName, @Nullable ReadableMap options, Promise promise) {
        core.setMessageSigningHostOptions(hostName, (options == null) ? null : options.toHashMap(), reply(promise));
    }

    @Override
    public void disableMessageSigning(Promise promise) {
        core.disableMessageSigning(reply(promise));
    }

    @Override
    public void isMessageSigningEnabled(Promise promise) {
        core.isMessageSigningEnabled(reply(promise));
    }

    // ---- logging and development ----

    @Override
    public void setLoggingLevel(String level, Promise promise) {
        core.setLoggingLevel(level, reply(promise));
    }

    @Override
    public void setDevKey(String devKey, Promise promise) {
        core.setDevKey(devKey, reply(promise));
    }

    // ---- direct calls to the SDK, which run off the calling thread ----

    @Override
    public void getDeviceID(Promise promise) {
        core.getDeviceID(reply(promise));
    }

    @Override
    public void getServerAdjustedCurrentTimeMS(Promise promise) {
        core.getServerAdjustedCurrentTimeMS(reply(promise));
    }

    @Override
    public void setDataHashInToken(String data, Promise promise) {
        core.setDataHashInToken(data, reply(promise));
    }

    @Override
    public void fetchToken(String url, Promise promise) {
        core.fetchToken(url, reply(promise));
    }

    @Override
    public void fetchSecureString(String key, @Nullable String newDef, Promise promise) {
        core.fetchSecureString(key, newDef, reply(promise));
    }

    @Override
    public void fetchCustomJWT(String payload, Promise promise) {
        core.fetchCustomJWT(payload, reply(promise));
    }

    @Override
    public void getAccountMessageSignature(String message, Promise promise) {
        core.getAccountMessageSignature(message, reply(promise));
    }

    @Override
    public void getInstallMessageSignature(String message, Promise promise) {
        core.getInstallMessageSignature(message, reply(promise));
    }

    @Override
    public void getLastARC(Promise promise) {
        core.getLastARC(reply(promise));
    }

    @Override
    public void setInstallAttributes(String attrs, Promise promise) {
        core.setInstallAttributes(attrs, reply(promise));
    }

    // ---- persisted configuration overrides, which apply from the next launch ----

    @Override
    public void setPersistentConfiguration(String json, @Nullable String source, Promise promise) {
        core.setPersistentConfiguration(json, source, reply(promise));
    }

    @Override
    public void clearPersistentConfiguration(Promise promise) {
        core.clearPersistentConfiguration(reply(promise));
    }

    @Override
    public void getPersistentConfigurationSource(Promise promise) {
        core.getPersistentConfigurationSource(reply(promise));
    }
}
