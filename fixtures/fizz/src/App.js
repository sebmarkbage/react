/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import Html from './Html';
import BigComponent from './BigComponent';
import * as React from 'react';

export default function App({assets, title}) {
  const components = [];

  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    setHydrated(true)
  });

  if (hydrated) {
    throw new Error('hi');
  }

  for (let i = 0; i <= 250; i++) {
    components.push(<BigComponent key={i} />);
  }

  return (
    <Html assets={assets} title={title}>
      <h1>{title}</h1>
      {components}
      <h1>all done</h1>
    </Html>
  );
}
