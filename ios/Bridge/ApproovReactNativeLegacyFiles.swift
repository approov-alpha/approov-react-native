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

/**
 * The options file of @approov/approov-service-react-native 3.5.x, approov.plist, which this package never reads
 * since its keys belong in approov.config. A file still in the app bundle gets one warning naming it and
 * saying where its keys go. Only the presence of the file is checked: it is never opened or read, so nothing in it
 * is used or logged, and the check calls no layer method. approov.config itself is read by the file form of
 * initialize and gets no warning.
 */
extension ApproovReactNativeBridge {

    // the resource name and extension of the 3.5.x options file
    static let legacyResourceName = "approov"
    static let legacyPropsExtension = "plist"

    /**
     * Logs a warning if the approov.plist file of @approov/approov-service-react-native 3.5.x is still in the app
     * bundle, which the package loader calls once when the package is loaded.
     */
    @objc public static func warnAboutLegacyFiles() {
        let bundle = Bundle.main
        let warnings = legacyFileWarnings { name, ext in bundle.url(forResource: name, withExtension: ext) != nil }
        for warning in warnings {
            osLog(.warning, warning)
        }
    }

    /**
     * Gets the warnings for the files of @approov/approov-service-react-native 3.5.x the bundle has.
     *
     * @param resourceExists tells whether the bundle has a resource of a name and extension
     * @return the warnings, one if approov.plist is found and none otherwise
     */
    static func legacyFileWarnings(resourceExists: (String, String) -> Bool) -> [String] {
        var warnings: [String] = []
        if resourceExists(legacyResourceName, legacyPropsExtension) {
            warnings.append("\(legacyResourceName).\(legacyPropsExtension) of @approov/approov-service-react-native "
                + "3.5.x is in the app bundle and is never read: its keys belong in approov.config (token.name and "
                + "token.prefix as tokenHeader, binding.name as bindingHeader; init.prefetch has no replacement), "
                + "then remove the file")
        }
        return warnings
    }
}
