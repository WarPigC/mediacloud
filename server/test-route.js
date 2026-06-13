const express = require('express');
const app = express();
const routes = ['/*splat', '/:path(.*)', '/{*}', '/{*splat}', '/(.*splat)'];
for (const r of routes) {
  try {
    app.get(r, (req, res) => res.send('ok'));
    console.log(`'${r}' worked`);
  } catch (e) {
    console.error(`'${r}' failed:`, e.message);
  }
}
