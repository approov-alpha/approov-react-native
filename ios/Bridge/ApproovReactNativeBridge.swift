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
import os.log
#if canImport(ApproovServiceCore)
import ApproovServiceCore
#else
import ApproovService
#endif

/**
 * ApproovReactNativeBridge carries out the methods of the ApproovReactNative TurboModule, which forwards
 * each JavaScript call here. Every method calls exactly one method of the universal layer and settles its
 * promise through the resolve or reject block. Configuration methods run on the calling queue, the module's
 * own serial method queue, since they only take the layer's lock. initialize, the methods that call the
 * SDK and the persisted configuration methods run on a queue of their own, never on the main thread or the
 * JavaScript thread, since they can block on the network or the file system. They are taken in the order
 * JavaScript calls them: each waits its turn on a serial queue, so it starts only once every earlier call
 * that changes state (initialize, setDevKey, setDataHashInToken, setInstallAttributes and the persisted
 * configuration writes) has finished. A call that changes state runs on the serial queue itself; a read,
 * such as fetchToken, then moves to the concurrent direct queue, so that a long fetch does not hold up the
 * calls after it. Nothing here depends on React Native, so the logic is tested without it.
 */
@objc(ApproovReactNativeBridge)
public final class ApproovReactNativeBridge: NSObject, @unchecked Sendable {

    // settles a promise with a value, or with nil for JavaScript null
    public typealias Resolve = @Sendable (Any?) -> Void

    // rejects a promise with a code, a message and the error carrying the userInfo
    public typealias Reject = @Sendable (String, String, NSError) -> Void

    // logs a message at a level, which the tests replace to observe the warnings
    typealias Logger = @Sendable (ApproovLogLevel, String) -> Void

    // the universal layer
    private let api: ApproovServiceAPI

    // the concurrent queue that the reads run on
    let directQueue: DispatchQueue

    // the serial queue, on the direct queue, that takes initialize and the SDK calls in call order and runs
    // those that change state
    private let serialQueue: DispatchQueue

    // the logger for the module's own messages
    private let log: Logger

    /**
     * Creates the bridge over the given universal layer API.
     *
     * @param api is the universal layer API to forward to
     * @param directQueue is the concurrent queue for the reads, which the serial queue runs on
     * @param log is the logger for the module's own messages
     */
    init(api: ApproovServiceAPI,
         directQueue: DispatchQueue = DispatchQueue(label: "io.approov.react.direct", qos: .userInitiated,
                                                    attributes: .concurrent),
         log: @escaping Logger = { ApproovReactNativeBridge.osLog($0, $1) }) {
        self.api = api
        self.directQueue = directQueue
        self.serialQueue = DispatchQueue(label: "io.approov.react.serial", target: directQueue)
        self.log = log
        super.init()
    }

    /**
     * Logs a message of the module through os_log, if the layer's logging level includes it.
     *
     * @param level is the logging level of the message
     * @param message is the message to be logged, which never includes a value
     */
    static func osLog(_ level: ApproovLogLevel, _ message: String) {
        guard ApproovInterceptor.shared.loggingLevel >= level else { return }
        let type: OSLogType
        switch level {
        case .error: type = .error
        case .warning: type = .default
        case .debug: type = .debug
        default: type = .info
        }
        os_log("ApproovService: React Native: %{public}@", type: type, message)
    }

    // runs a call that can throw on the calling queue and settles the promise with its result
    private func run(_ method: String, _ resolve: Resolve, _ reject: Reject, _ call: () throws -> Any?) {
        do {
            resolve(try call())
        } catch {
            let rejection = ApproovReactNativeErrors.rejection(for: error, method: method)
            reject(rejection.code, rejection.message, rejection.error)
        }
    }

    // runs a call that changes state on the serial queue, so that no later call starts before it has
    // finished, and settles the promise there with its result
    private func runSerial(_ method: String, _ resolve: @escaping Resolve, _ reject: @escaping Reject,
                           _ call: @escaping @Sendable () throws -> Any?) {
        serialQueue.async {
            Self.settle(method, resolve, reject, call)
        }
    }

