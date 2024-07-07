/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ComponentStackNode} from './ReactFizzComponentStack';

export let currentComponentStack: null | ComponentStackNode = null;

export function setCurrentComponentStack(
  node: null | ComponentStackNode,
): void {
  if (__DEV__) {
    currentComponentStack = node;
  }
}
