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

import java.util.List;

import io.approov.service.android.okhttp.ApproovInterceptor;
import okhttp3.Interceptor;
import okhttp3.OkHttpClient;

/**
 * ApproovReactNativeInterception decides whether React Native's networking is protected. The Approov
 * Gradle plugin (io.approov.gradle) weaves React Native's OkHttpClientProvider so that every builder its
 * createClientBuilder() returns carries the universal layer's ApproovInterceptor as its last network interceptor,
 * and every client React Native derives from it does too. So a builder from createClientBuilder() is all that is
 * checked: no marker, no reflection and no request is involved.
 */
final class ApproovReactNativeInterception {
    /**
     * Construction is disallowed as this is a static only class.
     */
    private ApproovReactNativeInterception() {
    }

    /**
     * Indicates whether a builder carries the Approov network interceptor as its last network interceptor, where
     * the layer's protect() puts it.
     *
     * @param builder is the builder from OkHttpClientProvider.createClientBuilder(), or null
     * @return true if the last network interceptor of the builder is ApproovInterceptor, false otherwise
     */
    static boolean carriesApproov(OkHttpClient.Builder builder) {
        if (builder == null)
            return false;
        List<Interceptor> interceptors = builder.networkInterceptors();
        return (!interceptors.isEmpty()) && (interceptors.get(interceptors.size() - 1) instanceof ApproovInterceptor);
    }
}
