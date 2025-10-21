/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';

import Button from '../Button';

export default function SuspenseTreeList(_: {}): React$Node {
  const [selected, setSelected] = React.useState(0);
  const names = ['All', '/', 'loading/', 'clothing/', 'shorts/'];
  return (
    <div>
      {names.map((name, index) => (
        <div style={{
          opacity: selected !== 0 && index < selected ? 0.3 : 1,
        }}>
          <Button onClick={() => setSelected(index)}
            style={index === selected ? {
              background: 'var(--color-background-selected)',
              color: 'var(--color-text-selected)',
              'text-align': 'left',
              display: 'block',
              width: '100%',
            }: {
              display: 'block',
              'text-align': 'left',
              width: '100%',
            }}>
            <span>{'\u00A0'.repeat(index) + name}</span>
          </Button>
        </div>
      ))}
    </div>
  );
}
