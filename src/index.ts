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
 * @approov/approov-react-native: the Approov package for React Native, built on the universal Approov layers for
 * Android (io.approov:service.android) and iOS (approov-service-ios). See ApproovService.ts for the API.
 */
export { ApproovService } from './ApproovService';
export type {
  ServiceMutatorName,
  InstalledServiceMutator,
  LoggingLevel,
} from './ApproovService';
export { ApproovError, isApproovError } from './errors';
export type { ApproovErrorType } from './errors';
export { SigningOptionsError } from './signing';
export type {
  SigningOptions,
  SignatureSelection,
  BodyDigestMode,
  BodyDigestAlgorithm,
  DerivedComponent,
} from './signing';
export { ApproovProvider, useApproov } from './ApproovProvider';
export type { ApproovProviderProps, ApproovState } from './ApproovProvider';

import { ApproovService } from './ApproovService';
export default ApproovService;