    // runs a read on the direct queue once every earlier call that changes state has finished, so that it
    // sees them and a long read still does not hold up the calls after it, and settles the promise there
    private func runRead(_ method: String, _ resolve: @escaping Resolve, _ reject: @escaping Reject,
                         _ call: @escaping @Sendable () throws -> Any?) {
        let directQueue = self.directQueue
        serialQueue.async {
            directQueue.async {
                Self.settle(method, resolve, reject, call)
            }
        }
    }

    // makes a call and settles the promise with its result or its failure
    private static func settle(_ method: String, _ resolve: Resolve, _ reject: Reject,
                               _ call: () throws -> Any?) {
        do {
            resolve(try call())
        } catch {
            let rejection = ApproovReactNativeErrors.rejection(for: error, method: method)
            reject(rejection.code, rejection.message, rejection.error)
        }
    }

    /**
     * Gets the value to resolve a promise with for an optional string: React Native gives JavaScript
     * undefined for nil, so a missing value is passed as NSNull, which JavaScript receives as null.
     *
     * @param value is the optional string
     * @return the string, or NSNull if there is none
     */
    static func orNull(_ value: String?) -> Any {
        return value ?? NSNull()
    }

    // rejects a promise for an argument the module cannot pass on
    private func rejectArgument(_ method: String, _ message: String, _ reject: Reject) {
        let rejection = ApproovReactNativeErrors.invalidArgument(method: method, message: message)
        reject(rejection.code, rejection.message, rejection.error)
    }


    /**
     * Initializes Approov on the serial queue. A nil account ID is the file form, which reads the bundled
     * approov.config and takes the account ID and comment from it; otherwise the account ID and comment are
     * passed on and the file is never read.
     *
     * @param accountId is the Approov account ID, or nil for the file form
     * @param comment is the comment, or nil for none, and always nil with the file form
     * @param resolve settles the promise with nil
     * @param reject rejects the promise, with the type initialization
     */
    @objc(initialize:comment:resolve:reject:)
    public func initialize(_ accountId: String?, comment: String?,
                           resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        let log = self.log
        serialQueue.async {
            do {
                if let accountId {
                    try api.initialize(accountId, comment: comment)
                } else if comment != nil {
                    // the file form takes the comment from approov.config
                    throw ApproovServiceError.initializationError(
                        message: "initialize: a comment needs an account ID, approov.config has its own")
                } else {
                    try api.initialize()
                }
                resolve(nil)
            } catch {
                // the SDK refused: name the usual cause, another caller using a different comment or account ID;
                // a problem with approov.config itself carries no SDK error and the layer has logged it
                if case .initializationError(_, let underlying) = error as? ApproovServiceError,
                   (accountId != nil) || (underlying != nil) {
                    let used = (accountId == nil) ? ", which come from approov.config here" : ""
                    log(.error, "initialize rejected by the Approov SDK, check that every caller of initialize, " +
                        "native and JavaScript, passes the same account ID and comment" + used)
                }
                let rejection = ApproovReactNativeErrors.rejection(for: error, method: "initialize")
                reject(rejection.code, rejection.message, rejection.error)
            }
        }
    }

    @objc(isApproovServiceEnabled:reject:)
    public func isApproovServiceEnabled(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(api.isApproovServiceEnabled())
    }

    @objc(isApproovProtectionEnabled:reject:)
    public func isApproovProtectionEnabled(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(api.isApproovProtectionEnabled())
    }

    @objc(isInterceptionInstalled:reject:)
    public func isInterceptionInstalled(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(api.verifyInterceptionInstalled())
    }


    @objc(setTokenHeader:prefix:resolve:reject:)
    public func setTokenHeader(_ header: String, prefix: String?, resolve: @escaping Resolve, reject: @escaping Reject) {
        api.setTokenHeader(header, prefix: prefix)
        resolve(nil)
    }

    @objc(getTokenHeader:reject:)
    public func getTokenHeader(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(api.getTokenHeader())
    }

    @objc(getTokenPrefix:reject:)
    public func getTokenPrefix(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(api.getTokenPrefix())
    }

