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
 * Message signing options. Every option is an override on the layer's default signature
 * parameters factory, never on an empty factory: an option that is not given keeps the layer's default, and
 * the options of one host start from the layer's default too, with no inheritance from enableMessageSigning.
 * The signature algorithms are not options (install ecdsa-p256-sha256, account hmac-sha256).
 *
 * Validation happens here, so the native modules receive only known keys with valid values and build the
 * same factory on Android and iOS.
 */

/** Which signatures are added. Default: both. */
export type SignatureSelection = 'both' | 'install' | 'account';

/** Whether a Content-Digest of the body is added and covered. Default: optional. */
export type BodyDigestMode = 'none' | 'optional' | 'required';

/** The digest algorithm. Default: sha-256. */
export type BodyDigestAlgorithm = 'sha-256' | 'sha-512';

/** The RFC 9421 derived components the signature can cover. Default: @method and @target-uri. */
export type DerivedComponent =
  | '@method'
  | '@target-uri'
  | '@authority'
  | '@scheme'
  | '@request-target'
  | '@path'
  | '@query';

export interface SigningOptions {
  signatures?: SignatureSelection;
  bodyDigest?: BodyDigestMode;
  bodyDigestAlgorithm?: BodyDigestAlgorithm;
  /**
   * Header names covered when the request has them, in addition to the default Authorization, Content-Length
   * and Content-Type, which stay covered. A name already covered is covered once.
   */
  optionalHeaders?: string[];
  /** Derived components always covered. A header name is not accepted here: use optionalHeaders. */
  baseComponents?: DerivedComponent[];
  /** Cover the Approov token header. Default: true. */
  coverTokenHeader?: boolean;
  /** Cover the TraceID header when the request has it. Default: true. */
  coverTraceIDHeader?: boolean;
  /** Cover the Approov-Status header when the request has it. Default: true. */
  coverStatusHeader?: boolean;
  /** Add the created parameter. Default: true. */
  created?: boolean;
  /** Lifetime of the signature in seconds for the expires parameter, 0 for none. Default: 15. */
  expiresLifetime?: number;
}

const SIGNATURES: readonly string[] = ['both', 'install', 'account'];
const BODY_DIGEST: readonly string[] = ['none', 'optional', 'required'];
const BODY_DIGEST_ALGORITHMS: readonly string[] = ['sha-256', 'sha-512'];
export const DERIVED_COMPONENTS: readonly string[] = [
  '@method',
  '@target-uri',
  '@authority',
  '@scheme',
  '@request-target',
  '@path',
  '@query',
];
const BOOLEAN_KEYS = ['coverTokenHeader', 'coverTraceIDHeader', 'coverStatusHeader', 'created'] as const;
const KNOWN_KEYS: readonly string[] = [
  'signatures',
  'bodyDigest',
  'bodyDigestAlgorithm',
  'optionalHeaders',
  'baseComponents',
  ...BOOLEAN_KEYS,
  'expiresLifetime',
];

// an HTTP field name: one or more RFC 9110 token characters
const FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Thrown for an invalid option, before any native call. */
export class SigningOptionsError extends TypeError {
  constructor(message: string) {
    super(`Approov message signing options: ${message}`);
    this.name = 'SigningOptionsError';
  }
}

function oneOf(key: string, value: unknown, allowed: readonly string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new SigningOptionsError(`"${key}" must be one of ${allowed.join(', ')}`);
  }
  return value;
}

/**
 * Validates options and returns a plain copy holding only the keys that were given. Throws
 * SigningOptionsError for an unknown key, a wrong type or a value outside its list.
 */
export function validateSigningOptions(options: unknown): SigningOptions {
  if (options === undefined) return {};
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new SigningOptionsError('the options must be an object');
  }
  const input = options as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (!KNOWN_KEYS.includes(key)) throw new SigningOptionsError(`unknown option "${key}"`);
    const value = input[key];
    if (value === undefined) continue;
    switch (key) {
      case 'signatures':
        out[key] = oneOf(key, value, SIGNATURES);
        break;
      case 'bodyDigest':
        out[key] = oneOf(key, value, BODY_DIGEST);
        break;
      case 'bodyDigestAlgorithm':
        out[key] = oneOf(key, value, BODY_DIGEST_ALGORITHMS);
        break;
      case 'optionalHeaders':
        if (!Array.isArray(value) || value.some((h) => typeof h !== 'string' || !FIELD_NAME.test(h))) {
          throw new SigningOptionsError('"optionalHeaders" must be an array of header names');
        }
        out[key] = [...value];
        break;
      case 'baseComponents':
        if (!Array.isArray(value) || value.length === 0) {
          throw new SigningOptionsError('"baseComponents" must be a non-empty array of derived components');
        }
        for (const c of value) {
          if (typeof c !== 'string' || !DERIVED_COMPONENTS.includes(c)) {
            throw new SigningOptionsError(
              `"baseComponents" accepts only ${DERIVED_COMPONENTS.join(', ')}; cover a header with optionalHeaders`,
            );
          }
        }
        if (new Set(value).size !== value.length) {
          throw new SigningOptionsError('"baseComponents" must not repeat a component');
        }
        out[key] = [...value];
        break;
      case 'expiresLifetime':
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
          throw new SigningOptionsError('"expiresLifetime" must be a whole number of seconds, 0 or more');
        }
        out[key] = value;
        break;
      default:
        if (typeof value !== 'boolean') throw new SigningOptionsError(`"${key}" must be true or false`);
        out[key] = value;
    }
  }
  return out as SigningOptions;
}
