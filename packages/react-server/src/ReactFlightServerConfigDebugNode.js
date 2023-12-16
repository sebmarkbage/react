/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {createAsyncHook, executionAsyncId} from './ReactFlightServerConfig';
import {enableAsyncDebugInfo} from 'shared/ReactFeatureFlags';

type TrackedNode = {
  cause: null | TrackedNode,
};

const trackedNodes: Map<number, TrackedNode> = new Map();

// Initialize the tracing of async operations.
// We do this globally since the async work can potentially eagerly
// start before the first request and once requests start they can interleave.
// In theory we could enable and disable using a ref count of active requests
// but given that typically this is just a live server, it doesn't really matter.
export function initAsyncDebugInfo(): void {
  if (__DEV__ && enableAsyncDebugInfo) {
    createAsyncHook({
      init(asyncId: number, type: string, triggerAsyncId: number): void {
        const trigger = trackedNodes.get(triggerAsyncId);
        const node: TrackedNode = {
          type: type === 'PROMISE' && executionAsyncId() !== triggerAsyncId ? 'AWAIT' : type,
          stack: new Error(),
          trigger: trigger,
        };
        trackedNodes.set(asyncId, node);
      },
      promiseResolve(asyncId: number): void {
        const executionAsyncId = async_hooks.executionAsyncId();
        if (asyncId !== executionAsyncId) {
          const resolvedNode = nodes.get(asyncId);
          const trigger = nodes.get(executionAsyncId);
          if (resolvedNode && trigger) {
            // Track the current execution scope as the true trigger
            // since that was what ultimately resolved this promise.
            resolvedNode.trigger = trigger;
          }
        }
      },
      destroy(asyncId: number): void {
        // We should either have the node in the graph already as a trigger
        // of whatever is still remaining.
        nodes.delete(asyncId);
      },
    }).enable();
  }
}
