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

// ApproovServiceAPI is the universal layer's API, one requirement per ApproovService static the module
// forwards to. The module makes exactly one of these calls per JavaScript method, through this protocol, so
// the tests can record the calls with a fake. ApproovServiceStatics.swift is the real implementation; it is
// kept out of this folder because it needs the Approov SDK, which this folder does not.

import Foundation
#if canImport(ApproovServiceCore)
import ApproovServiceCore
#else
import ApproovService
#endif

protocol ApproovServiceAPI: Sendable {

    // initialization and state
    func initialize(_ config: String, comment: String?) throws
    func initialize() throws
    func isApproovServiceEnabled() -> Bool
    func isApproovProtectionEnabled() -> Bool
    func verifyInterceptionInstalled() -> Bool

    // header names
    func setTokenHeader(_ header: String, prefix: String?)
    func getTokenHeader() -> String
    func getTokenPrefix() -> String
    func setTraceIDHeader(_ header: String?)
    func getTraceIDHeader() -> String?
    func setStatusHeader(_ header: String?)
    func getStatusHeader() -> String?
    func setBindingHeader(_ header: String?) throws
    func getBindingHeader() -> String?

    // substitutions and exclusions
    func addSubstitutionHeader(_ header: String, requiredPrefix: String) throws
    func removeSubstitutionHeader(_ header: String)
    func addSubstitutionQueryParam(_ key: String)
    func removeSubstitutionQueryParam(_ key: String)
    func addExclusionURLRegex(_ pattern: String) throws
    func removeExclusionURLRegex(_ pattern: String)

    // the service mutator
    func setServiceMutator(_ mutator: ApproovServiceMutator?)
    func getServiceMutator() -> ApproovServiceMutator

    // message signing
    func enableMessageSigning(_ defaultFactory: SignatureParametersFactory?)
    func putMessageSigningHostFactory(hostName: String, factory: SignatureParametersFactory?)
    func getMessageSigningFactoryClass(hostName: String?) -> SignatureParametersFactory.Type?
    func disableMessageSigning()
    func isMessageSigningEnabled() -> Bool

    // logging and development
    func setLoggingLevel(_ level: ApproovLogLevel)
    func setDevKey(_ devKey: String) throws

    // direct calls to the SDK
    func getDeviceID() throws -> String
    func getServerAdjustedCurrentTimeMS() throws -> Int64
    func setDataHashInToken(_ data: String) throws
    func fetchToken(url: String) throws -> String
    func fetchSecureString(key: String, newDef: String?) throws -> String?
    func fetchCustomJWT(payload: String) throws -> String?
    func getAccountMessageSignature(message: String) throws -> String?
    func getInstallMessageSignature(message: String) throws -> String?
    func getLastARC() -> String
    func setInstallAttributes(_ attrs: String) throws

    // persisted configuration overrides
    func setPersistentConfiguration(_ json: String, source: String?) throws
    func clearPersistentConfiguration() throws
    func persistentConfigurationSource() -> String?
}
