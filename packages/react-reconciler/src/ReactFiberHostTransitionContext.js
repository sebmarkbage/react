/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactContext} from 'shared/ReactTypes';
import type {TransitionStatus} from './ReactFiberConfig';

import {createNotPendingTransition} from './ReactFiberConfig';

import {REACT_CONTEXT_TYPE} from 'shared/ReactSymbols';

export const HostTransitionContext: ReactContext<TransitionStatus | null> = {
  $$typeof: REACT_CONTEXT_TYPE,
  Provider: (null: any),
  Consumer: (null: any),
  _currentValue: createNotPendingTransition(),
  _currentValue2: createNotPendingTransition(),
  _threadCount: 0,
};
