/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function mockRestore() {
  delete global._schedMock;
}

let callback = null;
let currentTime = 0;

function flushCallback(didTimeout, ms) {
  if (callback !== null) {
    let cb = callback;
    callback = null;
    currentTime += 1;
    cb(didTimeout);
  }
}

function requestHostCallback(cb, ms) {
  callback = cb;
  setTimeout(flushCallback, ms, false, ms);
}

function cancelHostCallback() {
  callback = null;
}

function shouldYieldToHost() {
  return false;
}

function getCurrentTime() {
  return currentTime === -1 ? 0 : currentTime;
}

global._schedMock = [
  requestHostCallback,
  cancelHostCallback,
  shouldYieldToHost,
  getCurrentTime,
];
