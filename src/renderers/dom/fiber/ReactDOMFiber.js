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

var DOMRenderer = ReactFiberReconciler({

  updateContainer(container : Container, children : HostChildren<Instance>) : void {
    if (container.firstChild === children && container.lastChild === children) {
      // Rudimentary bail out mechanism.
      return;
    }
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
      // console.log('prepare', c);
      if (!isNaN(c)) {
        domElement.style.background = COLORS[c];
      }
    }
    return true;
  },

  commitUpdate(domElement : Instance, oldProps : Props, newProps : Props, children : HostChildren<Instance>) : void {
    if (typeof newProps.style === 'object') {
      Object.assign(domElement.style, newProps.style);
    }
    if (typeof newProps.children === 'string') {
      // console.log('commit', newProps.children);
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

var ReactDOM = {

  render(element : ReactElement<any>, container : DOMContainerElement) {
    if (!container._reactRootContainer) {
      container._reactRootContainer = DOMRenderer.mountContainer(element, container);
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

};

module.exports = ReactDOM;
