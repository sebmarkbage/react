/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberBeginNoopWork
 * @flow
 */

'use strict';

import type { Fiber } from 'ReactFiber';
import type { PriorityLevel } from 'ReactPriorityLevel';

var { cloneOrReuseFiber } = require('ReactFiber');

var {
  NoWork,
} = require('ReactPriorityLevel');

var {
  reconcileChildFibers,
  reconcileChildFibersInPlace,
  cloneChildFibers,
} = require('ReactChildFiber');

exports.beginNoopWork = function(current : ?Fiber, workInProgress : Fiber, priorityLevel : PriorityLevel) : ?Fiber {
  if (current) {
    workInProgress.child = current.child;
    workInProgress.childInProgress = current.childInProgress;
    workInProgress.memoizedProps = current.memoizedProps;
    workInProgress.output = current.output;
  } else {
    console.log('<' + (workInProgress.type && workInProgress.type.name || workInProgress.type) + '>',
      'noop -> no current',
      workInProgress.isAlt ? 'alt' : 'prim'
    );
    // throw new Error('It is weird not to have pending props for new mounts');
  }
  if (workInProgress.pendingWorkPriority === NoWork ||
      workInProgress.pendingWorkPriority > priorityLevel) {
    console.log('<' + (workInProgress.type && workInProgress.type.name || workInProgress.type) + '>',
      'not enough pri, noop',
      workInProgress.isAlt ? 'alt' : 'prim'
    );
    return null;
  }
  if (workInProgress.childInProgress) {
    let child = workInProgress.childInProgress;
    while (child) {
      child.return = workInProgress;
      child = child.sibling;
    }
    console.log('<' + (workInProgress.type && workInProgress.type.name || workInProgress.type) + '>',
      'noop -> childInProgress',
      workInProgress.isAlt ? 'alt' : 'prim'
    );
    return workInProgress.childInProgress;
  }
  cloneChildFibers(workInProgress);
  if (workInProgress.child) {
    console.log('<' + (workInProgress.type && workInProgress.type.name || workInProgress.type) + '>',
      'noop - child',
      workInProgress.isAlt ? 'alt' : 'prim'
    );
    return workInProgress.child;
  }
  console.log('<' + (workInProgress.type && workInProgress.type.name || workInProgress.type) + '>',
    'noop - terminal',
      workInProgress.isAlt ? 'alt' : 'prim'
  );
  return null;

  /*
        workInProgress.child = current.child;
        workInProgress.childInProgress = current.childInProgress;
        workInProgress.memoizedProps = current.memoizedProps;
        workInProgress.output = current.output;
  */
  // console.log('find work', priorityLevel);
  /*
  let workInProgress = workRoot;
  while (workInProgress) {
    if (workInProgress.pendingWorkPriority !== NoWork &&
        workInProgress.pendingWorkPriority <= priorityLevel) {
      // This node has work to do that fits our priority level criteria.
      if (workInProgress.pendingProps !== null) {
        // if (flag) throw new Error('should not happen here');
        return workInProgress;
      }

      if (flag && workInProgress !== workRoot) {
        // throw new Error('should not end up here');
      }

      const current = workInProgress.alternate;
      if (current) {
        // If we're not going to work on this yet, then we need to restore it
        // to the current state rather than the work that was already done.
        workInProgress.child = current.child;
        workInProgress.childInProgress = current.childInProgress;
        workInProgress.memoizedProps = current.memoizedProps;
        workInProgress.output = current.output;
      }

      // If we have a child let's see if any of our children has work to do.
      // Only bother doing this at all if the current priority level matches
      // because it is the highest priority for the whole subtree.
      // TODO: Coroutines can have work in their stateNode which is another
      // type of child that needs to be searched for work.
      if (workInProgress.childInProgress) {
        // console.log('childInProgress ->')
        // if (flag) throw new Error('should not happen here');
        let child = workInProgress.childInProgress;
        while (child) {
          child.return = workInProgress;
          child = child.sibling;
        }
        // TODO: Do the above and store the result so we can return here.
        child = workInProgress.childInProgress;
        while (child) {
          // Don't bother drilling further down this tree if there is no child
          // with more content.
          // TODO: Shouldn't this still drill down even though the first
          // shallow level doesn't have anything pending on it.
          if (child.pendingWorkPriority !== NoWork &&
              child.pendingWorkPriority <= priorityLevel &&
              child.pendingProps !== null) {
            return child;
          }
          child = child.sibling;
        }
      } else if (workInProgress.child) {
        // console.log('child ->')
        cloneChildrenIfNeeded(workInProgress);
        workInProgress = workInProgress.child;
        continue;
      }
      // If we match the priority but has no child and no work to do,
      // then we can safely reset the flag.
      workInProgress.pendingWorkPriority = NoWork;
    } else if (workInProgress !== workRoot) {
      const current = workInProgress.alternate;
      if (current) {
        // If we're not going to work on this yet, then we need to restore it
        // to the current state rather than the work that was already done.
        workInProgress.child = current.child;
        workInProgress.childInProgress = current.childInProgress;
        workInProgress.memoizedProps = current.memoizedProps;
        workInProgress.output = current.output;
      }
    }
    if (workInProgress === workRoot) {
      if (workInProgress.pendingWorkPriority <= priorityLevel) {
        // If this subtree had work left to do, we would have returned it by
        // now. This could happen if a child with pending work gets cleaned up
        // but we don't clear the flag then. It is safe to reset it now.
        workInProgress.pendingWorkPriority = NoWork;
      }
      return null;
    }
    while (!workInProgress.sibling) {
      workInProgress = workInProgress.return;
      // console.log('<-');
      if (!workInProgress || workInProgress === workRoot) {
        if (workInProgress.pendingWorkPriority <= priorityLevel) {
          // If this subtree had work left to do, we would have returned it by
          // now. This could happen if a child with pending work gets cleaned up
          // but we don't clear the flag then. It is safe to reset it now.
          workInProgress.pendingWorkPriority = NoWork;
        }
        return null;
      }
      if (workInProgress.pendingWorkPriority <= priorityLevel) {
        // If this subtree had work left to do, we would have returned it by
        // now. This could happen if a child with pending work gets cleaned up
        // but we don't clear the flag then. It is safe to reset it now.
        workInProgress.pendingWorkPriority = NoWork;
      }
    }
    workInProgress.sibling.return = workInProgress.return;
    workInProgress = workInProgress.sibling;
  }
  return null;
  */
};
