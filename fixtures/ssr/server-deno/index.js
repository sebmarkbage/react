
function handler(req) {
  return new Response("Hello, World!");
}

async function start() {
  const {serve} = await import('https://deno.land/std@0.125.0/http/server.ts');
//  console.log(await import('../node_modules/react-dom/server.browser.js'));
  const render = await import('./render.jsx');
  console.log(render);
  serve(handler, { port: 3000 });
}
start();

/*

const express = require('express');
const path = require('path');

const app = express();

// Application
if (process.env.NODE_ENV === 'development') {
  app.get('/', function(req, res) {
    // In development mode we clear the module cache between each request to
    // get automatic hot reloading.
    for (var key in require.cache) {
      delete require.cache[key];
    }
    const render = require('./render').default;
    render(req.url, res);
  });
} else {
  const render = require('./render').default;
  app.get('/', function(req, res) {
    render(req.url, res);
  });
}

// Static resources
app.use(express.static(path.resolve(__dirname, '..', 'build')));

// Proxy everything else to create-react-app's webpack development server
if (process.env.NODE_ENV === 'development') {
  app.use(
    '/',
    proxy({
      ws: true,
      target: 'http://localhost:3001',
    })
  );
}

app.listen(3000, () => {
  console.log('Listening on port 3000...');
});

app.on('error', function(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
});

*/