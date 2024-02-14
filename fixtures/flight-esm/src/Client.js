'use client';

import * as React from 'react';

let LazyDynamic = React.lazy(() =>
  import('./Dynamic.js').then(exp => ({default: exp.Dynamic}))
);

const F = React.forwardRef(() => {
  return 'hi';
});

export default function Client() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true));
  // if (mounted) throw new Error('hi');
  return mounted ? F : null;
}
