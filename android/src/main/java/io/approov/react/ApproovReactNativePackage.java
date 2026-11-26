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

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.util.Collections;
import java.util.Map;

/**
 * ApproovReactNativePackage registers the TurboModule ApproovReactNative with React Native, found by autolinking.
 * When the class loads, which is when the app builds its package list, it sets the user property
 * approov-react-native/version through the universal layer's host framework hook: before initialize,
 * the initialization sets it, and after a native initialize in MainApplication.onCreate it is set at once.
 */
public class ApproovReactNativePackage extends BaseReactPackage {
    static {
        ApproovReactNativeCore.identify(ApproovServiceApi.STATICS, BuildConfig.APPROOV_REACT_NATIVE_VERSION,
                ApproovReactNativeCore.APPROOV_LOG);
    }

    @Nullable
    @Override
    public NativeModule getModule(@NonNull String name, @NonNull ReactApplicationContext reactContext) {
        if (ApproovReactNativeModule.NAME.equals(name))
            return new ApproovReactNativeModule(reactContext);
        return null;
    }

    @NonNull
    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        // a TurboModule only, created when JavaScript first asks for it
        Map<String, ReactModuleInfo> infos = Collections.singletonMap(ApproovReactNativeModule.NAME,
                new ReactModuleInfo(ApproovReactNativeModule.NAME, ApproovReactNativeModule.class.getName(),
                        false, false, false, true));
        return () -> infos;
    }
}
