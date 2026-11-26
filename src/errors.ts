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
 * Errors from the native module. A native failure rejects with the method name as its code, the
 * native message, and a userInfo map that the Android and iOS modules fill the same way. No message or field
 * ever contains a token or a secure string value.
 */

/**
 * Why a call failed. "general" with a null status means Approov protection is not enabled, or that the layer
 * refused a configuration call, such as setPersistentConfiguration, for the cause in the message.
 */
export type ApproovErrorType = 'rejection' | 'network' | 'general' | 'initialization';

export class ApproovError extends Error {
  /** The method that failed, such as "initialize" or "fetchToken". */
  readonly code: string;
  readonly type: ApproovErrorType;
  /** The SDK status name, such as REJECTED or NO_NETWORK, or null. */
  readonly status: string | null;
  /** For a rejection: the Approov Rejection Code, when the account reports it. */
  readonly rejectionARC: string | null;
  /** For a rejection: the reasons, when the account reports them. */
  readonly rejectionReasons: string | null;
  /** The full userInfo from the native module, for anything not covered above. */
  readonly userInfo: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    type: ApproovErrorType,
    userInfo: Record<string, unknown> = {},
  ) {
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

/** Whether a value is an ApproovError. */
export function isApproovError(value: unknown): value is ApproovError {
  return value instanceof ApproovError;
}

const TYPES: readonly string[] = ['rejection', 'network', 'general', 'initialization'];

/**
 * Turns a rejection from the native module into an ApproovError. A value that is not a native module
 * error (a programming error, for example) is returned unchanged.
 */
export function toApproovError(method: string, error: unknown): unknown {
  if (isApproovError(error)) return error;
  if (error === null || typeof error !== 'object') return error;
  const e = error as { message?: unknown; userInfo?: unknown; code?: unknown };
  const userInfo =
    e.userInfo !== null && typeof e.userInfo === 'object' ? (e.userInfo as Record<string, unknown>) : null;
  if (userInfo === null || typeof userInfo.type !== 'string' || !TYPES.includes(userInfo.type)) return error;
  const code = typeof e.code === 'string' && e.code !== '' ? e.code : method;
  const message = typeof e.message === 'string' ? e.message : `Approov ${method} failed`;
  return new ApproovError(code, message, userInfo.type as ApproovErrorType, userInfo);
}
