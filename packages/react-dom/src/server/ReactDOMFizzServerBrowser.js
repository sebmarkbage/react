/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactNodeList} from 'shared/ReactTypes';

import {
  createRequest,
  startWork,
  startFlowing,
  abort,
} from 'react-server/src/ReactFizzServer';

import {createResponseState} from './ReactDOMServerFormatConfig';

type Options = {
  identifierPrefix?: string,
  progressiveChunkSize?: number,
  signal?: AbortSignal,
};

function renderToReadableStream(
  children: ReactNodeList,
  options?: Options,
): {startReading(): ReadableStream} {
  let request;
  if (options && options.signal) {
    const signal = options.signal;
    const listener = () => {
      abort(request);
      signal.removeEventListener('abort', listener);
    };
    signal.addEventListener('abort', listener);
  }

  let hasStarted = false;
  const stream = new ReadableStream({
    start(controller) {
      request = createRequest(
        children,
        controller,
        createResponseState(options ? options.identifierPrefix : undefined),
        options ? options.progressiveChunkSize : undefined,
      );
      startWork(request);
    },
    pull(controller) {
      if (hasStarted) {
        startFlowing(request);
      }
    },
    cancel(reason) {
      abort(request);
    },
  });

  return {
    startReading(): ReadableStream {
      if (!hasStarted) {
        hasStarted = true;
        startFlowing(request);
      }
      return stream;
    },
  };
}

export {renderToReadableStream};