    @objc(setTraceIDHeader:resolve:reject:)
    public func setTraceIDHeader(_ header: String?, resolve: @escaping Resolve, reject: @escaping Reject) {
        api.setTraceIDHeader(header)
        resolve(nil)
    }

    @objc(getTraceIDHeader:reject:)
    public func getTraceIDHeader(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(Self.orNull(api.getTraceIDHeader()))
    }

    @objc(setStatusHeader:resolve:reject:)
    public func setStatusHeader(_ header: String?, resolve: @escaping Resolve, reject: @escaping Reject) {
        api.setStatusHeader(header)
        resolve(nil)
    }

    @objc(getStatusHeader:reject:)
    public func getStatusHeader(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(Self.orNull(api.getStatusHeader()))
    }

    @objc(setBindingHeader:resolve:reject:)
    public func setBindingHeader(_ header: String?, resolve: @escaping Resolve, reject: @escaping Reject) {
        run("setBindingHeader", resolve, reject) { try self.api.setBindingHeader(header); return nil }
    }

    @objc(getBindingHeader:reject:)
    public func getBindingHeader(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(Self.orNull(api.getBindingHeader()))
    }


    @objc(addSubstitutionHeader:requiredPrefix:resolve:reject:)
    public func addSubstitutionHeader(_ header: String, requiredPrefix: String?,
                                      resolve: @escaping Resolve, reject: @escaping Reject) {
        // the layer takes an empty string for no required prefix
        run("addSubstitutionHeader", resolve, reject) {
            try self.api.addSubstitutionHeader(header, requiredPrefix: requiredPrefix ?? "")
            return nil
        }
    }

    @objc(removeSubstitutionHeader:resolve:reject:)
    public func removeSubstitutionHeader(_ header: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        api.removeSubstitutionHeader(header)
        resolve(nil)
    }

    @objc(addSubstitutionQueryParam:resolve:reject:)
    public func addSubstitutionQueryParam(_ key: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        api.addSubstitutionQueryParam(key)
        resolve(nil)
    }

    @objc(removeSubstitutionQueryParam:resolve:reject:)
    public func removeSubstitutionQueryParam(_ key: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        api.removeSubstitutionQueryParam(key)
        resolve(nil)
    }

    @objc(addExclusionURLRegex:resolve:reject:)
    public func addExclusionURLRegex(_ regex: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        run("addExclusionURLRegex", resolve, reject) { try self.api.addExclusionURLRegex(regex); return nil }
    }

    @objc(removeExclusionURLRegex:resolve:reject:)
    public func removeExclusionURLRegex(_ regex: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        api.removeExclusionURLRegex(regex)
        resolve(nil)
    }


    /**
     * Gets the JavaScript name of an installed mutator by identity alone: CLOSE_FAILURE or ALWAYS_PROCEED
     * when it is that standard instance, which is also how DEFAULT is reported, and CUSTOM otherwise. The
     * mutator is never called and none of its properties is read, so an app's mutator cannot claim a
     * standard name or make this fail.
     *
     * @param mutator is the installed mutator
     * @return the name of the mutator
     */
    static func mutatorName(_ mutator: ApproovServiceMutator) -> String {
        let installed = mutator as AnyObject
        if installed === ApproovCloseFailureMutator.CLOSE_FAILURE {
            return "CLOSE_FAILURE"
        } else if installed === ApproovAlwaysProceedMutator.ALWAYS_PROCEED {
            return "ALWAYS_PROCEED"
        }
        return "CUSTOM"
    }

    /**
     * Gets the standard mutator for a JavaScript name, where nil selects DEFAULT.
     *
     * @param name is the name of the mutator, or nil
     * @return the mutator to install, or nil if the name is not known
     */
    static func mutator(named name: String?) -> ApproovServiceMutator? {
        switch name {
        case nil, "DEFAULT": return ApproovAlwaysProceedMutator.DEFAULT
        case "CLOSE_FAILURE": return ApproovCloseFailureMutator.CLOSE_FAILURE
        case "ALWAYS_PROCEED": return ApproovAlwaysProceedMutator.ALWAYS_PROCEED
        default: return nil
        }
    }

