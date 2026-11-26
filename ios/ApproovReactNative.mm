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

// ApproovReactNative forwards every method of the JavaScript API to ApproovReactNativeBridge, where each
// calls exactly one method of the universal Approov layer. Configuration methods run on the module's own
// serial queue; initialize and the methods that call the SDK move to a background queue in the bridge.

#import <NativeApproovReactNativeSpec/NativeApproovReactNativeSpec.h>

#if __has_include(<ApproovReactNative/ApproovReactNative-Swift.h>)
#import <ApproovReactNative/ApproovReactNative-Swift.h>
#else
#import "ApproovReactNative-Swift.h"
#endif

// declared here rather than in a public header, since the generated spec is Objective-C++ and a public
// header would be part of the module that Swift imports
@interface ApproovReactNative : NSObject <NativeApproovReactNativeSpec>
@end

@implementation ApproovReactNative {
    // the bridge to the universal layer
    ApproovReactNativeBridge *_bridge;

    // the serial queue the methods are called on, so no call runs on the JavaScript or main thread
    dispatch_queue_t _methodQueue;
}

RCT_EXPORT_MODULE(ApproovReactNative)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (instancetype)init
{
    if ((self = [super init])) {
        _bridge = [ApproovReactNativeBridge makeDefault];
        _methodQueue = dispatch_queue_create("io.approov.react.module", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (dispatch_queue_t)methodQueue
{
    return _methodQueue;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeApproovReactNativeSpecJSI>(params);
}

- (void)initialize:(NSString *)accountId
           comment:(NSString *)comment
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
    [_bridge initialize:accountId comment:comment resolve:resolve reject:reject];
}

- (void)isApproovServiceEnabled:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge isApproovServiceEnabled:resolve reject:reject];
}

- (void)isApproovProtectionEnabled:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge isApproovProtectionEnabled:resolve reject:reject];
}

- (void)isInterceptionInstalled:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge isInterceptionInstalled:resolve reject:reject];
}

- (void)setTokenHeader:(NSString *)header
                prefix:(NSString *)prefix
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setTokenHeader:header prefix:prefix resolve:resolve reject:reject];
}

- (void)getTokenHeader:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getTokenHeader:resolve reject:reject];
}

- (void)getTokenPrefix:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getTokenPrefix:resolve reject:reject];
}

- (void)setTraceIDHeader:(NSString *)header resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setTraceIDHeader:header resolve:resolve reject:reject];
}

- (void)getTraceIDHeader:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getTraceIDHeader:resolve reject:reject];
}

- (void)setStatusHeader:(NSString *)header resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setStatusHeader:header resolve:resolve reject:reject];
}

- (void)getStatusHeader:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getStatusHeader:resolve reject:reject];
}

- (void)setBindingHeader:(NSString *)header resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setBindingHeader:header resolve:resolve reject:reject];
}

- (void)getBindingHeader:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getBindingHeader:resolve reject:reject];
}

- (void)addSubstitutionHeader:(NSString *)header
               requiredPrefix:(NSString *)requiredPrefix
                      resolve:(RCTPromiseResolveBlock)resolve
                       reject:(RCTPromiseRejectBlock)reject
{
    [_bridge addSubstitutionHeader:header requiredPrefix:requiredPrefix resolve:resolve reject:reject];
}

- (void)removeSubstitutionHeader:(NSString *)header
                         resolve:(RCTPromiseResolveBlock)resolve
                          reject:(RCTPromiseRejectBlock)reject
{
    [_bridge removeSubstitutionHeader:header resolve:resolve reject:reject];
}

- (void)addSubstitutionQueryParam:(NSString *)key
                          resolve:(RCTPromiseResolveBlock)resolve
                           reject:(RCTPromiseRejectBlock)reject
{
    [_bridge addSubstitutionQueryParam:key resolve:resolve reject:reject];
}

- (void)removeSubstitutionQueryParam:(NSString *)key
                             resolve:(RCTPromiseResolveBlock)resolve
                              reject:(RCTPromiseRejectBlock)reject
{
    [_bridge removeSubstitutionQueryParam:key resolve:resolve reject:reject];
}

- (void)addExclusionURLRegex:(NSString *)regex resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge addExclusionURLRegex:regex resolve:resolve reject:reject];
}

- (void)removeExclusionURLRegex:(NSString *)regex
                        resolve:(RCTPromiseResolveBlock)resolve
                         reject:(RCTPromiseRejectBlock)reject
{
    [_bridge removeExclusionURLRegex:regex resolve:resolve reject:reject];
}

- (void)setServiceMutator:(NSString *)name resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setServiceMutator:name resolve:resolve reject:reject];
}

- (void)getServiceMutator:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getServiceMutator:resolve reject:reject];
}

- (void)enableMessageSigning:(NSDictionary *)options
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
    [_bridge enableMessageSigning:options resolve:resolve reject:reject];
}

- (void)setMessageSigningHostOptions:(NSString *)hostName
                             options:(NSDictionary *)options
                             resolve:(RCTPromiseResolveBlock)resolve
                              reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setMessageSigningHostOptions:hostName options:options resolve:resolve reject:reject];
}

- (void)disableMessageSigning:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge disableMessageSigning:resolve reject:reject];
}

- (void)isMessageSigningEnabled:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge isMessageSigningEnabled:resolve reject:reject];
}

- (void)setLoggingLevel:(NSString *)level resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setLoggingLevel:level resolve:resolve reject:reject];
}

- (void)setDevKey:(NSString *)devKey resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setDevKey:devKey resolve:resolve reject:reject];
}

- (void)getDeviceID:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getDeviceID:resolve reject:reject];
}

- (void)getServerAdjustedCurrentTimeMS:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getServerAdjustedCurrentTimeMS:resolve reject:reject];
}

- (void)setDataHashInToken:(NSString *)data resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setDataHashInToken:data resolve:resolve reject:reject];
}

- (void)fetchToken:(NSString *)url resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge fetchToken:url resolve:resolve reject:reject];
}

- (void)fetchSecureString:(NSString *)key
                   newDef:(NSString *)newDef
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
    [_bridge fetchSecureString:key newDef:newDef resolve:resolve reject:reject];
}

- (void)fetchCustomJWT:(NSString *)payload resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge fetchCustomJWT:payload resolve:resolve reject:reject];
}

- (void)getAccountMessageSignature:(NSString *)message
                           resolve:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getAccountMessageSignature:message resolve:resolve reject:reject];
}

- (void)getInstallMessageSignature:(NSString *)message
                           resolve:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getInstallMessageSignature:message resolve:resolve reject:reject];
}

- (void)getLastARC:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getLastARC:resolve reject:reject];
}

- (void)setInstallAttributes:(NSString *)attrs resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setInstallAttributes:attrs resolve:resolve reject:reject];
}

- (void)setPersistentConfiguration:(NSString *)json
                            source:(NSString *)source
                           resolve:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject
{
    [_bridge setPersistentConfiguration:json source:source resolve:resolve reject:reject];
}

- (void)clearPersistentConfiguration:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge clearPersistentConfiguration:resolve reject:reject];
}

- (void)getPersistentConfigurationSource:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
    [_bridge getPersistentConfigurationSource:resolve reject:reject];
}

@end
