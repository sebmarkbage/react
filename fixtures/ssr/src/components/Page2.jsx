import React, {useContext} from 'react';

import Theme from './Theme.jsx';
import Suspend from './Suspend.jsx';

// import './Page.css';

export default function Page2() {
  let theme = useContext(Theme);
  return (
    <div className={theme + '-box'}>
      <Suspend>Content of a different page</Suspend>
    </div>
  );
}
