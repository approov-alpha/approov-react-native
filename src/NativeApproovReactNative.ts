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

/**
 * Codegen spec of the native module ApproovReactNative. Android implements it in
 * io.approov.react.ApproovReactNativeModule and iOS in the ApproovReactNative class; both forward every
 * method to exactly one call of the universal Approov layer (ApproovService), with no request processing of
 * their own.
 *
 * The JavaScript API is in index.ts, which validates its arguments before calling this module, so the native
 * side receives only values it can pass on unchanged:
 * - an absent comment, prefix, header or definition is null, never "";
 * - a null account ID is the file form of initialize, which reads the bundled approov.config, and then the
 *   comment is null too;
 * - a mutator name is one of CLOSE_FAILURE, ALWAYS_PROCEED and DEFAULT, or null;
 * - signing options are a validated object with the keys of SigningOptions in signing.ts;
 * - a logging level is one of OFF, ERROR, WARNING, INFO and DEBUG;
 * - a persistent configuration is a string, which the layer checks as JSON.
 *
 * Every method returns a Promise, so a native failure reaches the caller as a rejection.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // initialization and state
  initialize(accountId: string | null, comment: string | null): Promise<void>;
  isApproovServiceEnabled(): Promise<boolean>;
  isApproovProtectionEnabled(): Promise<boolean>;
  isInterceptionInstalled(): Promise<boolean>;

  // header names
  setTokenHeader(header: string, prefix: string | null): Promise<void>;
  getTokenHeader(): Promise<string>;
  getTokenPrefix(): Promise<string>;
  setTraceIDHeader(header: string | null): Promise<void>;
  getTraceIDHeader(): Promise<string | null>;
  setStatusHeader(header: string | null): Promise<void>;
  getStatusHeader(): Promise<string | null>;
  setBindingHeader(header: string | null): Promise<void>;
  getBindingHeader(): Promise<string | null>;

  // substitutions and exclusions
  addSubstitutionHeader(header: string, requiredPrefix: string | null): Promise<void>;
  removeSubstitutionHeader(header: string): Promise<void>;
  addSubstitutionQueryParam(key: string): Promise<void>;
  removeSubstitutionQueryParam(key: string): Promise<void>;
  addExclusionURLRegex(regex: string): Promise<void>;
  removeExclusionURLRegex(regex: string): Promise<void>;

  // the service mutator, by name only
  setServiceMutator(name: string | null): Promise<void>;
  getServiceMutator(): Promise<string>;

  // message signing with the layer's standard factory
  enableMessageSigning(options: Object): Promise<void>;
  setMessageSigningHostOptions(hostName: string, options: Object | null): Promise<void>;
  disableMessageSigning(): Promise<void>;
  isMessageSigningEnabled(): Promise<boolean>;

  // logging and development
  setLoggingLevel(level: string): Promise<void>;
  setDevKey(devKey: string): Promise<void>;

  // direct calls to the SDK, which run off the calling thread
  getDeviceID(): Promise<string>;
  getServerAdjustedCurrentTimeMS(): Promise<number>;
  setDataHashInToken(data: string): Promise<void>;
  fetchToken(url: string): Promise<string>;
  fetchSecureString(key: string, newDef: string | null): Promise<string | null>;
  fetchCustomJWT(payload: string): Promise<string | null>;
  getAccountMessageSignature(message: string): Promise<string | null>;
  getInstallMessageSignature(message: string): Promise<string | null>;
  getLastARC(): Promise<string>;
  setInstallAttributes(attrs: string): Promise<void>;

  // persisted configuration overrides, which apply from the next launch, and run off the calling thread
  setPersistentConfiguration(json: string, source: string | null): Promise<void>;
  clearPersistentConfiguration(): Promise<void>;
  getPersistentConfigurationSource(): Promise<string | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ApproovReactNative');
