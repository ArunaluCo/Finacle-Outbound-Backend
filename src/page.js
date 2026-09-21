'use strict';

const config = require('./config');
const store = require('./store');
const scenarios = require('./scenarios');
const { send } = require('./reply');

const escape = (value) => String(value === undefined || value === null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function uptime() {
  const seconds = Math.round((Date.now() - store.state.startedAt) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min ${seconds % 60} s`;
}

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (config.tlsKeyFile ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto.split(',')[0]}://${host}`;
}

const STYLE = `
:root { --paper:#edf3ee; --ink:#183029; --stamp:#1f7a4d; --rule:#c8d9ce; --muted:#5a6d66; --alert:#a8382b; }
* { box-sizing:border-box; }
body { margin:0; color:var(--ink); font:16px/1.5 "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
  background-color:var(--paper);
  background-image:repeating-radial-gradient(circle at 0 0, transparent 0 13px, rgba(31,122,77,.045) 13px 14px); }
main { max-width:1000px; margin:0 auto; padding:40px 24px 64px; }
header { display:flex; gap:32px; align-items:center; flex-wrap:wrap; padding-bottom:28px; border-bottom:2px solid var(--rule); }
.stamp { width:156px; height:156px; transform:rotate(-9deg); flex:none; }
h1 { margin:0 0 6px; font-size:2.1rem; font-weight:600; letter-spacing:-.01em; }
.lead { margin:0 0 14px; color:var(--muted); max-width:60ch; }
dl.facts { display:grid; grid-template-columns:max-content 1fr; gap:2px 18px; margin:0; font-size:.93rem; }
dl.facts dt { color:var(--muted); }
dl.facts dd { margin:0; font-variant-numeric:tabular-nums; }
h2 { font-size:1.25rem; font-weight:600; margin:40px 0 10px; }
p.note { color:var(--muted); margin:0 0 12px; max-width:72ch; }
.warn { color:var(--alert); font-weight:600; }
.scroll { overflow-x:auto; }
table { border-collapse:collapse; width:100%; font-size:.92rem; }
th, td { text-align:left; padding:7px 10px; border-bottom:1px solid var(--rule); vertical-align:top; }
th { font-weight:600; color:var(--muted); }
td.num { font-variant-numeric:tabular-nums; text-align:right; }
code { font-family:ui-monospace, "Cascadia Mono", Consolas, monospace; font-size:.88rem; word-break:break-all; }
.bad { color:var(--alert); }
a { color:var(--stamp); }
:focus-visible { outline:3px solid var(--stamp); outline-offset:2px; }
@media (max-width:640px) { main { padding:24px 16px 48px; } .stamp { width:112px; height:112px; } h1 { font-size:1.6rem; } }
`;

const STAMP = `
<svg class="stamp" viewBox="0 0 160 160" role="img" aria-label="Mock is running">
  <g fill="none" stroke="#1f7a4d">
    <circle cx="80" cy="80" r="74" stroke-width="5"/>
    <circle cx="80" cy="80" r="64" stroke-width="1.5"/>
    <path d="M52 82 L72 102 L110 60" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="80" y="136" text-anchor="middle" fill="#1f7a4d" font-size="17" font-weight="700" letter-spacing="3"
        font-family="Segoe UI, system-ui, Arial, sans-serif">RUNNING</text>
</svg>`;

function render(ctx) {
  ctx.entry.api = 'PAGE';
  const base = baseUrl(ctx.req);
  const s = store.state;
  const setvar = [
    ['VA_TOKEN_URL', `${base}/oauth2/token`],
    ['VA_SINGLE_VALIDATE_URL', `${base}${config.apiBase}`],
    ['VA_BULK_VALIDATE_URL', `${base}${config.apiBase}/bulk`],
    ['VA_TXN_POST_URL', `${base}${config.apiBase}/ledger`],
  ];
  const apis = ['TOKEN', 'SINGLE', 'BULK', 'LEDGER', 'ADMIN', 'OTHER'];
  const time = (iso) => iso.slice(11, 19);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15"><title>VAM mock - running</title><style>${STYLE}</style></head>
<body><main>
<header>${STAMP}
  <div>
    <h1>VAM mock is running</h1>
    <p class="lead">Stand-in for the Intellect VAM APIs behind the bank's API Manager, for Finacle lab tests.
      Same paths and payloads as SIT; data comes from fixed VA numbers, nothing is stored on disk.</p>
    <dl class="facts">
      <dt>Started</dt><dd>${escape(s.startedAt.toISOString().replace('T', ' ').slice(0, 19))} UTC (up ${escape(uptime())})</dd>
      <dt>Token lifetime</dt><dd>${config.tokenTtlSec} s, ${s.tokens.size} active</dd>
      <dt>Slow scenarios</dt><dd>${config.slowSec} s delay</dd>
      <dt>Ledger posted</dt><dd>${s.posted.size} transaction(s) remembered for duplicate checks</dd>
      <dt>Node</dt><dd>${escape(process.version)}</dd>
    </dl>
    ${config.usingDefaultCredentials ? '<p class="warn">Demo client credentials in use: set MOCK_CLIENT_ID and MOCK_CLIENT_SECRET.</p>' : ''}
  </div>
</header>

<h2>Point Finacle here</h2>
<p class="note">Put these in CUST_SETVAR_MAINT (SLIPS / ISLIPS) and the mock client id/secret in the secret file.
  No redeploy needed. Set VA_TLS_EXPECTED_HOST to - because these URLs use the domain.</p>
<div class="scroll"><table><thead><tr><th scope="col">Variable</th><th scope="col">Value</th></tr></thead><tbody>
${setvar.map(([name, value]) => `<tr><td><code>${name}</code></td><td><code>${escape(value)}</code></td></tr>`).join('\n')}
</tbody></table></div>

<h2>Calls since start</h2>
<div class="scroll"><table><thead><tr><th scope="col">API</th><th scope="col">Calls</th><th scope="col">Success</th><th scope="col">Failure</th><th scope="col">Other</th></tr></thead><tbody>
${apis.map((name) => { const c = s.counters[name] || { calls: 0, success: 0, failure: 0, other: 0 };
    return `<tr><td>${name}</td><td class="num">${c.calls}</td><td class="num">${c.success}</td><td class="num">${c.failure}</td><td class="num">${c.other}</td></tr>`; }).join('\n')}
</tbody></table></div>

<h2>Latest calls</h2>
<p class="note">Newest first, last ${config.logSize}. Headers and bodies are not kept. Contract warnings show in red.</p>
<div class="scroll"><table><thead><tr><th scope="col">Time (UTC)</th><th scope="col">API</th><th scope="col">Status</th><th scope="col">ms</th><th scope="col">channelRefNumber</th><th scope="col">Result</th></tr></thead><tbody>
${s.log.filter((e) => e.api !== 'PAGE' && e.api !== 'HEALTH').map((e) => `<tr><td>${escape(time(e.at))}</td><td>${escape(e.api)}</td><td>${escape(e.status)}</td><td class="num">${escape(e.ms)}</td><td><code>${escape(e.ref || '-')}</code></td><td>${escape(e.summary)}${e.warnings.length ? `<br><span class="bad">${escape(e.warnings.join('; '))}</span>` : ''}</td></tr>`).join('\n') || '<tr><td colspan="6">No calls yet.</td></tr>'}
</tbody></table></div>

<h2>Test VA numbers</h2>
<p class="note">Use these in c_va_islips_ac_dtl, the single VA screen, or as the VA leg of c_va_txn_audit_dtl rows.</p>
<div class="scroll"><table><thead><tr><th scope="col">VA number</th><th scope="col">Mock behaviour</th><th scope="col">Expected in Finacle</th></tr></thead><tbody>
${scenarios.CATALOG.map(([va, what, expected]) => `<tr><td><code>${escape(va)}</code></td><td>${escape(what)}</td><td>${escape(expected)}</td></tr>`).join('\n')}
</tbody></table></div>
<p class="note">Admin endpoints (reset, revoke tokens, force the next reply) are ${config.adminKey ? 'enabled with the X-Mock-Admin-Key header' : 'disabled until MOCK_ADMIN_KEY is set'}.</p>
</main></body></html>`;
  return send(ctx, 200, html, 'page');
}

module.exports = { render };
