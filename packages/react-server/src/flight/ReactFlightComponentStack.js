/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactComponentInfo} from 'shared/ReactTypes';

import {enableOwnerStacks} from 'shared/ReactFeatureFlags';

import {formatOwnerStack} from 'shared/ReactOwnerStackFrames';

export function getOwnerStackByComponentInfoInDev(
  componentInfo: ReactComponentInfo,
): string {
  if (!enableOwnerStacks || !__DEV__) {
    return '';
  }
  try {
    let info = '';

    let owner: void | null | ReactComponentInfo = componentInfo;

    while (owner) {
      const ownerStack: ?Error = owner.debugStack;
      if (ownerStack != null) {
        // Server Component
        owner = owner.owner;
        if (owner) {
          // TODO: Should we stash this somewhere for caching purposes?
          info += '\n' + formatOwnerStack(ownerStack);
        }
      } else {
        break;
      }
    }
    return info;
  } catch (x) {
    return '\nError generating stack: ' + x.message + '\n' + x.stack;
  }
}
