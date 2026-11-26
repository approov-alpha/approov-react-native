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

// ApproovReactNativeLoader prepares the universal Approov layer when the package is loaded, before
// React Native or the app creates any URLSession: interception is installed without initializing, so the
// sessions React Native creates early carry the Approov protocol, go out untouched until initialize
// succeeds and are protected from then on. It also sets the user property to approov-react-native/<version>
// and logs an error if another Approov interceptor is linked into the app, which is a diagnostic only. It also
// warns about the approov.plist file of @approov/approov-service-react-native 3.5.x still in the app bundle, which
// it never reads, as its keys belong in approov.config.

#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <os/log.h>

#if __has_include(<ApproovReactNative/ApproovReactNative-Swift.h>)
#import <ApproovReactNative/ApproovReactNative-Swift.h>
#else
#import "ApproovReactNative-Swift.h"
#endif

// the npm package version, which the podspec passes as APPROOV_REACT_NATIVE_VERSION
#define APPROOV_RN_STRINGIFY_VALUE(value) #value
#define APPROOV_RN_STRINGIFY(value) APPROOV_RN_STRINGIFY_VALUE(value)
#ifdef APPROOV_REACT_NATIVE_VERSION
#define APPROOV_RN_VERSION @APPROOV_RN_STRINGIFY(APPROOV_REACT_NATIVE_VERSION)
#else
#define APPROOV_RN_VERSION @"unknown"
#endif

@interface ApproovReactNativeLoader : NSObject
@end

@implementation ApproovReactNativeLoader

+ (void)load
{
    [ApproovReactNativeBridge prepareAtLoad:APPROOV_RN_VERSION];

    // off the launch path: the bundle lookup first, as it is quick, then the duplicate check, which walks
    // every class name
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        [ApproovReactNativeBridge warnAboutLegacyFiles];
        [self logDuplicateInterceptors];
    });
}

// logs an error for each Approov interceptor in the app other than the universal layer's single protocol
+ (void)logDuplicateInterceptors
{
    // the interceptor of @approov/approov-service-react-native 3.5.x, which must not be in the same app
    if (NSClassFromString(@"ApproovRCTInterceptor") != nil) {
        os_log_error(OS_LOG_DEFAULT,
            "ApproovService: React Native: ApproovRCTInterceptor of @approov/approov-service-react-native is "
            "in the app with @approov/approov-react-native: remove @approov/approov-service-react-native");
    }

    // a second ApproovURLProtocol means a second copy of the universal layer is linked
    NSMutableArray<NSString *> *found = [NSMutableArray array];
    unsigned int imageCount = 0;
    const char **images = objc_copyImageNames(&imageCount);
    for (unsigned int i = 0; i < imageCount; i++) {
        unsigned int classCount = 0;
        const char **names = objc_copyClassNamesForImage(images[i], &classCount);
        for (unsigned int j = 0; j < classCount; j++) {
            NSString *name = [NSString stringWithUTF8String:names[j]];
            if ([name hasSuffix:@"ApproovURLProtocol"]) {
                [found addObject:[NSString stringWithFormat:@"%@ in %s", name, images[i]]];
            }
        }
        free(names);
    }
    free(images);
    if (found.count > 1) {
        os_log_error(OS_LOG_DEFAULT, "ApproovService: React Native: %lu copies of ApproovURLProtocol are linked: %{public}@",
            (unsigned long)found.count, [found componentsJoinedByString:@", "]);
    }
}

@end
