/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import isArray from 'shared/isArray';

import {getCurrentFiberOwnerNameInDevOrNull} from 'react-reconciler/src/ReactCurrentFiber';
import {disableTextareaChildren} from 'shared/ReactFeatureFlags';

let didWarnValDefaultVal = false;

/**
 * Implements a <textarea> host component that allows setting `value`, and
 * `defaultValue`. This differs from the traditional DOM API because value is
 * usually set as PCDATA children.
 *
 * If `value` is not supplied (or null/undefined), user actions that affect the
 * value will trigger updates to the element.
 *
 * If `value` is supplied (and not null/undefined), the rendered element will
 * not trigger updates to the element. Instead, the `value` prop must change in
 * order for the rendered element to be updated.
 *
 * The rendered element will be initialized with an empty value, the prop
 * `defaultValue` if specified, or the children content (deprecated).
 */

export function validateTextareaProps(element: Element, props: Object) {
  if (__DEV__) {
    if (
      props.value !== undefined &&
      props.defaultValue !== undefined &&
      !didWarnValDefaultVal
    ) {
      console.error(
        '%s contains a textarea with both value and defaultValue props. ' +
          'Textarea elements must be either controlled or uncontrolled ' +
          '(specify either the value prop, or the defaultValue prop, but not ' +
          'both). Decide between using a controlled or uncontrolled textarea ' +
          'and remove one of these props. More info: ' +
          'https://reactjs.org/link/controlled-components',
        getCurrentFiberOwnerNameInDevOrNull() || 'A component',
      );
      didWarnValDefaultVal = true;
    }
    if (props.children != null && props.value == null) {
      console.error(
        'Use the `defaultValue` or `value` props instead of setting ' +
          'children on <textarea>.',
      );
    }
  }
}

export function updateTextarea(
  element: Element,
  value: mixed,
  defaultValue: mixed,
) {
  const node: HTMLTextAreaElement = (element: any);
  if (value != null) {
    // Cast `value` to a string to ensure the value is set correctly. While
    // browsers typically do this as necessary, jsdom doesn't.

    let newValue = '';
    if (typeof value !== 'function' && typeof value !== 'symbol') {
      newValue = '' + value;
    }
    // To avoid side effects (such as losing text selection), only set value if changed
    if (node.value !== newValue) {
      node.value = newValue;
    }
    // TOOO: This should respect disableInputAttributeSyncing flag.
    // TODO: This doesn't seem consistent with input that defaultValue wins if specified.
    if (defaultValue == null) {
      if (node.defaultValue !== newValue) {
        node.defaultValue = newValue;
      }
      return;
    }
  }
  if (
    defaultValue != null &&
    typeof defaultValue !== 'function' &&
    typeof defaultValue !== 'symbol'
  ) {
    node.defaultValue = defaultValue;
  } else {
    node.defaultValue = '';
  }
}

export function initTextarea(
  element: Element,
  value: mixed,
  defaultValue: mixed,
  children: mixed,
) {
  const node: HTMLTextAreaElement = (element: any);

  let initialValue;

  // Only bother fetching default value if we're going to use it
  if (value == null) {
    if (children != null) {
      if (!disableTextareaChildren) {
        if (defaultValue != null) {
          throw new Error(
            'If you supply `defaultValue` on a <textarea>, do not pass children.',
          );
        }

        if (isArray(children)) {
          if (children.length > 1) {
            throw new Error('<textarea> can only have at most one child.');
          }

          children = children[0];
        }

        defaultValue = children;
      }
    }
    initialValue = defaultValue;
  } else {
    initialValue = value;
  }

  if (
    initialValue != null &&
    typeof initialValue !== 'function' &&
    typeof initialValue !== 'symbol'
  ) {
    const stringValue = node.defaultValue = (initialValue: any); // This will be toString:ed.

    const textContent = node.textContent;
    // Only set node.value if textContent is equal to the expected
    // initial value. In IE10/IE11 there is a bug where the placeholder attribute
    // will populate textContent as well.
    // https://developer.microsoft.com/microsoft-edge/platform/issues/101525/
    if (textContent === stringValue) {
      if (textContent !== '' && textContent !== null) {
        node.value = textContent;
      }
    }
  } else {
    node.defaultValue = '';
  }

}

export function restoreControlledTextareaState(
  element: Element,
  props: Object,
) {
  // DOM component is still mounted; update
  updateTextarea(element, props.value, props.defaultValue);
}
