import React from 'react';
import {hydrateRoot} from 'react-dom';

import App from './components/App';

hydrateRoot(document, <App assets={window.assetManifest} />);
