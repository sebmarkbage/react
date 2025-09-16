'use strict';

const path = require('path');

const repoRoot = path.resolve(__dirname, '../../');

function normalizeStack(stack) {
  if (!stack) {
    return stack;
  }
  const copy = [];
  for (let i = 0; i < stack.length; i++) {
    const [name, file, line, col, enclosingLine, enclosingCol] = stack[i];
    copy.push([
      name,
      file.replace(repoRoot, ''),
      line,
      col,
      enclosingLine,
      enclosingCol,
    ]);
  }
  return copy;
}

function normalizeIOInfo(ioInfo) {
  const {debugTask, debugStack, debugLocation, ...copy} = ioInfo;
  if (ioInfo.stack) {
    copy.stack = normalizeStack(ioInfo.stack);
  }
  if (ioInfo.owner) {
    copy.owner = normalizeDebugInfo(ioInfo.owner);
  }
  if (typeof ioInfo.start === 'number') {
    copy.start = 0;
  }
  if (typeof ioInfo.end === 'number') {
    copy.end = 0;
  }
  const promise = ioInfo.value;
  if (promise) {
    promise.then(); // init
    if (promise.status === 'fulfilled') {
      if (ioInfo.name === 'RSC stream') {
        copy.byteSize = 0;
        copy.value = {
          value: 'stream',
        };
      } else {
        copy.value = {
          value: promise.value,
        };
      }
    } else if (promise.status === 'rejected') {
      copy.value = {
        reason: promise.reason,
      };
    } else {
      copy.value = {
        status: promise.status,
      };
    }
  }
  return copy;
}

function normalizeDebugInfo(original) {
  const {debugTask, debugStack, debugLocation, ...debugInfo} = original;
  if (original.owner) {
    debugInfo.owner = normalizeDebugInfo(original.owner);
  }
  if (original.awaited) {
    debugInfo.awaited = normalizeIOInfo(original.awaited);
  }
  if (debugInfo.props) {
    debugInfo.props = {};
  }
  if (Array.isArray(debugInfo.stack)) {
    debugInfo.stack = normalizeStack(debugInfo.stack);
    return debugInfo;
  } else if (typeof debugInfo.time === 'number') {
    return {...debugInfo, time: 0};
  } else {
    return debugInfo;
  }
}

export function getDebugInfo(obj) {
  const debugInfo = obj._debugInfo;
  if (debugInfo) {
    const copy = [];
    for (let i = 0; i < debugInfo.length; i++) {
      copy.push(normalizeDebugInfo(debugInfo[i]));
    }
    return copy;
  }
  return debugInfo;
}