    @objc(setServiceMutator:resolve:reject:)
    public func setServiceMutator(_ name: String?, resolve: @escaping Resolve, reject: @escaping Reject) {
        guard let mutator = Self.mutator(named: name) else {
            rejectArgument("setServiceMutator", "the mutator must be CLOSE_FAILURE, ALWAYS_PROCEED, DEFAULT or null",
                           reject)
            return
        }

        // replacing an app's own mutator is allowed as the last write, but never silent
        let previous = api.getServiceMutator()
        if Self.mutatorName(previous) == "CUSTOM" {
            log(.warning, "setServiceMutator: replacing the app's own service mutator " +
                String(reflecting: type(of: previous)) + " with " + (name ?? "DEFAULT"))
        }
        api.setServiceMutator(mutator)
        resolve(nil)
    }

    @objc(getServiceMutator:reject:)
    public func getServiceMutator(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(Self.mutatorName(api.getServiceMutator()))
    }


    @objc(enableMessageSigning:resolve:reject:)
    public func enableMessageSigning(_ options: [String: Any], resolve: @escaping Resolve, reject: @escaping Reject) {
        let factory: SignatureParametersFactory
        do {
            factory = try ApproovReactNativeSigning.makeFactory(options)
        } catch let error as SigningOptionsError {
            rejectArgument("enableMessageSigning", error.message, reject)
            return
        } catch {
            run("enableMessageSigning", resolve, reject) { throw error }
            return
        }
        warnIfCustomFactory("enableMessageSigning", hostName: nil)
        api.enableMessageSigning(factory)
        resolve(nil)
    }

    @objc(setMessageSigningHostOptions:options:resolve:reject:)
    public func setMessageSigningHostOptions(_ hostName: String, options: [String: Any]?,
                                             resolve: @escaping Resolve, reject: @escaping Reject) {
        var factory: SignatureParametersFactory?
        if let options {
            do {
                factory = try ApproovReactNativeSigning.makeFactory(options)
            } catch let error as SigningOptionsError {
                rejectArgument("setMessageSigningHostOptions", error.message, reject)
                return
            } catch {
                run("setMessageSigningHostOptions", resolve, reject) { throw error }
                return
            }
        }
        warnIfCustomFactory("setMessageSigningHostOptions", hostName: hostName)
        api.putMessageSigningHostFactory(hostName: hostName, factory: factory)
        resolve(nil)
    }

    // warns when the factory about to be replaced or removed is a subclass that native code installed, naming it
    // by its type only
    private func warnIfCustomFactory(_ method: String, hostName: String?) {
        guard let current = api.getMessageSigningFactoryClass(hostName: hostName),
              current != SignatureParametersFactory.self else {
            return
        }
        log(.warning, method + ": the app's own message signing factory " + String(reflecting: current) + " for " +
            (hostName.map { "host " + $0 } ?? "the default") + " was replaced from JavaScript")
    }

    @objc(disableMessageSigning:reject:)
    public func disableMessageSigning(resolve: @escaping Resolve, reject: @escaping Reject) {
        api.disableMessageSigning()
        resolve(nil)
    }

    @objc(isMessageSigningEnabled:reject:)
    public func isMessageSigningEnabled(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(api.isMessageSigningEnabled())
    }


    /**
     * Gets the logging level of the layer for a JavaScript name.
     *
     * @param name is OFF, ERROR, WARNING, INFO or DEBUG
     * @return the logging level, or nil if the name is not known
     */
    static func loggingLevel(named name: String) -> ApproovLogLevel? {
        switch name {
        case "OFF": return .off
        case "ERROR": return .error
        case "WARNING": return .warning
        case "INFO": return .info
        case "DEBUG": return .debug
        default: return nil
        }
    }

    @objc(setLoggingLevel:resolve:reject:)
    public func setLoggingLevel(_ level: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        guard let loggingLevel = Self.loggingLevel(named: level) else {
            rejectArgument("setLoggingLevel", "the level must be OFF, ERROR, WARNING, INFO or DEBUG", reject)
            return
        }
        api.setLoggingLevel(loggingLevel)
        resolve(nil)
    }

    @objc(setDevKey:resolve:reject:)
    public func setDevKey(_ devKey: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runSerial("setDevKey", resolve, reject) { try api.setDevKey(devKey); return nil }
    }


