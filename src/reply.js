'use strict';

const store = require('./store');

/** Writes the response (unless the client already gave up) and records the call for the status page. */
function send(ctx, status, payload, summary, outcome) {
  const isText = typeof payload === 'string';
  const text = isText ? payload : JSON.stringify(payload);
  const headers = {
    'Content-Type': isText ? 'text/html; charset=utf-8' : 'application/json',
    'Content-Length': Buffer.byteLength(text),
  };
  if (ctx.warnings.length) {
    headers['X-Mock-Warnings'] = ctx.warnings.join(' | ').slice(0, 900);
  }
  const clientGone = ctx.res.destroyed;
  if (!clientGone) {
    ctx.res.writeHead(status, headers);
    ctx.res.end(text);
  }
  const entry = {
    ...ctx.entry,
    status: clientGone ? `${status} (client gone)` : status,
    ms: Date.now() - ctx.started,
    summary,
    warnings: ctx.warnings.slice(),
  };
  store.record(entry);
  if (ctx.entry.api !== 'PAGE' && ctx.entry.api !== 'HEALTH') {
    store.count(ctx.entry.api, outcome || (status >= 200 && status < 300 ? 'success' : 'other'));
    console.log(`${entry.method} ${entry.path} ${entry.status} ${entry.ms}ms ${entry.api} ${entry.ref || '-'} ${summary}`);
  }
}

const delay = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

module.exports = { send, delay };
