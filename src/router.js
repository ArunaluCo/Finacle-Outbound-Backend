'use strict';

const config = require('./config');
const api = require('./handlers');
const page = require('./page');

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body larger than 5 MB'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const body = req.method === 'POST' ? await readBody(req) : '';
  const ctx = { req, res, url, path, body, started: Date.now(), warnings: [], entry: { method: req.method, path, api: 'OTHER' } };

  if (req.method === 'GET' && path === '/') return page.render(ctx);
  if (req.method === 'GET' && path === '/health') return api.health(ctx);
  if (req.method === 'POST' && path === '/oauth2/token') return api.token(ctx);
  if (req.method === 'POST' && path === config.apiBase) return api.single(ctx);
  if (req.method === 'POST' && path === `${config.apiBase}/bulk`) return api.bulk(ctx);
  if (req.method === 'POST' && path === `${config.apiBase}/ledger`) return api.ledger(ctx);
  if (path.startsWith('/__mock/')) return api.admin(ctx);
  return api.notFound(ctx);
}

module.exports = { handle };
