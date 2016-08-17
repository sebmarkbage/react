/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactFiberBeginWork
 * @flow
 */

'use strict';

import type { ReactCoroutine } from 'ReactCoroutine';
import type { Fiber } from 'ReactFiber';
import type { HostConfig } from 'ReactFiberReconciler';

var {
  reconcileChildFibers,
  reconcileChildFibersInPlace,
} = require('ReactChildFiber');
var ReactTypeOfWork = require('ReactTypeOfWork');
var {
  IndeterminateComponent,
  FunctionalComponent,
  ClassComponent,
  HostContainer,
  HostComponent,
  CoroutineComponent,
  CoroutineHandlerPhase,
  YieldComponent,
} = ReactTypeOfWork;
var {
  NoWork,
  OffscreenPriority,
} = require('ReactPriorityLevel');
var { findNextUnitOfWorkAtPriority } = require('ReactFiberPendingWork');

module.exports = function<T, P, I, C>(config : HostConfig<T, P, I, C>) {

  function reconcileChildren(current, workInProgress, nextChildren) {
    // TODO: Children needs to be able to reconcile in place if we are
    // overriding progressed work.
    const priority = workInProgress.pendingWorkPriority;
    reconcileChildrenAtPriority(current, workInProgress, nextChildren, priority);
  }

  function reconcileChildrenAtPriority(current, workInProgress, nextChildren, priorityLevel) {
    if (current && current.childInProgress) {
      workInProgress.childInProgress = reconcileChildFibersInPlace(
        workInProgress,
        current.childInProgress,
        nextChildren,
        priorityLevel
      );
      // This is now invalid because we reused nodes.
      current.childInProgress = null;
    } else if (workInProgress.childInProgress) {
      workInProgress.childInProgress = reconcileChildFibersInPlace(
        workInProgress,
        workInProgress.childInProgress,
        nextChildren,
        priorityLevel
      );
    } else {
      // TODO: Should this reconcile in place when there is no "current"?
      workInProgress.childInProgress = reconcileChildFibers(
        workInProgress,
        current ? current.child : workInProgress.child,
        nextChildren,
        priorityLevel
      );
    }
  }

  function updateFunctionalComponent(current, workInProgress) {
    var fn = workInProgress.type;
    var props = workInProgress.pendingProps;

    var shouldLog = workInProgress.type.name === 'SierpinskiTriangle' &&
                    workInProgress.return.type === 'div';
    shouldLog = workInProgress.id === 6;

    if (typeof fn.shouldComponentUpdate === 'function') {
      if (current && current.memoizedProps) {
        // Revert to the last flushed props, incase we aborted an update.
        if (!fn.shouldComponentUpdate(current.memoizedProps, props)) {
          // console.log('bailoutOnCurrent sCU');
          return bailoutOnCurrent(current, workInProgress);
        }
      }
      if (!workInProgress.childInProgress && workInProgress.memoizedProps) {
        // Reset the props, in case this is a ping-pong case rather than a
        // completed update case. For the completed update case, the instance
        // props will already be the memoizedProps.
        if (!fn.shouldComponentUpdate(workInProgress.memoizedProps, props)) {
          // console.log('bailoutOnWIP sCU');
          return bailoutOnAlreadyFinishedWork(current, workInProgress);
        }
      }
    }

    if (shouldLog) {
      if (current) {
        console.log('current', current.id, 'child id', current.child ? current.child.id : 'none', 'child in progress id', current.childInProgress ? current.childInProgress.id : 'none');
      }
      console.log('before', workInProgress.id, 'child id', workInProgress.child ? workInProgress.child.id : 'none', 'child in progress id', workInProgress.childInProgress ? workInProgress.childInProgress.id : 'none');
    }

    var nextChildren = fn(props);
    reconcileChildren(current, workInProgress, nextChildren);
    if (shouldLog) {
      console.log('after', workInProgress.id, 'child id', workInProgress.child ? workInProgress.child.id : 'none', 'child in progress id', workInProgress.childInProgress ? workInProgress.childInProgress.id : 'none');
    }
    return workInProgress.childInProgress;
  }

  function updateClassComponent(current : ?Fiber, workInProgress : Fiber) {
    var props = workInProgress.pendingProps;
    var instance = workInProgress.stateNode;
    if (!instance) {
      var ctor = workInProgress.type;
      workInProgress.stateNode = instance = new ctor(props);
    } else if (typeof instance.shouldComponentUpdate === 'function') {
      if (current && current.memoizedProps) {
        // Revert to the last flushed props, incase we aborted an update.
        instance.props = current.memoizedProps;
        if (!instance.shouldComponentUpdate(props)) {
          return bailoutOnCurrent(current, workInProgress);
        }
      }
      if (!workInProgress.childInProgress && workInProgress.memoizedProps) {
        // Reset the props, in case this is a ping-pong case rather than a
        // completed update case. For the completed update case, the instance
        // props will already be the memoizedProps.
        instance.props = workInProgress.memoizedProps;
        if (!instance.shouldComponentUpdate(props)) {
          return bailoutOnAlreadyFinishedWork(current, workInProgress);
        }
      }
    }

    var shouldLog = workInProgress.id === 6;

    if (shouldLog) {
      if (current) {
        console.log('current class', current.id, 'child id', current.child ? current.child.id : 'none', 'child in progress id', current.childInProgress ? current.childInProgress.id : 'none');
      }
      console.log('before class', workInProgress.id, 'child id', workInProgress.child ? workInProgress.child.id : 'none', 'child in progress id', workInProgress.childInProgress ? workInProgress.childInProgress.id : 'none');
    }

    instance.props = props;
    var nextChildren = instance.render();
    reconcileChildren(current, workInProgress, nextChildren);

    if (shouldLog) {
      console.log('after class', workInProgress.id, 'child id', workInProgress.child ? workInProgress.child.id : 'none', 'child in progress id', workInProgress.childInProgress ? workInProgress.childInProgress.id : 'none');
    }

    return workInProgress.childInProgress;
  }

  function updateHostComponent(current, workInProgress) {
    var nextChildren = workInProgress.pendingProps.children;

    let priority = workInProgress.pendingWorkPriority;
    if (workInProgress.pendingProps.hidden && priority !== OffscreenPriority) {
      // If this host component is hidden, we can reconcile its children at
      // the lowest priority and bail out from this particular pass. Unless, we're
      // currently reconciling the lowest priority.
      // If we have a child in progress already, we reconcile against that set
      // to retain any work within it. We'll recreate any component that was in
      // the current set and next set but not in the previous in progress set.
      // TODO: This attaches a node that hasn't completed rendering so it
      // becomes part of the render tree, even though it never completed. Its
      // `output` property is unpredictable because of it.
      reconcileChildrenAtPriority(current, workInProgress, nextChildren, OffscreenPriority);
      workInProgress.child = current ? current.child : null;
      let child = workInProgress.childInProgress;
      while (child) {
        const currentChild = child.alternate;
        if (currentChild) {
          child.child = currentChild.child;
          child.childInProgress = currentChild.childInProgress;
          child.memoizedProps = currentChild.memoizedProps;
          child.output = currentChild.output;
        }
        child.nextEffect = null;
        child.firstEffect = null;
        child.lastEffect = null;

        child = child.sibling;
      }
      return null;
    } else {
      reconcileChildren(current, workInProgress, nextChildren);
      return workInProgress.childInProgress;
    }
  }

  function mountIndeterminateComponent(current, workInProgress) {
    var fn = workInProgress.type;
    var props = workInProgress.pendingProps;
    var value = fn(props);
    if (typeof value === 'object' && value && typeof value.render === 'function') {
      // Proceed under the assumption that this is a class instance
      workInProgress.tag = ClassComponent;
      if (workInProgress.alternate) {
        workInProgress.alternate.tag = ClassComponent;
      }
      value = value.render();
    } else {
      // Proceed under the assumption that this is a functional component
      workInProgress.tag = FunctionalComponent;
      if (workInProgress.alternate) {
        workInProgress.alternate.tag = FunctionalComponent;
      }
    }
    var shouldLog = workInProgress.id === 6;

    if (shouldLog) {
      if (current) {
        console.log('current indeterminate', current.id, 'child id', current.child ? current.child.id : 'none', 'child in progress id', current.childInProgress ? current.childInProgress.id : 'none');
      }
      console.log('before indeterminate', workInProgress.id, 'child id', workInProgress.child ? workInProgress.child.id : 'none', 'child in progress id', workInProgress.childInProgress ? workInProgress.childInProgress.id : 'none');
    }
    reconcileChildren(current, workInProgress, value);
    if (shouldLog) {
      console.log('after indeterminate', workInProgress.id, 'child id', workInProgress.child ? workInProgress.child.id : 'none', 'child in progress id', workInProgress.childInProgress ? workInProgress.childInProgress.id : 'none');
    }
    return workInProgress.childInProgress;
  }

  function updateCoroutineComponent(current, workInProgress) {
    var coroutine = (workInProgress.pendingProps : ?ReactCoroutine);
    if (!coroutine) {
      throw new Error('Should be resolved by now');
    }
    reconcileChildren(current, workInProgress, coroutine.children);
  }

  function reuseChildren(returnFiber : Fiber, firstChild : Fiber) {
    // TODO on the TODO: Is this not necessary anymore because I moved the
    // priority reset?
    // TODO: None of this should be necessary if structured better.
    // The returnFiber pointer only needs to be updated when we walk into this child
    // which we don't do right now. If the pending work priority indicated only
    // if a child has work rather than if the node has work, then we would know
    // by a single lookup on workInProgress rather than having to go through
    // each child.
    let child = firstChild;
    do {
      // Update the returnFiber of the child to the newest fiber.
      child.return = returnFiber;
      // Retain the priority if there's any work left to do in the children.
      if (child.pendingWorkPriority !== NoWork &&
          (returnFiber.pendingWorkPriority === NoWork ||
          returnFiber.pendingWorkPriority > child.pendingWorkPriority)) {
        returnFiber.pendingWorkPriority = child.pendingWorkPriority;
      }
    } while (child = child.sibling);
  }

  function reuseChildrenEffects(returnFiber : Fiber, firstChild : Fiber) {
    let child = firstChild;
    do {
      // Ensure that the first and last effect of the parent corresponds
      // to the children's first and last effect.
      if (!returnFiber.firstEffect) {
        returnFiber.firstEffect = child.firstEffect;
      }
      if (child.lastEffect) {
        if (returnFiber.lastEffect) {
          returnFiber.lastEffect.nextEffect = child.firstEffect;
        }
        returnFiber.lastEffect = child.lastEffect;
      }
    } while (child = child.sibling);
  }

  var { cloneOrReuseFiber } = require('ReactFiber');

  var {
    NoWork,
  } = require('ReactPriorityLevel');

  function cloneSiblings(current : Fiber, workInProgress : Fiber, returnFiber : Fiber) {
    workInProgress.return = returnFiber;
    while (current.sibling) {
      current = current.sibling;
      workInProgress = workInProgress.sibling = cloneOrReuseFiber(
        current,
        current.pendingWorkPriority
      );
      workInProgress.return = returnFiber;
    }
    workInProgress.sibling = null;
  }

  function cloneChildrenIfNeeded(workInProgress : Fiber) {
    const current = workInProgress.alternate;
    if (!current || workInProgress.child !== current.child) {
      // If there is no alternate, then we don't need to clone the children.
      // If the children of the alternate fiber is a different set, then we don't
      // need to clone. We need to reset the return fiber though since we'll
      // traverse down into them.
      // TODO: I don't think it is actually possible for them to be anything but
      // equal at this point because this fiber was just cloned. Can we skip this
      // check? Similar question about the return fiber.
      let child = workInProgress.child;
      while (child) {
        child.return = workInProgress;
        child = child.sibling;
      }
      return;
    }
    // TODO: This used to reset the pending priority. Not sure if that is needed.
    // workInProgress.pendingWorkPriority = current.pendingWorkPriority;

    // TODO: The below priority used to be set to NoWork which would've
    // dropped work. This is currently unobservable but will become
    // observable when the first sibling has lower priority work remaining
    // than the next sibling. At that point we should add tests that catches
    // this.

    const currentChild = current.child;
    if (!currentChild) {
      return;
    }
    workInProgress.child = cloneOrReuseFiber(
      currentChild,
      currentChild.pendingWorkPriority
    );
    cloneSiblings(currentChild, workInProgress.child, workInProgress);
  }


  function bailoutOnCurrent(current : Fiber, workInProgress : Fiber) : ?Fiber {
    // The most likely scenario is that the previous copy of the tree contains
    // the same props as the new one. In that case, we can just copy the output
    // and children from that node.
    workInProgress.memoizedProps = workInProgress.pendingProps;
    workInProgress.output = current.output;
    const priorityLevel = workInProgress.pendingWorkPriority;
    // workInProgress.pendingProps = null;
    workInProgress.stateNode = current.stateNode;

    workInProgress.nextEffect = null;
    workInProgress.firstEffect = null;
    workInProgress.lastEffect = null;

    workInProgress.childInProgress = null; // current.childInProgress;
    workInProgress.child = current.child;

    if (current.child) {
      // If we bail out but still has work with the current priority in this
      // subtree, we need to go find it right now. If we don't, we won't flush
      // it until the next tick.
      // TODO... Err... this is always true.
      if (workInProgress.pendingWorkPriority !== NoWork && workInProgress.pendingWorkPriority <= priorityLevel) {
        var props = workInProgress.pendingProps;
        workInProgress.pendingProps = null;
        var work = findNextUnitOfWorkAtPriority(
          workInProgress,
          workInProgress.pendingWorkPriority,
          true
        );
        /*
        cloneChildrenIfNeeded(workInProgress);
        let c = workInProgress.child;
        while (c) {
          const cc = c.alternate;
          if (cc) {
            // If we're not going to work on this yet, then we need to restore it
            // to the current state rather than the work that was already done.
            c.child = cc.child;
            c.childInProgress = cc.childInProgress;
            c.memoizedProps = cc.memoizedProps;
            c.output = cc.output;
          }
          c = c.sibling;
        }

        if ((!window.logged) && work) {
          window.logged = true;
          console.log(current.child === workInProgress.child ? 'reused' : 'forked');
          console.log('current', {...current.child});
          console.log('wip', {...workInProgress.child});
        }
        */
        workInProgress.pendingProps = props;
        return work;
      } else {
        workInProgress.child = current.child;
        reuseChildren(workInProgress, workInProgress.child);
        return null;
      }
    } else {
      workInProgress.child = null;
      return null;
    }
  }

  function bailoutOnAlreadyFinishedWork(current, workInProgress : Fiber) : ?Fiber {
    // If we started this work before, and finished it, or if we're in a
    // ping-pong update scenario, this version could already be what we're
    // looking for. In that case, we should be able to just bail out.
    const priorityLevel = workInProgress.pendingWorkPriority;
    workInProgress.pendingProps = null;

    workInProgress.firstEffect = null;
    workInProgress.nextEffect = null;
    workInProgress.lastEffect = null;

    const child = workInProgress.child;
    if (child) {
      // Ensure that the effects of reused work are preserved.
      reuseChildrenEffects(workInProgress, child);
      // If we bail out but still has work with the current priority in this
      // subtree, we need to go find it right now. If we don't, we won't flush
      // it until the next tick.
      reuseChildren(workInProgress, child);
      if (workInProgress.pendingWorkPriority !== NoWork &&
          workInProgress.pendingWorkPriority <= priorityLevel) {
        // TODO: This passes the current node and reads the priority level and
        // pending props from that. We want it to read our priority level and
        // pending props from the work in progress. Needs restructuring.
        return findNextUnitOfWorkAtPriority(workInProgress, priorityLevel);
      }
    }
    return null;
  }

  function beginWork(current : ?Fiber, workInProgress : Fiber) : ?Fiber {
    // console.log('<' + (workInProgress.type && workInProgress.type.name || workInProgress.type), !!current ? 'update' : '', '>');
    // The current, flushed, state of this fiber is the alternate.
    // Ideally nothing should rely on this, but relying on it here
    // means that we don't need an additional field on the work in
    // progress.
    if (current && workInProgress.pendingProps === current.memoizedProps) {
      // console.log('bailoutOnCurrent ref eq');
      return bailoutOnCurrent(current, workInProgress);
    }

    if (!workInProgress.childInProgress &&
        workInProgress.pendingProps === workInProgress.memoizedProps) {
      // console.log('bailoutOnWIP ref eq');
      return bailoutOnAlreadyFinishedWork(current, workInProgress);
    }

    switch (workInProgress.tag) {
      case IndeterminateComponent:
        return mountIndeterminateComponent(current, workInProgress);
      case FunctionalComponent:
        return updateFunctionalComponent(current, workInProgress);
      case ClassComponent:
        return updateClassComponent(current, workInProgress);
      case HostContainer:
        reconcileChildren(current, workInProgress, workInProgress.pendingProps);
        // A yield component is just a placeholder, we can just run through the
        // next one immediately.
        if (workInProgress.childInProgress) {
          return beginWork(
            workInProgress.childInProgress.alternate,
            workInProgress.childInProgress
          );
        }
        return null;
      case HostComponent:
        if (workInProgress.stateNode && config.beginUpdate) {
          config.beginUpdate(workInProgress.stateNode);
        }
        return updateHostComponent(current, workInProgress);
      case CoroutineHandlerPhase:
        // This is a restart. Reset the tag to the initial phase.
        workInProgress.tag = CoroutineComponent;
        // Intentionally fall through since this is now the same.
      case CoroutineComponent:
        updateCoroutineComponent(current, workInProgress);
        // This doesn't take arbitrary time so we could synchronously just begin
        // eagerly do the work of workInProgress.child as an optimization.
        if (workInProgress.childInProgress) {
          return beginWork(
            workInProgress.childInProgress.alternate,
            workInProgress.childInProgress
          );
        }
        return workInProgress.childInProgress;
      case YieldComponent:
        // A yield component is just a placeholder, we can just run through the
        // next one immediately.
        if (workInProgress.sibling) {
          return beginWork(
            workInProgress.sibling.alternate,
            workInProgress.sibling
          );
        }
        return null;
      default:
        throw new Error('Unknown unit of work tag');
    }
  }

  return {
    beginWork,
  };

};
