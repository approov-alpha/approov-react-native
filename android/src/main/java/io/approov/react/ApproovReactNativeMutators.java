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

import io.approov.service.android.ApproovServiceMutator;

/**
 * ApproovReactNativeMutators maps the names JavaScript uses for the service mutators to the universal layer's
 * standard instances and back. A name is decided by identity alone: an installed mutator is
 * compared with ApproovServiceMutator.CLOSE_FAILURE and ALWAYS_PROCEED and is never called, so neither its
 * hooks, its properties nor its toString are used. DEFAULT is not a mutator of its own but the same instance as
 * the standard one it selects (ApproovServiceMutator.DEFAULT = ALWAYS_PROCEED in 3.7.0), so it is reported by
 * the name of that one, and an app's own mutator is CUSTOM.
 */
final class ApproovReactNativeMutators {
    // the names shared by JavaScript, Android and iOS
    static final String CLOSE_FAILURE = "CLOSE_FAILURE";
    static final String ALWAYS_PROCEED = "ALWAYS_PROCEED";
    static final String DEFAULT = "DEFAULT";
    static final String CUSTOM = "CUSTOM";

    /**
     * Construction is disallowed as this is a static only class.
     */
    private ApproovReactNativeMutators() {
    }

    /**
     * Gets the standard mutator with a name, where null selects DEFAULT.
     *
     * @param name is CLOSE_FAILURE, ALWAYS_PROCEED, DEFAULT or null
     * @return the universal layer's standard instance
     * @throws IllegalArgumentException if the name is not one of those
     */
    static ApproovServiceMutator forName(String name) {
        if ((name == null) || DEFAULT.equals(name))
            return ApproovServiceMutator.DEFAULT;
        if (CLOSE_FAILURE.equals(name))
            return ApproovServiceMutator.CLOSE_FAILURE;
        if (ALWAYS_PROCEED.equals(name))
            return ApproovServiceMutator.ALWAYS_PROCEED;
        throw new ApproovReactNativeErrors.ArgumentException("setServiceMutator: unknown mutator " + name
                + ", expected CLOSE_FAILURE, ALWAYS_PROCEED, DEFAULT or null");
    }

    /**
     * Gets the name of an installed mutator by identity, without calling it.
     *
     * @param mutator is the installed mutator
     * @return CLOSE_FAILURE or ALWAYS_PROCEED for a standard instance, otherwise CUSTOM
     */
    static String nameOf(ApproovServiceMutator mutator) {
        if (mutator == ApproovServiceMutator.CLOSE_FAILURE)
            return CLOSE_FAILURE;
        if (mutator == ApproovServiceMutator.ALWAYS_PROCEED)
            return ALWAYS_PROCEED;
        return CUSTOM;
    }

    /**
     * Gets a description of a mutator that is an app's own for a log line, by its class name only, so that the
     * mutator is never called.
     *
     * @param mutator is the mutator, or null
     * @return the class name of an app's own mutator, or null for a standard instance or null
     */
    static String customClassName(ApproovServiceMutator mutator) {
        if ((mutator == null) || !CUSTOM.equals(nameOf(mutator)))
            return null;
        return mutator.getClass().getName();
    }
}
