// console.log(require('react-dom/server'));
// import {createRoot} from 'react-dom';

import ReactDOMServer from 'react-dom/server';
console.log(ReactDOMServer);

import App from '../src/components/App.jsx';

/*
let assets;
if (process.env.NODE_ENV === 'development') {
  // Use the bundle from create-react-app's server in development mode.
  assets = {
    'main.js': '/static/js/bundle.js',
    'main.css': '',
  };
} else {
  assets = require('../build/asset-manifest.json');
}

export default function render(url, res) {
  res.socket.on('error', error => {
    // Log fatal errors
    console.error('Fatal', error);
  });
  let didError = false;
  const {pipe, abort} = renderToPipeableStream(<App assets={assets} />, {
    bootstrapScripts: [assets['main.js']],
    onCompleteShell() {
      // If something errored before we started streaming, we set the error code appropriately.
      res.statusCode = didError ? 500 : 200;
      res.setHeader('Content-type', 'text/html');
      pipe(res);
    },
    onError(x) {
      didError = true;
      console.error(x);
    },
  });
  // Abandon and switch to client rendering after 5 seconds.
  // Try lowering this to see the client recover.
  setTimeout(abort, 5000);
}
*/