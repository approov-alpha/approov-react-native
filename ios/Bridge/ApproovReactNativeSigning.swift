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

// SigningOptionsError is thrown for a message signing option the module cannot apply, which the JavaScript
// API rejects before calling, so it is only reached by a direct native call.
struct SigningOptionsError: Error {
    let message: String
}

/**
 * ApproovReactNativeSigning builds a standard signature parameters factory from the JavaScript message
 * signing options. It always starts from the layer's default factory, never from an empty one, and applies
 * only the options that are present, each overriding the default:
 * <p>
 * - signatures: "both" (default), "install" (ecdsa-p256-sha256 only) or "account" (hmac-sha256 only).
 * - bodyDigest: "none" turns the Content-Digest off; "optional" (default) adds and covers it when the body
 *   can be digested; "required" also fails a request whose body cannot be digested.
 * - bodyDigestAlgorithm: "sha-256" (default) or "sha-512"; with bodyDigest absent the digest stays optional,
 *   and with bodyDigest "none" it is ignored.
 * - optionalHeaders: header names covered when the request has them, in addition to the default factory's
 *   Authorization, Content-Length and Content-Type; a name already covered is not covered twice.
 * - baseComponents: the derived components always covered, in the given order, replacing the default
 *   @method and @target-uri.
 * - coverTokenHeader, coverTraceIDHeader, coverStatusHeader: whether the Approov token header, and the
 *   trace ID and status headers when the request has them, are covered (default true).
 * - created: whether the created parameter is added (default true).
 * - expiresLifetime: the expires parameter as created plus this many seconds (default 15), 0 for none.
 * <p>
 * The covered components are listed in this order: the base components, the token header, the trace ID
 * header, the status header, the optional headers present (default ones first), then content-digest.
 */
enum ApproovReactNativeSigning {

    // the option keys the JavaScript API accepts
    static let knownKeys: Set<String> = [
        "signatures", "bodyDigest", "bodyDigestAlgorithm", "optionalHeaders", "baseComponents",
        "coverTokenHeader", "coverTraceIDHeader", "coverStatusHeader", "created", "expiresLifetime",
    ]

    // the RFC 9421 derived components the baseComponents option accepts
    static let derivedComponents: Set<String> = [
        "@method", "@target-uri", "@authority", "@scheme", "@request-target", "@path", "@query",
    ]

    /**
     * Builds a factory from the layer's default factory and the given options.
     *
     * @param options is the validated options object from JavaScript, with only the keys that were given
     * @return SignatureParametersFactory to pass to the universal layer
     * @throws SigningOptionsError if an option has an unknown key or a value outside its list
     */
    static func makeFactory(_ options: [String: Any]) throws -> SignatureParametersFactory {
        // reject anything the JavaScript validation would have rejected, before building anything
        if let unknown = options.keys.sorted().first(where: { !knownKeys.contains($0) }) {
            throw SigningOptionsError(message: "unknown option \"\(unknown)\"")
        }

        // the base components replace the default ones through the default factory's own override
        var baseParameters: SignatureParameters?
        if let value = options["baseComponents"] {
            guard let components = value as? [String], !components.isEmpty,
                  components.allSatisfy({ derivedComponents.contains($0) }),
                  Set(components).count == components.count else {
                throw SigningOptionsError(message: "\"baseComponents\" must list distinct derived components")
            }
            let parameters = SignatureParameters()
            for component in components {
                _ = parameters.addComponentIdentifier(component)
            }
            baseParameters = parameters
        }
        let factory = ApproovDefaultMessageSigning.generateDefaultSignatureParametersFactory(
            baseParametersOverride: baseParameters)

        // which signatures are produced
        if let value = options["signatures"] {
            switch value as? String {
            case "both": _ = factory.setUseInstallAndAccountMessageSigning()
            case "install": _ = factory.setUseInstallMessageSigning()
            case "account": _ = factory.setUseAccountMessageSigning()
            default: throw SigningOptionsError(message: "\"signatures\" must be both, install or account")
            }
        }

        // the body digest mode and algorithm
        let mode = try string(options, "bodyDigest", allowed: ["none", "optional", "required"])
        let algorithm = try string(options, "bodyDigestAlgorithm",
                                   allowed: [ApproovDefaultMessageSigning.DIGEST_SHA256,
                                             ApproovDefaultMessageSigning.DIGEST_SHA512])
        if mode == "none" {
            _ = try factory.setBodyDigestConfig(nil, required: false)
        } else if (mode != nil) || (algorithm != nil) {
            _ = try factory.setBodyDigestConfig(algorithm ?? ApproovDefaultMessageSigning.DIGEST_SHA256,
                                                required: mode == "required")
        }

        // the headers covered when present
        if let value = options["optionalHeaders"] {
            guard let headers = value as? [String] else {
                throw SigningOptionsError(message: "\"optionalHeaders\" must be an array of header names")
            }
            _ = factory.addOptionalHeaders(headers)
        }

        // the Approov headers and the timestamps
        if let cover = try bool(options, "coverTokenHeader") {
            _ = factory.setAddApproovTokenHeader(cover)
        }
        if let cover = try bool(options, "coverTraceIDHeader") {
            _ = factory.setAddApproovTraceIDHeader(cover)
        }
        if let cover = try bool(options, "coverStatusHeader") {
            _ = factory.setAddApproovStatusHeader(cover)
        }
        if let created = try bool(options, "created") {
            _ = factory.setAddCreated(created)
        }
        if let value = options["expiresLifetime"] {
            guard let number = value as? NSNumber, !isBoolean(number),
                  number.doubleValue >= 0, number.doubleValue == number.doubleValue.rounded(),
                  number.doubleValue <= Double(Int64.max) else {
                throw SigningOptionsError(message: "\"expiresLifetime\" must be a whole number of seconds, 0 or more")
            }
            _ = factory.setExpiresLifetime(number.int64Value)
        }
        return factory
    }

    // gets a string option that must be one of the allowed values, or nil if absent
    private static func string(_ options: [String: Any], _ key: String, allowed: [String]) throws -> String? {
        guard let value = options[key] else { return nil }
        guard let text = value as? String, allowed.contains(text) else {
            throw SigningOptionsError(message: "\"\(key)\" must be one of \(allowed.joined(separator: ", "))")
        }
        return text
    }

    // gets a boolean option, or nil if absent
    private static func bool(_ options: [String: Any], _ key: String) throws -> Bool? {
        guard let value = options[key] else { return nil }
        guard let number = value as? NSNumber, isBoolean(number) else {
            throw SigningOptionsError(message: "\"\(key)\" must be true or false")
        }
        return number.boolValue
    }

    // a JavaScript boolean reaches native code as the CFBoolean singletons, and a number never does
    private static func isBoolean(_ number: NSNumber) -> Bool {
        return CFGetTypeID(number) == CFBooleanGetTypeID()
    }
}
