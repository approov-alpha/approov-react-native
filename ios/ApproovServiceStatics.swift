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

import Foundation
@_spi(HostFramework) import ApproovService

// ApproovServiceStatics forwards every call to the matching ApproovService static of the universal layer,
// which is a Swift enum that Objective-C cannot see.
struct ApproovServiceStatics: ApproovServiceAPI {

    func initialize(_ config: String, comment: String?) throws {
        try ApproovService.initialize(config, comment: comment)
    }

    func initialize() throws {
        try ApproovService.initialize()
    }

    func isApproovServiceEnabled() -> Bool {
        return ApproovService.isApproovServiceEnabled()
    }

    func isApproovProtectionEnabled() -> Bool {
        return ApproovService.isApproovProtectionEnabled()
    }

    func verifyInterceptionInstalled() -> Bool {
        return ApproovService.verifyInterceptionInstalled()
    }

    func setTokenHeader(_ header: String, prefix: String?) {
        ApproovService.setTokenHeader(header, prefix: prefix)
    }

    func getTokenHeader() -> String {
        return ApproovService.getTokenHeader()
    }

    func getTokenPrefix() -> String {
        return ApproovService.getTokenPrefix()
    }

    func setTraceIDHeader(_ header: String?) {
        ApproovService.setTraceIDHeader(header)
    }

    func getTraceIDHeader() -> String? {
        return ApproovService.getTraceIDHeader()
    }

    func setStatusHeader(_ header: String?) {
        ApproovService.setStatusHeader(header)
    }

    func getStatusHeader() -> String? {
        return ApproovService.getStatusHeader()
    }

    func setBindingHeader(_ header: String?) throws {
        try ApproovService.setBindingHeader(header)
    }

    func getBindingHeader() -> String? {
        return ApproovService.getBindingHeader()
    }

    func addSubstitutionHeader(_ header: String, requiredPrefix: String) throws {
        try ApproovService.addSubstitutionHeader(header, requiredPrefix: requiredPrefix)
    }

    func removeSubstitutionHeader(_ header: String) {
        ApproovService.removeSubstitutionHeader(header)
    }

    func addSubstitutionQueryParam(_ key: String) {
        ApproovService.addSubstitutionQueryParam(key)
    }

    func removeSubstitutionQueryParam(_ key: String) {
        ApproovService.removeSubstitutionQueryParam(key)
    }

    func addExclusionURLRegex(_ pattern: String) throws {
        try ApproovService.addExclusionURLRegex(pattern)
    }

    func removeExclusionURLRegex(_ pattern: String) {
        ApproovService.removeExclusionURLRegex(pattern)
    }

    func setServiceMutator(_ mutator: ApproovServiceMutator?) {
        ApproovService.setServiceMutator(mutator)
    }

    func getServiceMutator() -> ApproovServiceMutator {
        return ApproovService.getServiceMutator()
    }

    func enableMessageSigning(_ defaultFactory: SignatureParametersFactory?) {
        ApproovService.enableMessageSigning(defaultFactory)
    }

    func putMessageSigningHostFactory(hostName: String, factory: SignatureParametersFactory?) {
        ApproovService.putMessageSigningHostFactory(hostName: hostName, factory: factory)
    }

    func getMessageSigningFactoryClass(hostName: String?) -> SignatureParametersFactory.Type? {
        return ApproovService.getMessageSigningFactoryClass(hostName: hostName)
    }

    func disableMessageSigning() {
        ApproovService.disableMessageSigning()
    }

    func isMessageSigningEnabled() -> Bool {
        return ApproovService.isMessageSigningEnabled()
    }

    func setLoggingLevel(_ level: ApproovLogLevel) {
        ApproovService.setLoggingLevel(level)
    }

    func setDevKey(_ devKey: String) throws {
        try ApproovService.setDevKey(devKey)
    }

    func getDeviceID() throws -> String {
        return try ApproovService.getDeviceID()
    }

    func getServerAdjustedCurrentTimeMS() throws -> Int64 {
        return try ApproovService.getServerAdjustedCurrentTimeMS()
    }

    func setDataHashInToken(_ data: String) throws {
        try ApproovService.setDataHashInToken(data)
    }

    func fetchToken(url: String) throws -> String {
        return try ApproovService.fetchToken(url: url)
    }

    func fetchSecureString(key: String, newDef: String?) throws -> String? {
        return try ApproovService.fetchSecureString(key: key, newDef: newDef)
    }

    func fetchCustomJWT(payload: String) throws -> String? {
        return try ApproovService.fetchCustomJWT(payload: payload)
    }

    func getAccountMessageSignature(message: String) throws -> String? {
        return try ApproovService.getAccountMessageSignature(message: message)
    }

    func getInstallMessageSignature(message: String) throws -> String? {
        return try ApproovService.getInstallMessageSignature(message: message)
    }

    func getLastARC() -> String {
        return ApproovService.getLastARC()
    }

    func setInstallAttributes(_ attrs: String) throws {
        try ApproovService.setInstallAttributes(attrs)
    }

    func setPersistentConfiguration(_ json: String, source: String?) throws {
        try ApproovService.setPersistentConfiguration(json, source: source)
    }

    func clearPersistentConfiguration() throws {
        try ApproovService.clearPersistentConfiguration()
    }

    func persistentConfigurationSource() -> String? {
        return ApproovService.persistentConfigurationSource()
    }
}

extension ApproovReactNativeBridge {

    /**
     * Creates the bridge over the universal layer, for the TurboModule.
     *
     * @return ApproovReactNativeBridge forwarding to ApproovService
     */
    @objc public static func makeDefault() -> ApproovReactNativeBridge {
        return ApproovReactNativeBridge(api: ApproovServiceStatics())
    }

    /**
     * Prepares the universal layer when the package is loaded, before any React Native session exists:
     * installs interception, which leaves requests untouched until initialize succeeds, and sets the user
     * property the layer reports to approov-react-native/<npmVersion>.
     *
     * @param npmVersion is the version of the @approov/approov-react-native package
     */
    @objc(prepareAtLoad:) public static func prepareAtLoad(npmVersion: String) {
        ApproovService.installInterception()
        ApproovService.setHostFrameworkIdentity("approov-react-native/" + npmVersion)
    }
}
