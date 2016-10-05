/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberCommitWork
 * @flow
 */

'use strict';

import type { Fiber } from 'ReactFiber';
import type { FiberRoot } from 'ReactFiberRoot';
import type { HostConfig } from 'ReactFiberReconciler';

var ReactTypeOfWork = require('ReactTypeOfWork');
var {
  ClassComponent,
  HostContainer,
  HostComponent,
  HostText,
} = ReactTypeOfWork;
var { callCallbacks } = require('ReactFiberUpdateQueue');

var {
  Placement,
  PlacementAndUpdate,
} = require('ReactTypeOfSideEffect');

module.exports = function<T, P, I, TI, C>(config : HostConfig<T, P, I, TI, C>) {

  const updateContainer = config.updateContainer;
  const commitUpdate = config.commitUpdate;
  const commitTextUpdate = config.commitTextUpdate;

  const appendChild = config.appendChild;
  const insertBefore = config.insertBefore;
  const removeChild = config.removeChild;

  function getHostParent(fiber : Fiber) : ?I {
    let parent = fiber.return;
    while (parent) {
      switch (parent.tag) {
        case HostComponent:
          return parent.stateNode;
        case HostContainer:
          // TODO: Currently we use the updateContainer feature to update these,
          // but we should be able to handle this case too.
          return null;
      }
      parent = parent.return;
    }
    return null;
  }

  function getHostSibling(fiber : Fiber) : ?I {
    // We're going to search forward into the tree until we find a sibling host
    // node.
    return null;
    /*
    TODO
    let node = fiber;
    while (node.sibling) {
      node = node.sibling;
      if (node.tag === HostComponent &&
          node.effectTag !== Placement &&
          node.effectTag !== PlacementAndUpdate) {
        return node.stateNode;
      }
    }
    */
  }

  function recursivelyAppendChildren(parent : any, before : any, child : any) {
    if (!child) {
      return;
    }
    // HACK
    if (child.tag > 90) {
      let node = child;
      if (before) {
        insertBefore(parent, child, before);
      } else {
        appendChild(parent, child);
      }
    } else {
      let node : any = child;
      do {
        recursivelyAppendChildren(parent, before, node.output);
      } while (node = node.sibling);
    }
  }

  function recursivelyDeleteChildren(parent : any, child : any) {
    if (!child) {
      return;
    }
    // HACK
    if (child.tag > 90) {
      let node = child;
      removeChild(parent, child);
    } else {
      let node : any = child;
      do {
        recursivelyDeleteChildren(parent, node.output);
      } while (node = node.sibling);
    }
  }

  function commitInsertion(finishedWork : Fiber) : void {
    // Recursively insert all host nodes into the parent.
    const parent = getHostParent(finishedWork);
    if (!parent) {
      return;
    }
    const nextSibling = getHostSibling(finishedWork);
    // We only have the top Fiber that was inserted but we need recurse down its
    // children to find all the terminal nodes.
    recursivelyAppendChildren(parent, nextSibling, finishedWork.output);
  }

  function commitDeletion(current : Fiber) : void {
    // Recursively delete all host nodes from the parent.
    const parent = getHostParent(current);
    if (!parent) {
      return;
    }
    // TODO: Find all the children recursively and delete them.
    recursivelyDeleteChildren(parent, current.output);
  }

  function commitWork(current : ?Fiber, finishedWork : Fiber) : void {
    switch (finishedWork.tag) {
      case ClassComponent: {
        // Clear updates from current fiber. This must go before the callbacks
        // are reset, in case an update is triggered from inside a callback. Is
        // this safe? Relies on the assumption that work is only committed if
        // the update queue is empty.
        if (finishedWork.alternate) {
          finishedWork.alternate.updateQueue = null;
        }
        if (finishedWork.callbackList) {
          const { callbackList } = finishedWork;
          finishedWork.callbackList = null;
          callCallbacks(callbackList, finishedWork.stateNode);
        }
        // TODO: Fire componentDidMount/componentDidUpdate, update refs
        return;
      }
      case HostContainer: {
        // TODO: Attach children to root container.
        const children = finishedWork.output;
        const root : FiberRoot = finishedWork.stateNode;
        const containerInfo : C = root.containerInfo;
        updateContainer(containerInfo, children);
        return;
      }
      case HostComponent: {
        if (finishedWork.stateNode == null || !current) {
          throw new Error('This should only be done during updates.');
        }
        // Commit the work prepared earlier.
        const newProps = finishedWork.memoizedProps;
        const oldProps = current.memoizedProps;
        const instance : I = finishedWork.stateNode;
        commitUpdate(instance, oldProps, newProps);
        return;
      }
      case HostText: {
        if (finishedWork.stateNode == null || !current) {
          throw new Error('This should only be done during updates.');
        }
        const textInstance : TI = finishedWork.stateNode;
        const newText : string = finishedWork.memoizedProps;
        const oldText : string = current.memoizedProps;
        commitTextUpdate(textInstance, oldText, newText);
        return;
      }
      default:
        throw new Error('This unit of work tag should not have side-effects.');
    }
  }

  return {
    commitInsertion,
    commitDeletion,
    commitWork,
  };

};
