'use strict';

function ReactShallowRenderer() {
  throw new Error(
    'react-test-renderer is deprecated. To use react-test-renderer/shallow, import react-shallow-renderer directly. See https://react.dev/warnings/react-test-renderer'
  );
}

module.exports = ReactShallowRenderer;
