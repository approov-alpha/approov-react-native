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
 * ApproovProvider and useApproov: report whether Approov is ready, from the two flags of the
 * universal layer. The provider never configures Approov and never re-applies configuration: the app
 * configures once, after initialization, natively or from JavaScript.
 *
 * With an accountId the provider initializes Approov (which resolves at once when the native bootstrap of the
 * Expo config plugin already did); without one it only reads the flags, for an app initialized natively, for
 * example from approov.config by that bootstrap. A null accountId counts as none. It never calls the file form,
 * initialize() with no arguments or a null account ID, itself: an app that initializes from approov.config in
 * JavaScript calls it before rendering the provider.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';

import { ApproovService } from './ApproovService';

export interface ApproovState {
  /** True once Approov is initialized and protecting requests. */
  approovReady: boolean;
  /** True once the provider has finished its check, whatever the outcome. */
  approovChecked: boolean;
  /** The initialization error, if initialize rejected. */
  approovError: unknown | null;
}

export interface ApproovProviderProps {
  /**
   * Initialize with this account ID; leave it out, or null, when Approov is initialized natively or from
   * approov.config.
   */
  accountId?: string | null;
  /** The initialization comment, null or absent for none. */
  comment?: string | null;
  children?: React.ReactNode;
}

const INITIAL: ApproovState = { approovReady: false, approovChecked: false, approovError: null };

const ApproovContext = createContext<ApproovState>(INITIAL);

/** Initializes when given an account ID, then reads the two flags. Exported for tests. */
export async function checkApproov(accountId?: string | null, comment?: string | null): Promise<ApproovState> {
  try {
    if (accountId !== undefined && accountId !== null) await ApproovService.initialize(accountId, comment);
    const ready =
      (await ApproovService.isApproovServiceEnabled()) && (await ApproovService.isApproovProtectionEnabled());
    return { approovReady: ready, approovChecked: true, approovError: null };
  } catch (e) {
    return { approovReady: false, approovChecked: true, approovError: e };
  }
}

export function ApproovProvider({ accountId, comment, children }: ApproovProviderProps): React.JSX.Element {
  const [state, setState] = useState<ApproovState>(INITIAL);
  useEffect(() => {
    let live = true;
    checkApproov(accountId, comment).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [accountId, comment]);
  return <ApproovContext.Provider value={state}>{children}</ApproovContext.Provider>;
}

/** The Approov state from the nearest ApproovProvider. */
export function useApproov(): ApproovState {
  return useContext(ApproovContext);
}
