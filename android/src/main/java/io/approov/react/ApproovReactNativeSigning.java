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
import java.util.Map;

import io.approov.service.android.ApproovDefaultMessageSigning;
import io.approov.service.android.ApproovDefaultMessageSigning.SignatureParametersFactory;
import io.approov.util.universal.sig.SignatureParameters;

/**
 * ApproovReactNativeSigning builds the signature parameters factory for the message signing options from
 * JavaScript (src/signing.ts). JavaScript has validated the options, so only known keys with
 * valid values arrive; a key that is absent keeps the default.
 * <p>
 * The factory always starts from the layer's default, ApproovDefaultMessageSigning
 * .generateDefaultSignatureParametersFactory(), never from an empty factory, and per host options start from it
 * too. The default covers @method and @target-uri, then the token header, then the TraceID and Approov-Status
 * headers when the request has them, then Authorization, Content-Length and Content-Type when the request has
 * them, then Content-Digest when a SHA-256 digest of the body can be computed (optional), with created and an
 * expires 15 seconds later, and produces both signatures, install (ecdsa-p256-sha256) and account (hmac-sha256).
 * The options, and the factory call each one makes:
 * <ul>
 * <li>signatures: "both", "install" or "account", to setUseInstallAndAccountMessageSigning(),
 * setUseInstallMessageSigning() or setUseAccountMessageSigning();</li>
 * <li>bodyDigest and bodyDigestAlgorithm, to setBodyDigestConfig(algorithm, required): "none" turns the digest
 * off and ignores the algorithm; "optional" and "required" use bodyDigestAlgorithm, or sha-256 when it is
 * absent; bodyDigestAlgorithm alone keeps the default "optional";</li>
 * <li>optionalHeaders: added with addOptionalHeaders() after the default's Authorization, Content-Length and
 * Content-Type, so they extend the default list and never replace it, and a header named twice is covered
 * once (the layer's API can only add to the list);</li>
 * <li>baseComponents: the derived components, in the order given, replace the default's @method and
 * @target-uri as the base parameters (generateDefaultSignatureParametersFactory(base));</li>
 * <li>coverTokenHeader, coverTraceIDHeader, coverStatusHeader: setAddApproovTokenHeader(),
 * setAddApproovTraceIDHeader(), setAddApproovStatusHeader();</li>
 * <li>created: setAddCreated();</li>
 * <li>expiresLifetime: setExpiresLifetime() in seconds, 0 for no expires.</li>
 * </ul>
 */
final class ApproovReactNativeSigning {
    // the option keys of src/signing.ts
    static final String SIGNATURES = "signatures";
    static final String BODY_DIGEST = "bodyDigest";
    static final String BODY_DIGEST_ALGORITHM = "bodyDigestAlgorithm";
    static final String OPTIONAL_HEADERS = "optionalHeaders";
    static final String BASE_COMPONENTS = "baseComponents";
    static final String COVER_TOKEN_HEADER = "coverTokenHeader";
    static final String COVER_TRACE_ID_HEADER = "coverTraceIDHeader";
    static final String COVER_STATUS_HEADER = "coverStatusHeader";
    static final String CREATED = "created";
    static final String EXPIRES_LIFETIME = "expiresLifetime";

    /**
     * Construction is disallowed as this is a static only class.
     */
    private ApproovReactNativeSigning() {
    }

