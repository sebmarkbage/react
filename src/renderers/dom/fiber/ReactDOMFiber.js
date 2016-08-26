/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactDOMFiber
 * @flow
 */

'use strict';

import type { HostChildren } from 'ReactFiberReconciler';

var ReactFiberReconciler = require('ReactFiberReconciler');

type DOMContainerElement = Element & { _reactRootContainer: ?Object };

type Container = Element;
type Props = { };
type Instance = Element;

function recursivelyAppendChildren(parent : Element, child : HostChildren<Instance>) {
  if (!child) {
    return;
  }
  /* $FlowFixMe: Element should have this property. */
  if (child.nodeType === 1) {
    /* $FlowFixMe: Refinement issue. I don't know how to express different. */
    parent.appendChild(child);
  } else {
    /* As a result of the refinement issue this type isn't known. */
    let node : any = child;
    do {
      recursivelyAppendChildren(parent, node.output);
    } while (node = node.sibling);
  }
}

var COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];

if (!window.requestIdleCallback) {
  window.requestIdleCallback = function(callback) {
    setTimeout(function() {
      var endTime = Date.now() + 16;
      callback({
        timeRemaining() {
          return endTime - Date.now();
        }
      });

    }, 0);
  }
}

var DOMRenderer = ReactFiberReconciler({

  updateContainer(container : Container, children : HostChildren<Instance>) : void {
    if (container.firstChild === children && container.lastChild === children) {
      // Rudimentary bail out mechanism.
      return;
    }
    // console.log('update container', children);
    container.innerHTML = '';
    recursivelyAppendChildren(container, children);
  },

  createInstance(type : string, props : Props, children : HostChildren<Instance>) : Instance {
    const domElement = document.createElement(type);
    if (typeof props.style === 'object') {
      Object.assign(domElement.style, props.style);
    }
    if (typeof props.onMouseEnter === 'function') {
      domElement.addEventListener('mouseenter', props.onMouseEnter);
    }
    if (typeof props.onMouseLeave === 'function') {
      domElement.addEventListener('mouseleave', props.onMouseLeave);
    }
    if (typeof props.children === 'string') {
      domElement.textContent = props.children;
      return domElement;
    }
    if (props.hidden) {
      console.log('createInstance', children);
    }
    domElement.innerHTML = '';
    recursivelyAppendChildren(domElement, children);
    return domElement;
  },

  prepareUpdate(
    domElement : Instance,
    oldProps : Props,
    newProps : Props,
    children : HostChildren<Instance>
  ) : boolean {
    /*
    Visualize the reconciliation
    */
    if (typeof newProps.children === 'string') {
      var c = +newProps.children;
      //var c = Math.round(Date.now() / 50) % COLORS.length;
      // console.log('prepare', c);
      if (!isNaN(c)) {
        domElement.style.background = COLORS[c];
      }
    }
    return true;
  },

  beginUpdate(domElement) {
    var c = (Math.round(Date.now() / 50) + 2) % COLORS.length;
    // console.log('prepare', c);
    if (!isNaN(c)) {
      domElement.style.border = '3px solid ' + COLORS[c];
    }
  },

  commitUpdate(domElement : Instance, oldProps : Props, newProps : Props, children : HostChildren<Instance>) : void {
    if (typeof newProps.style === 'object') {
      Object.assign(domElement.style, newProps.style);
    }
    if (typeof newProps.children === 'string') {
      domElement.textContent = newProps.children;
      return;
    }
    if (children && (domElement.firstChild === children || domElement.firstChild === children.output)) {
      // Rudimentary bail out mechanism.
      return;
    }
    if (domElement.firstChild) {
      return;
    }
    domElement.innerHTML = '';
    recursivelyAppendChildren(domElement, children);
  },

  deleteInstance(instance : Instance) : void {
    // Noop
  },

  scheduleHighPriCallback: window.requestAnimationFrame,

  scheduleLowPriCallback: window.requestIdleCallback,

});

var root = null;

var ReactDOM = {

  render(element : ReactElement<any>, container : DOMContainerElement) {
    if (!container._reactRootContainer) {
      container._reactRootContainer = root = DOMRenderer.mountContainer(element, container);
    } else {
      DOMRenderer.updateContainer(element, container._reactRootContainer);
    }
  },

  unmountComponentAtNode(container : DOMContainerElement) {
    const root = container._reactRootContainer;
    if (root) {
      // TODO: Is it safe to reset this now or should I wait since this
      // unmount could be deferred?
      container._reactRootContainer = null;
      DOMRenderer.unmountContainer(root);
    }
  },

  // Logs the current state of the tree.
  dumpTree() {
    if (!root) {
      console.log('Nothing rendered yet.');
      return;
    }

    function logFiber(fiber : Fiber, depth) {
      console.log(
        '  '.repeat(depth) + '- ' + (fiber.type ? fiber.type.name || fiber.type : '[root]'),
        '[' + fiber.pendingWorkPriority + (fiber.pendingProps ? '*' : '') + ']'
      );
      const childInProgress = fiber.childInProgress;
      if (childInProgress) {
        if (childInProgress === fiber.child) {
          console.log('  '.repeat(depth + 1) + 'ERROR: IN PROGRESS == CURRENT');
        } else {
          console.log('  '.repeat(depth + 1) + 'IN PROGRESS');
          logFiber(childInProgress, depth + 1);
          if (fiber.child) {
            console.log('  '.repeat(depth + 1) + 'CURRENT');
          }
        }
      }
      if (fiber.child) {
        logFiber(fiber.child, depth + 1);
      }
      if (fiber.sibling) {
        logFiber(fiber.sibling, depth);
      }
    }

    console.log('FIBERS:');
    logFiber((root.stateNode : any).current, 0);
  },

};

module.exports = ReactDOM;
