'use client';

import * as React from 'react';

let LazyDynamic = React.lazy(() =>
  import('./Dynamic.js').then(exp => ({default: exp.Dynamic}))
);

export function Client() {
  const [loaded, load] = React.useReducer(() => true, false);

  return loaded ? (
    <div>
      {{}}
      loaded dynamically: <LazyDynamic />
    </div>
  ) : (
    <div>
      <button onClick={() => React.startTransition(load)}>Load dynamic import Component</button>
    </div>
  );
}
