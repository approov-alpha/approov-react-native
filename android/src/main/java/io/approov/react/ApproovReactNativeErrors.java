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

import com.criticalblue.approovsdk.Approov;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import io.approov.service.android.ApproovException;
import io.approov.service.android.ApproovFetchStatusException;
import io.approov.service.android.ApproovNetworkException;
import io.approov.service.android.ApproovRejectionException;

/**
 * ApproovReactNativeErrors turns a failure of a universal layer call into the rejection the JavaScript side reads
 * (src/errors.ts): the code is the method name and userInfo has the keys type, status, rejectionARC and
 * rejectionReasons, each present and null when it does not apply. The type comes from the exception class alone:
 * <ul>
 * <li>any failure of initialize: "initialization", status null, so the SDK's message reaches JavaScript as is;</li>
 * <li>ApproovRejectionException: "rejection", with the status name, the ARC and the rejection reasons;</li>
 * <li>ApproovNetworkException: "network", with the status name, or null if the layer gave none;</li>
 * <li>any other ApproovFetchStatusException: "general", with the status name;</li>
 * <li>anything else: "general", status null, which is the case of "Approov protection not enabled".</li>
 * </ul>
 * The status is the SDK's TokenFetchStatus name, such as REJECTED or NO_NETWORK. The message is the universal
 * layer's own with the prefix the iOS layer's error description gives the same failure, so that JavaScript reads the
 * same message on both platforms: "ApproovService rejection: " for a rejection, "ApproovService network error (retry
 * possible): " for a network failure, and "ApproovService error: " for any other ApproovException and for a
 * configuration call the layer refused with an IllegalArgumentException of its own. The message of initialize, an
 * argument the module itself refused and a failure that is not the layer's, such as one of the app's own, is passed on
 * unchanged, as on iOS, and a message that already has a prefix is never prefixed again. The layer's messages never
 * carry a token or a secure string value, and the prefixes add none.
 */
final class ApproovReactNativeErrors {
    // the types of src/errors.ts
    static final String TYPE_REJECTION = "rejection";
    static final String TYPE_NETWORK = "network";
    static final String TYPE_GENERAL = "general";
    static final String TYPE_INITIALIZATION = "initialization";

    // the userInfo keys of src/errors.ts
    static final String KEY_TYPE = "type";
    static final String KEY_STATUS = "status";
    static final String KEY_REJECTION_ARC = "rejectionARC";
    static final String KEY_REJECTION_REASONS = "rejectionReasons";

    // the prefixes of the iOS layer's error descriptions (ApproovServiceError.errorDescription)
    static final String PREFIX_ERROR = "ApproovService error: ";
    static final String PREFIX_REJECTION = "ApproovService rejection: ";
    static final String PREFIX_NETWORK = "ApproovService network error (retry possible): ";

    // the prefixes of the iOS layer's error descriptions that a bridge message can carry, so that a message already
    // carrying one is kept as it is
    private static final String[] PREFIXES = { PREFIX_ERROR, PREFIX_REJECTION, PREFIX_NETWORK,
            "ApproovService pinning error: " };

    // the package of the universal layer, whose own refusals are prefixed
    private static final String LAYER_PACKAGE = "io.approov.service.android.";

    /**
     * Construction is disallowed as this is a static only class.
     */
    private ApproovReactNativeErrors() {
    }

    // ArgumentException is thrown for an argument the module itself cannot pass on, which the JavaScript API
    // validates before calling, so it is only reached by a direct native call; its message is passed on unchanged.
    static final class ArgumentException extends IllegalArgumentException {
        /**
         * Constructs an exception for an argument the module cannot pass on.
         *
         * @param message is the method name and the problem, never the value of a secret
         */
        ArgumentException(String message) {
            super(message);
        }
    }

    /**
     * Rejection holds what a promise is rejected with.
     */
    static final class Rejection {
        // the method that failed, which is the error code
        final String code;
        // the native message
        final String message;
        // the type, status, rejectionARC and rejectionReasons, in that order
        final Map<String, Object> userInfo;

        Rejection(String code, String message, Map<String, Object> userInfo) {
            this.code = code;
            this.message = message;
            this.userInfo = Collections.unmodifiableMap(userInfo);
        }
    }

    /**
     * Maps a failure of a method to its rejection.
     *
     * @param method is the name of the module method that failed
     * @param failure is what the universal layer, or the module itself, threw
     * @return the rejection
     */
    static Rejection map(String method, Throwable failure) {
        String type = TYPE_GENERAL;
        Approov.TokenFetchStatus status = null;
        String arc = null;
        String reasons = null;
        if ("initialize".equals(method)) {
            type = TYPE_INITIALIZATION;
        } else if (failure instanceof ApproovRejectionException) {
            ApproovRejectionException rejection = (ApproovRejectionException) failure;
            type = TYPE_REJECTION;
            status = rejection.getTokenFetchStatus();
            arc = rejection.getARC();
            reasons = rejection.getRejectionReasons();
        } else if (failure instanceof ApproovNetworkException) {
            type = TYPE_NETWORK;
            status = ((ApproovNetworkException) failure).getTokenFetchStatus();
        } else if (failure instanceof ApproovFetchStatusException) {
            status = ((ApproovFetchStatusException) failure).getTokenFetchStatus();
        }
        Map<String, Object> userInfo = new LinkedHashMap<>();
        userInfo.put(KEY_TYPE, type);
        userInfo.put(KEY_STATUS, (status != null) ? status.name() : null);
        userInfo.put(KEY_REJECTION_ARC, arc);
        userInfo.put(KEY_REJECTION_REASONS, reasons);
        String message = failure.getMessage();
        if (message == null)
            message = "Approov " + method + " failed: " + failure.getClass().getName();
        return new Rejection(method, prefixed(method, failure, message), userInfo);
    }

    /**
     * Gets the message JavaScript reads for a failure: the message with the prefix the iOS layer gives the same
     * failure, or the message unchanged for initialize, an argument the module refused, a failure that is not the
     * layer's and a message that already has a prefix.
     *
     * @param method is the name of the module method that failed
     * @param failure is what the universal layer, or the module itself, threw
     * @param message is the failure's message
     * @return the message for the rejection
     */
    static String prefixed(String method, Throwable failure, String message) {
        // the SDK's own message for initialize, as the iOS module passes it on
        if ("initialize".equals(method))
            return message;
        for (String prefix : PREFIXES) {
            if (message.startsWith(prefix))
                return message;
        }
        if (failure instanceof ApproovRejectionException)
            return PREFIX_REJECTION + message;
        if (failure instanceof ApproovNetworkException)
            return PREFIX_NETWORK + message;
        if (failure instanceof ApproovException)
            return PREFIX_ERROR + message;

        // a configuration call the layer refused, which the iOS layer reports as an ApproovServiceError; an
        // IllegalArgumentException of the app's own, such as one its service mutator throws, keeps its message
        if ((failure instanceof IllegalArgumentException) && !(failure instanceof ArgumentException)
                && thrownByLayer(failure))
            return PREFIX_ERROR + message;
        return message;
    }

    /**
     * Determines whether a failure was raised by the universal layer itself, from the frame that created it.
     *
     * @param failure is the failure
     * @return true if its innermost stack frame is in the universal layer's package
     */
    static boolean thrownByLayer(Throwable failure) {
        StackTraceElement[] frames = failure.getStackTrace();
        return (frames.length > 0) && frames[0].getClassName().startsWith(LAYER_PACKAGE);
    }
}
