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

import android.content.Context;

import io.approov.service.android.ApproovDefaultMessageSigning.SignatureParametersFactory;
import io.approov.service.android.ApproovLogLevel;
import io.approov.service.android.ApproovServiceMutator;

/**
 * ApproovServiceApi is the part of the universal layer's ApproovService that the React Native module calls, one
 * method per static of the same name, so that the forwarding can be tested without the Approov SDK. STATICS is
 * the implementation the module uses: it calls the ApproovService statics and nothing else.
 */
interface ApproovServiceApi {
    void initialize(Context context, String config, String comment);

    void initialize(Context context) throws Exception;

    boolean isApproovServiceEnabled();

    boolean isApproovProtectionEnabled();

    void setHostFrameworkIdentity(String identity);

    void setTokenHeader(String header, String prefix);

    String getTokenHeader();

    String getTokenPrefix();

    void setTraceIDHeader(String header);

    String getTraceIDHeader();

    void setStatusHeader(String header);

    String getStatusHeader();

    void setBindingHeader(String header);

    String getBindingHeader();

    void addSubstitutionHeader(String header, String requiredPrefix);

    void removeSubstitutionHeader(String header);

    void addSubstitutionQueryParam(String key);

    void removeSubstitutionQueryParam(String key);

    void addExclusionURLRegex(String urlRegex);

    void removeExclusionURLRegex(String urlRegex);

    void setServiceMutator(ApproovServiceMutator mutator);

    ApproovServiceMutator getServiceMutator();

    void enableMessageSigning(SignatureParametersFactory defaultFactory);

    void putMessageSigningHostFactory(String hostName, SignatureParametersFactory factory);

    Class<? extends SignatureParametersFactory> getMessageSigningFactoryClass(String hostName);

    void disableMessageSigning();

    boolean isMessageSigningEnabled();

    void setLoggingLevel(ApproovLogLevel level);

    void setDevKey(String devKey) throws Exception;

    String getDeviceID() throws Exception;

    long getServerAdjustedCurrentTimeMS() throws Exception;

    void setDataHashInToken(String data) throws Exception;

    String fetchToken(String url) throws Exception;

    String fetchSecureString(String key, String newDef) throws Exception;

    String fetchCustomJWT(String payload) throws Exception;

    String getAccountMessageSignature(String message) throws Exception;

    String getInstallMessageSignature(String message) throws Exception;

    String getLastARC();

    void setInstallAttributes(String attrs) throws Exception;

    void setPersistentConfiguration(Context context, String json, String source) throws Exception;

    void clearPersistentConfiguration(Context context) throws Exception;

    String getPersistentConfigurationSource(Context context);

    /**
     * The universal layer's ApproovService statics.
     */
    ApproovServiceApi STATICS = new ApproovServiceStatics();
}
