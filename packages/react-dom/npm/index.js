'use strict';

var m;
if (process.env.NODE_ENV === 'production') {
  m = require('./cjs/react-dom.production.min.js');
} else {
  m = require('./cjs/react-dom.development.js');
}

exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED =
  m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
exports.createPortal = m.createPortal;
exports.findDOMNode = m.findDOMNode;
exports.flushSync = m.flushSync;
exports.hydrate = m.hydrate;
exports.render = m.render;
exports.unmountComponentAtNode = m.unmountComponentAtNode;
exports.unstable_batchedUpdates = m.unstable_batchedUpdates;
exports.unstable_renderSubtreeIntoContainer =
  m.unstable_renderSubtreeIntoContainer;
exports.version = m.version;
