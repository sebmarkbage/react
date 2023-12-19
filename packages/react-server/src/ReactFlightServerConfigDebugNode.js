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

type RootTask = null;

type TrackedTask = {
  cause: RootTask | TrackedTask,
  stack: null | Error,
  start: number, // start time of I/O tasks, otherwise -1
  stop: number, // time when a promise resolved
};

const trackedTasks: Map<number, RootTask | TrackedTask> = new Map();

// Initialize the tracing of async operations.
// We do this globally since the async work can potentially eagerly
// start before the first request and once requests start they can interleave.
// In theory we could enable and disable using a ref count of active requests
// but given that typically this is just a live server, it doesn't really matter.
export function initAsyncDebugInfo(): void {
  if (__DEV__ && enableAsyncDebugInfo) {
    createAsyncHook({
      init(asyncId: number, type: string, triggerAsyncId: number): void {
        const trigger = trackedTasks.get(triggerAsyncId);
        if (trigger === undefined) {
          // We're inside a trigger that isn't spawned from a call graph starting
          // from one of our requests so we don't track it.
          return;
        }
        if (type === 'Microtask' || type === 'TickObject') {
          // queueMicrotask and process.nextTick aren't really I/O for our purposes.
          // We can skip over these. We do this by simply tagging this task as if
          // it was its trigger to skip over it.
          trackedTasks.set(asyncId, trigger);
          return;
        }
        // We stash the current execution stack frame but we don't touch the stack
        // property yet to avoid materializing it unless this actually ends up as
        // part of a resolution.
        const stack = new Error();
        // If the type isn't a PROMISE and it's some kind of I/O we track its 
        const startTime = type !== 'PROMISE' ? performance.now() : -1;
        // This is an I/O task.
        const task: TrackedTask = {
          cause: trigger,
          stack: stack,
          start: ,
          stop: -1,
        };
        trackedTasks.set(asyncId, task);
      },
      promiseResolve(resolvedId: number): void {
        const triggerId = executionAsyncId();
        if (resolvedId === triggerId) {
          // This happens in a .then() which resolves itself after it executes.
          // This needs to retain the original cause which will be another Promise.
          return;
        }
        const resolved = trackedTasks.get(resolvedId);
        const trigger = trackedTasks.get(triggerId);
        if (resolved === undefined || trigger === undefined) {
          // If we're not tracking the resolved task there's nothing to update.
          // If we're not tracking the trigger, then the best we can do is treat
          // the creation context as the trigger.
          return;
        }
        // The currently executing task resolved this promise, so it was the cause
        // for it executing, not the point where the promise was created.
        resolved.cause = trigger;
        resolved.stop = performance.now();
      },
      destroy(asyncId: number): void {
        // We should either have the task in the graph already as a trigger
        // of whatever is still remaining.
        trackedTasks.delete(asyncId);
      },
    }).enable();
  }
}

// Start tracking debug info in this context.
export function startDebugInfo() {
  // We'll treat the current executing task as a root task even if it was spawned from another task.
  // We'll also use this as a signal to start tracking any work spawned from this task.
  trackedTasks.set(executionAsyncId(), null);
}

// Get the debug info for tracing the currently executing task.
export function getDebugInfo() {

}
