/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {CacheDispatcher} from 'react-reconciler/src/ReactInternalTypes';

/**
 * Keeps track of the current Cache dispatcher.
 */
const ReactCurrentCache = {
  current: (null: null | CacheDispatcher),
  // We can only have one active cache at time globally, we store that
  // separately from the currently rendering renderer so we can error.
  global: (null: null | CacheDispatcher),
};

export default ReactCurrentCache;
