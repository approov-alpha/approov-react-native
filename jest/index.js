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
 * Jest mock of @approov/approov-react-native. It loads without React Native and without the native
 * module. Every ApproovService method is a jest.fn that resolves with a plausible value, which a test can
 * change with mockResolvedValue or mockRejectedValue. Use it with:
 *
 *   jest.mock('@approov/approov-react-native', () => require('@approov/approov-react-native/jest'));
 *
 * The real ApproovError is reproduced, so isApproovError and instanceof work in app tests.
 */
/* global jest */
class ApproovError extends Error {
  constructor(code, message, type, userInfo = {}) {
    super(message);
    this.name = 'ApproovError';
    this.code = code;
    this.type = type;
    this.status = typeof userInfo.status === 'string' ? userInfo.status : null;
    this.rejectionARC = typeof userInfo.rejectionARC === 'string' ? userInfo.rejectionARC : null;
    this.rejectionReasons = typeof userInfo.rejectionReasons === 'string' ? userInfo.rejectionReasons : null;
    this.userInfo = Object.freeze({ ...userInfo });
  }
}

class SigningOptionsError extends TypeError {
  constructor(message) {
    super(`Approov message signing options: ${message}`);
    this.name = 'SigningOptionsError';
  }
}

const resolves = (value) => jest.fn(() => Promise.resolve(value));

const ApproovService = {
  initialize: resolves(undefined),
  isApproovServiceEnabled: resolves(true),
  isApproovProtectionEnabled: resolves(true),
  isInterceptionInstalled: resolves(true),
  setTokenHeader: resolves(undefined),
  getTokenHeader: resolves('Approov-Token'),
  getTokenPrefix: resolves(''),
  setTraceIDHeader: resolves(undefined),
  getTraceIDHeader: resolves('Approov-TraceID'),
  setStatusHeader: resolves(undefined),
  getStatusHeader: resolves('Approov-Status'),
  setBindingHeader: resolves(undefined),
  getBindingHeader: resolves(null),
  addSubstitutionHeader: resolves(undefined),
  removeSubstitutionHeader: resolves(undefined),
  addSubstitutionQueryParam: resolves(undefined),
  removeSubstitutionQueryParam: resolves(undefined),
  addExclusionURLRegex: resolves(undefined),
  removeExclusionURLRegex: resolves(undefined),
  setServiceMutator: resolves(undefined),
  getServiceMutator: resolves('CLOSE_FAILURE'),
  enableMessageSigning: resolves(undefined),
  setMessageSigningHostOptions: resolves(undefined),
  disableMessageSigning: resolves(undefined),
  isMessageSigningEnabled: resolves(true),
  setLoggingLevel: resolves(undefined),
  setDevKey: resolves(undefined),
  getDeviceID: resolves('mock-device-id'),
  getServerAdjustedCurrentTimeMS: resolves(Date.now()),
  setDataHashInToken: resolves(undefined),
  fetchToken: resolves('mock.approov.token'),
  fetchSecureString: resolves(null),
  fetchCustomJWT: resolves('mock.custom.jwt'),
  getAccountMessageSignature: resolves(null),
  getInstallMessageSignature: resolves(null),
  getMessageSignature: resolves(null),
  getLastARC: resolves(''),
  setInstallAttributes: resolves(undefined),
  setPersistentConfiguration: resolves(undefined),
  clearPersistentConfiguration: resolves(undefined),
  getPersistentConfigurationSource: resolves(null),
};

const READY = Object.freeze({ approovReady: true, approovChecked: true, approovError: null });

module.exports = {
  __esModule: true,
  default: ApproovService,
  ApproovService,
  ApproovError,
  isApproovError: (value) => value instanceof ApproovError,
  SigningOptionsError,
  ApproovProvider: jest.fn(({ children }) => children ?? null),
  useApproov: jest.fn(() => READY),
};