    @objc(getDeviceID:reject:)
    public func getDeviceID(resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("getDeviceID", resolve, reject) { try api.getDeviceID() }
    }

    @objc(getServerAdjustedCurrentTimeMS:reject:)
    public func getServerAdjustedCurrentTimeMS(resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("getServerAdjustedCurrentTimeMS", resolve, reject) {
            NSNumber(value: try api.getServerAdjustedCurrentTimeMS())
        }
    }

    @objc(setDataHashInToken:resolve:reject:)
    public func setDataHashInToken(_ data: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runSerial("setDataHashInToken", resolve, reject) { try api.setDataHashInToken(data); return nil }
    }

    @objc(fetchToken:resolve:reject:)
    public func fetchToken(_ url: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("fetchToken", resolve, reject) { try api.fetchToken(url: url) }
    }

    @objc(fetchSecureString:newDef:resolve:reject:)
    public func fetchSecureString(_ key: String, newDef: String?, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("fetchSecureString", resolve, reject) { Self.orNull(try api.fetchSecureString(key: key, newDef: newDef)) }
    }

    @objc(fetchCustomJWT:resolve:reject:)
    public func fetchCustomJWT(_ payload: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("fetchCustomJWT", resolve, reject) { Self.orNull(try api.fetchCustomJWT(payload: payload)) }
    }

    @objc(getAccountMessageSignature:resolve:reject:)
    public func getAccountMessageSignature(_ message: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("getAccountMessageSignature", resolve, reject) { Self.orNull(try api.getAccountMessageSignature(message: message)) }
    }

    @objc(getInstallMessageSignature:resolve:reject:)
    public func getInstallMessageSignature(_ message: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("getInstallMessageSignature", resolve, reject) { Self.orNull(try api.getInstallMessageSignature(message: message)) }
    }

    @objc(getLastARC:reject:)
    public func getLastARC(resolve: @escaping Resolve, reject: @escaping Reject) {
        resolve(api.getLastARC())
    }

    @objc(setInstallAttributes:resolve:reject:)
    public func setInstallAttributes(_ attrs: String, resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runSerial("setInstallAttributes", resolve, reject) { try api.setInstallAttributes(attrs); return nil }
    }


    /**
     * Stores options that the file form of initialize applies over the bundled approov.config from
     * the next launch, on the serial queue as it reads and writes a file. Nothing changes in this
     * process. A refusal by the layer rejects with the type general and the layer's message, which
     * names the cause and never a value.
     *
     * @param json is the JSON object of the options
     * @param source is the tag naming where the options came from, or nil for none
     * @param resolve settles the promise with nil
     * @param reject rejects the promise
     */
    @objc(setPersistentConfiguration:source:resolve:reject:)
    public func setPersistentConfiguration(_ json: String, source: String?,
                                           resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runSerial("setPersistentConfiguration", resolve, reject) {
            try api.setPersistentConfiguration(json, source: source)
            return nil
        }
    }

    /**
     * Deletes the options stored by setPersistentConfiguration, on the serial queue, so the bundled
     * approov.config alone applies from the next launch. Nothing changes in this process, and it is not an
     * error if none are stored.
     *
     * @param resolve settles the promise with nil
     * @param reject rejects the promise, with the type general, if the stored options cannot be deleted
     */
    @objc(clearPersistentConfiguration:reject:)
    public func clearPersistentConfiguration(resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runSerial("clearPersistentConfiguration", resolve, reject) {
            try api.clearPersistentConfiguration()
            return nil
        }
    }

    /**
     * Gets the source stored with the options of setPersistentConfiguration, on the direct queue. This is
     * what is stored, which may only apply from the next launch.
     *
     * @param resolve settles the promise with the source, or NSNull if none is stored
     * @param reject is never called, as the layer reports no error
     */
    @objc(getPersistentConfigurationSource:reject:)
    public func getPersistentConfigurationSource(resolve: @escaping Resolve, reject: @escaping Reject) {
        let api = self.api
        runRead("getPersistentConfigurationSource", resolve, reject) {
            Self.orNull(api.persistentConfigurationSource())
        }
    }
}
