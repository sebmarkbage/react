import * as React from 'react';
import {renderToPipeableStream} from 'react-server-dom-webpack/server'
import {createFromNodeStream} from 'react-server-dom-webpack/client'
import {Readable, Writable} from 'node:stream';

function CachedComponent() {
  return <div>Cached at {new Date().toString()}</div>
}

const cachedResult = [];
const cachedWritable = new Writable({
  write(chunk, encoding, callback) {
    cachedResult.push(chunk);
  },
});

const {pipe} = renderToPipeableStream(<CachedComponent />, {}, {
  environmentName: 'Cache',
});
pipe(cachedWritable);

export default function Cached() {
  let i = 0;
  const readable = new Readable({
    read() {
      this.push(cachedResult[i++]);
    },
  }); 
  return createFromNodeStream(readable, {});
}