    /**
     * Builds a factory from the layer's default with the given options applied.
     *
     * @param options are the validated options from JavaScript, or null for none
     * @return a new standard SignatureParametersFactory
     * @throws IllegalArgumentException if an option is unknown or has a value JavaScript would have rejected
     */
    static SignatureParametersFactory buildFactory(Map<String, Object> options) {
        if (options == null)
            return ApproovDefaultMessageSigning.generateDefaultSignatureParametersFactory();
        for (String key : options.keySet()) {
            if (!isKnown(key))
                throw invalid("unknown option " + key);
        }

        // the base components are the only option that must be given when the factory is made
        SignatureParameters base = null;
        List<String> components = stringList(options, BASE_COMPONENTS);
        if (components != null) {
            if (components.isEmpty())
                throw invalid(BASE_COMPONENTS + " is empty");
            base = new SignatureParameters();
            for (String component : components) {
                if (!component.startsWith("@"))
                    throw invalid(BASE_COMPONENTS
                            + " accepts only derived components, not " + component);
                base.addComponentIdentifier(component);
            }
        }
        SignatureParametersFactory factory =
                ApproovDefaultMessageSigning.generateDefaultSignatureParametersFactory(base);

        String signatures = string(options, SIGNATURES);
        if (signatures != null) {
            switch (signatures) {
                case "both":
                    factory.setUseInstallAndAccountMessageSigning();
                    break;
                case "install":
                    factory.setUseInstallMessageSigning();
                    break;
                case "account":
                    factory.setUseAccountMessageSigning();
                    break;
                default:
                    throw invalid("unknown " + SIGNATURES + " " + signatures);
            }
        }

        String bodyDigest = string(options, BODY_DIGEST);
        String algorithm = string(options, BODY_DIGEST_ALGORITHM);
        if ((bodyDigest != null) || (algorithm != null)) {
            if (algorithm == null)
                algorithm = ApproovDefaultMessageSigning.DIGEST_SHA256;
            if (bodyDigest == null)
                bodyDigest = "optional";
            switch (bodyDigest) {
                case "none":
                    factory.setBodyDigestConfig(null, false);
                    break;
                case "optional":
                    factory.setBodyDigestConfig(algorithm, false);
                    break;
                case "required":
                    factory.setBodyDigestConfig(algorithm, true);
                    break;
                default:
                    throw invalid("unknown " + BODY_DIGEST + " " + bodyDigest);
            }
        }

        List<String> optionalHeaders = stringList(options, OPTIONAL_HEADERS);
        if (optionalHeaders != null)
            factory.addOptionalHeaders(optionalHeaders.toArray(new String[0]));

        Boolean coverToken = bool(options, COVER_TOKEN_HEADER);
        if (coverToken != null)
            factory.setAddApproovTokenHeader(coverToken);
        Boolean coverTraceID = bool(options, COVER_TRACE_ID_HEADER);
        if (coverTraceID != null)
            factory.setAddApproovTraceIDHeader(coverTraceID);
        Boolean coverStatus = bool(options, COVER_STATUS_HEADER);
        if (coverStatus != null)
            factory.setAddApproovStatusHeader(coverStatus);
        Boolean created = bool(options, CREATED);
        if (created != null)
            factory.setAddCreated(created);

        Object expires = options.get(EXPIRES_LIFETIME);
        if (expires != null) {
            // a JavaScript number arrives as a Double
            if (!(expires instanceof Number))
                throw invalid(EXPIRES_LIFETIME + " is not a number");
            double seconds = ((Number) expires).doubleValue();
            if ((seconds < 0) || (seconds != Math.rint(seconds)) || (seconds > Long.MAX_VALUE))
                throw invalid(EXPIRES_LIFETIME
                        + " must be a whole number of seconds, 0 or more");
            factory.setExpiresLifetime((long) seconds);
        }
        return factory;
    }

    private static boolean isKnown(String key) {
        switch (key) {
            case SIGNATURES:
            case BODY_DIGEST:
            case BODY_DIGEST_ALGORITHM:
            case OPTIONAL_HEADERS:
            case BASE_COMPONENTS:
            case COVER_TOKEN_HEADER:
            case COVER_TRACE_ID_HEADER:
            case COVER_STATUS_HEADER:
            case CREATED:
            case EXPIRES_LIFETIME:
                return true;
            default:
                return false;
        }
    }

    // the string option, or null if absent
    private static String string(Map<String, Object> options, String key) {
        Object value = options.get(key);
        if ((value == null) || (value instanceof String))
            return (String) value;
        throw invalid(key + " is not a string");
    }

    // an option the module refuses, which JavaScript would have rejected
    private static ApproovReactNativeErrors.ArgumentException invalid(String detail) {
        return new ApproovReactNativeErrors.ArgumentException("message signing: " + detail);
    }

    // the boolean option, or null if absent
    private static Boolean bool(Map<String, Object> options, String key) {
        Object value = options.get(key);
        if ((value == null) || (value instanceof Boolean))
            return (Boolean) value;
        throw invalid(key + " is not a boolean");
    }

    // the list of strings option, or null if absent
    @SuppressWarnings("unchecked")
    private static List<String> stringList(Map<String, Object> options, String key) {
        Object value = options.get(key);
        if (value == null)
            return null;
        if (value instanceof List) {
            for (Object item : (List<?>) value) {
                if (!(item instanceof String))
                    throw invalid(key + " holds a value that is not a string");
            }
            return (List<String>) value;
        }
        throw invalid(key + " is not an array");
    }
}
