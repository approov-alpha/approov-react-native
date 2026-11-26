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
#if canImport(ApproovServiceCore)
import ApproovServiceCore
#else
import ApproovService
#endif

// ApproovReactNativeRejection is a promise rejection of the module: the method name as the code, the
// message, and the error whose userInfo the JavaScript ApproovError reads.
struct ApproovReactNativeRejection {
    let code: String
    let message: String
    let error: NSError
}

// ApproovReactNativeErrors maps the errors of the universal layer to promise rejections, filling the same
// userInfo keys as the Android module, each present and null when it does not apply: type ("rejection",
// "network", "general" or "initialization"), status (the SDK status name), and rejectionARC and
// rejectionReasons for a rejection. iOS adds underlyingDomain and underlyingCode for an initialization error
// that carries the SDK's NSError and for an error that is not the layer's own.
enum ApproovReactNativeErrors {

    // the NSError domain of the rejections, which JavaScript sees as the error domain
    static let domain = "io.approov.react"

    /**
     * Maps an error thrown by the universal layer to a promise rejection. An initialization error keeps
     * the SDK message unchanged. No message carries a token or secure string value, since the layer's
     * errors never include one.
     *
     * @param error is the error thrown by the universal layer
     * @param method is the name of the JavaScript method that failed
     * @return ApproovReactNativeRejection for the promise
     */
    static func rejection(for error: Error, method: String) -> ApproovReactNativeRejection {
        // every key the JavaScript side reads is present, null when it does not apply, as on Android
        var userInfo: [String: Any] = ["status": NSNull(), "rejectionARC": NSNull(), "rejectionReasons": NSNull()]
        let message: String
        if let serviceError = error as? ApproovServiceError {
            userInfo["status"] = serviceError.status?.rawValue ?? NSNull()
            switch serviceError {
            case .rejectionError(_, let arc, let rejectionReasons):
                userInfo["type"] = "rejection"
                userInfo["rejectionARC"] = arc
                userInfo["rejectionReasons"] = rejectionReasons
                message = serviceError.errorDescription ?? method
            case .networkingError:
                userInfo["type"] = "network"
                message = serviceError.errorDescription ?? method
            case .initializationError(let sdkMessage, let underlying):
                userInfo["type"] = "initialization"
                if let underlying {
                    userInfo["underlyingDomain"] = underlying.domain
                    userInfo["underlyingCode"] = underlying.code
                }
                message = sdkMessage
            case .permanentError, .pinningError:
                // including the error for a call made while Approov protection is not enabled
                userInfo["type"] = "general"
                message = serviceError.errorDescription ?? method
            }
        } else {
            // an error of the app's own, such as one thrown by its service mutator
            let nsError = error as NSError
            userInfo["type"] = "general"
            userInfo["underlyingDomain"] = nsError.domain
            userInfo["underlyingCode"] = nsError.code
            message = nsError.localizedDescription
        }
        userInfo[NSLocalizedDescriptionKey] = message
        return ApproovReactNativeRejection(code: method, message: message,
                                           error: NSError(domain: domain, code: 0, userInfo: userInfo))
    }

    /**
     * Makes a rejection of the general type for an argument the module cannot pass on, which the
     * JavaScript API validates before calling, so this is only reached by a direct native call.
     *
     * @param method is the name of the JavaScript method that failed
     * @param message is the description of the problem
     * @return ApproovReactNativeRejection for the promise
     */
    static func invalidArgument(method: String, message: String) -> ApproovReactNativeRejection {
        let fullMessage = "\(method): \(message)"
        let userInfo: [String: Any] = ["type": "general", "status": NSNull(), "rejectionARC": NSNull(),
                                       "rejectionReasons": NSNull(), NSLocalizedDescriptionKey: fullMessage]
        return ApproovReactNativeRejection(code: method, message: fullMessage,
                                           error: NSError(domain: domain, code: 0, userInfo: userInfo))
    }
}
