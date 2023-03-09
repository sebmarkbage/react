import * as React from 'react';
import {Suspense} from 'react';
import ReactDOM from 'react-dom/client';
import ReactServerDOMClient from 'react-server-dom-webpack/client';

// TODO: This should be a dependency of the App but we haven't implemented CSS in Node yet.
import './style.css';

let data = ReactServerDOMClient.createFromFetch(
  fetch('/', {
    headers: {
      Accept: 'text/x-component',
    },
  }),
  {
    callServer(id, args) {
      const response = fetch('/', {
        method: 'POST',
        headers: {
          Accept: 'text/x-component',
          'rsc-action': id,
        },
        body: JSON.stringify(args),
      });
      return ReactServerDOMClient.createFromFetch(response);
    },
  }
);

// TODO: Once not needed once children can be promises.
function Content() {
  return React.use(data);
}

// TODO: This transition shouldn't really be necessary but it is for now.
React.startTransition(() => {
  ReactDOM.hydrateRoot(document, <Content />);
});
