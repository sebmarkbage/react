/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Container} from './ReactFiberConfig';
import type {StackCursor} from './ReactFiberStack';
import {createCursor} from './ReactFiberStack';

export function getCurrentRootHostContainer(): null | Container {
  return rootInstanceStackCursor.current;
}

export const rootInstanceStackCursor: StackCursor<Container | null> =
  createCursor(null);
