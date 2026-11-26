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
import io.approov.service.android.ApproovService;
import io.approov.service.android.ApproovServiceMutator;

/**
 * ApproovServiceStatics implements ApproovServiceApi with the universal layer's ApproovService statics, each
 * method calling the static of the same name with its arguments unchanged.
 */
final class ApproovServiceStatics implements ApproovServiceApi {
    @Override
    public void initialize(Context context, String config, String comment) {
        ApproovService.initialize(context, config, comment);
    }

    @Override
    public void initialize(Context context) throws Exception {
        ApproovService.initialize(context);
    }

    @Override
    public boolean isApproovServiceEnabled() {
        return ApproovService.isApproovServiceEnabled();
    }

    @Override
    public boolean isApproovProtectionEnabled() {
        return ApproovService.isApproovProtectionEnabled();
    }

    @Override
    @SuppressWarnings("RestrictedApi")
    public void setHostFrameworkIdentity(String identity) {
        ApproovService.setHostFrameworkIdentity(identity);
    }

    @Override
    public void setTokenHeader(String header, String prefix) {
        ApproovService.setTokenHeader(header, prefix);
    }

    @Override
    public String getTokenHeader() {
        return ApproovService.getTokenHeader();
    }

    @Override
    public String getTokenPrefix() {
        return ApproovService.getTokenPrefix();
    }

    @Override
    public void setTraceIDHeader(String header) {
        ApproovService.setTraceIDHeader(header);
    }

    @Override
    public String getTraceIDHeader() {
        return ApproovService.getTraceIDHeader();
    }

    @Override
    public void setStatusHeader(String header) {
        ApproovService.setStatusHeader(header);
    }

    @Override
    public String getStatusHeader() {
        return ApproovService.getStatusHeader();
    }

    @Override
    public void setBindingHeader(String header) {
        ApproovService.setBindingHeader(header);
    }

    @Override
    public String getBindingHeader() {
        return ApproovService.getBindingHeader();
    }

    @Override
    public void addSubstitutionHeader(String header, String requiredPrefix) {
        ApproovService.addSubstitutionHeader(header, requiredPrefix);
    }

    @Override
    public void removeSubstitutionHeader(String header) {
        ApproovService.removeSubstitutionHeader(header);
    }

    @Override
    public void addSubstitutionQueryParam(String key) {
        ApproovService.addSubstitutionQueryParam(key);
    }

    @Override
    public void removeSubstitutionQueryParam(String key) {
        ApproovService.removeSubstitutionQueryParam(key);
    }

    @Override
    public void addExclusionURLRegex(String urlRegex) {
        ApproovService.addExclusionURLRegex(urlRegex);
    }

    @Override
    public void removeExclusionURLRegex(String urlRegex) {
        ApproovService.removeExclusionURLRegex(urlRegex);
    }

    @Override
    public void setServiceMutator(ApproovServiceMutator mutator) {
        ApproovService.setServiceMutator(mutator);
    }

    @Override
    public ApproovServiceMutator getServiceMutator() {
        return ApproovService.getServiceMutator();
    }

    @Override
    public void enableMessageSigning(SignatureParametersFactory defaultFactory) {
        ApproovService.enableMessageSigning(defaultFactory);
    }

    @Override
    public void putMessageSigningHostFactory(String hostName, SignatureParametersFactory factory) {
        ApproovService.putMessageSigningHostFactory(hostName, factory);
    }

    @Override
    @SuppressWarnings("RestrictedApi")
    public Class<? extends SignatureParametersFactory> getMessageSigningFactoryClass(String hostName) {
        return ApproovService.getMessageSigningFactoryClass(hostName);
    }

    @Override
    public void disableMessageSigning() {
        ApproovService.disableMessageSigning();
    }

    @Override
    public boolean isMessageSigningEnabled() {
        return ApproovService.isMessageSigningEnabled();
    }

    @Override
    public void setLoggingLevel(ApproovLogLevel level) {
        ApproovService.setLoggingLevel(level);
    }

    @Override
    public void setDevKey(String devKey) throws Exception {
        ApproovService.setDevKey(devKey);
    }

    @Override
    public String getDeviceID() throws Exception {
        return ApproovService.getDeviceID();
    }

    @Override
    public long getServerAdjustedCurrentTimeMS() throws Exception {
        return ApproovService.getServerAdjustedCurrentTimeMS();
    }

    @Override
    public void setDataHashInToken(String data) throws Exception {
        ApproovService.setDataHashInToken(data);
    }

    @Override
    public String fetchToken(String url) throws Exception {
        return ApproovService.fetchToken(url);
    }

    @Override
    public String fetchSecureString(String key, String newDef) throws Exception {
        return ApproovService.fetchSecureString(key, newDef);
    }

    @Override
    public String fetchCustomJWT(String payload) throws Exception {
        return ApproovService.fetchCustomJWT(payload);
    }

    @Override
    public String getAccountMessageSignature(String message) throws Exception {
        return ApproovService.getAccountMessageSignature(message);
    }

    @Override
    public String getInstallMessageSignature(String message) throws Exception {
        return ApproovService.getInstallMessageSignature(message);
    }

    @Override
    public String getLastARC() {
        return ApproovService.getLastARC();
    }

    @Override
    public void setInstallAttributes(String attrs) throws Exception {
        ApproovService.setInstallAttributes(attrs);
    }

    @Override
    public void setPersistentConfiguration(Context context, String json, String source)
            throws Exception {
        ApproovService.setPersistentConfiguration(context, json, source);
    }

    @Override
    public void clearPersistentConfiguration(Context context) throws Exception {
        ApproovService.clearPersistentConfiguration(context);
    }

    @Override
    public String getPersistentConfigurationSource(Context context) {
        return ApproovService.getPersistentConfigurationSource(context);
    }
}
