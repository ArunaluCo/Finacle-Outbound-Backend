'use strict';

process.env.MOCK_SLOW_SEC = '1';
process.env.MOCK_ADMIN_KEY = 'test-admin';
process.env.MOCK_CLIENT_ID = 'cid';
process.env.MOCK_CLIENT_SECRET = 'csecret';

const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../server');

const API = '/apis/svcv3/accounts/validateAccDetails/1.0.0/vaValidate';
let server;
let base;
let token;
let refCounter = 0;

const ref = () => `TEST${Date.now()}${refCounter++}`;
const post = (path, body, headers = {}, signal) => fetch(base + path, {
  method: 'POST', signal, headers: { 'Content-Type': 'application/json', RequestHeaderUUID: 'uuid', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const auth = () => ({ Authorization: `Bearer ${token}` });
const single = (va) => post(API, { context: { interfaceId: 'VAVALIDATE_E_VALIDATION', channelId: 'CBS', channelRefNumber: ref() },
  payload: { vaNumber: va, transactionCurrency: 'LKR' } }, auth());
const bulk = (vas) => post(`${API}/bulk`, { context: { interfaceId: 'VAVALIDATE_E_BULKVALIDATION', channelId: 'CBS', channelRefNumber: ref(), bankEntityId: '003' },
  payload: { vaNumbers: vas.map((vaNumber) => ({ vaNumber, transactionCurrency: 'LKR' })) } }, auth());
const txn = (id, va, legOverride) => ({
  bankEntityID: '003', txnCode: 'CUSTCREDIT', transactionID: id, transactionDate: '21-09-2026', valueDate: '21-09-2026', fxRate: '1',
  legs: legOverride || [
    { debitCreditFlg: 'D', accountNumber: '102030405061', accountName: 'REAL', accountCCY: 'LKR', amountAcntCCY: '1500.50' },
    { debitCreditFlg: 'C', accountNumber: va, accountName: 'VA', accountCCY: 'LKR', amountAcntCCY: '1500.50' },
  ],
});
const ledger = (transactions, signal) => post(`${API}/ledger`, { context: { interfaceId: 'VAACCOUNTING_P_PROCESS', channelId: 'CBS',
  channelRefNumber: ref(), bankEntityId: '003' }, payload: { batchID: 'B1', transactions } }, auth(), signal);

test.before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('status page shows the running mark', async () => {
  const res = await fetch(`${base}/`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /VAM mock is running/);
  assert.match(html, /RUNNING/);
});

test('health is UP', async () => {
  assert.equal((await (await fetch(`${base}/health`)).json()).status, 'UP');
});

test('token: wrong credentials rejected, right ones issue a bearer token', async () => {
  const form = 'grant_type=client_credentials&scope=internal';
  const bad = await fetch(`${base}/oauth2/token`, { method: 'POST', body: form,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from('cid:wrong').toString('base64')}` } });
  assert.equal(bad.status, 401);
  const good = await fetch(`${base}/oauth2/token`, { method: 'POST', body: form,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from('cid:csecret').toString('base64')}` } });
  const json = await good.json();
  assert.equal(good.status, 200);
  assert.equal(json.token_type, 'Bearer');
  assert.equal(json.scope, 'internal');
  assert.ok(json.access_token.length > 500);
  token = json.access_token;
});

test('business call without a token gets 401 900901', async () => {
  const res = await post(API, { context: {}, payload: { vaNumber: '800000000001' } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, '900901');
});

test('single: valid, closed, unknown and non-8 numbers', async () => {
  const valid = await (await single('800000000001')).json();
  assert.equal(valid.context.status, 'SUCCESS');
  assert.equal(valid.payload.realAccountNumber, '102030405060');
  assert.equal(valid.payload.VAValidationStatus, 'SUCCESS');
  const closed = await (await single('800000000008')).json();
  assert.equal(closed.context.errorCode, 'ERRP000078');
  assert.equal((await (await single('800000000009')).json()).context.errorCode, 'ERRP000009');
  assert.equal((await (await single('700000000000')).json()).context.errorCode, 'ERRP000009');
  assert.equal((await (await single('800000000002')).json()).payload.vaExpiryDate, '01-01-2025');
});

test('bulk: partial result, missing VA left out, sample spelling used', async () => {
  const json = await (await bulk(['800000000001', '800000000003', '800000000008', '800000000009'])).json();
  assert.equal(json.context.status, 'Partial');
  const items = json.payload.vaNumberDetails;
  assert.equal(items.length, 3);
  assert.equal(items.find((i) => i.vaNumber === '800000000008').errorCode, 'ERRP000078');
  assert.equal(items.find((i) => i.vaNumber === '800000000001').realAccountCurrrency, 'LKR');
  assert.equal(items.find((i) => i.vaNumber === '800000000003').vaStatus, 'D');
});

test('bulk: rejected batch has no details', async () => {
  const json = await (await bulk(['800000000001', '899999999911'])).json();
  assert.equal(json.context.status, 'Failure');
  assert.equal(json.payload.vaNumberDetails.length, 0);
});

test('ledger: success, then the same transactionID is a duplicate', async () => {
  const first = await (await ledger([txn('S1-1', '800000000001')])).json();
  assert.equal(first.context.status, 'SUCCESS');
  const again = await (await ledger([txn('S1-1', '800000000001')])).json();
  assert.equal(again.context.errorCode, 'ERRP000245');
});

test('ledger: late success is reconciled by the duplicate on retry', async () => {
  await assert.rejects(ledger([txn('S2-1', '899999999922')], AbortSignal.timeout(300)));
  const retry = await (await ledger([txn('S2-1', '899999999922')])).json();
  assert.equal(retry.context.errorCode, 'ERRP000245');
});

test('ledger: posted-then-garbage reply also reconciles on retry', async () => {
  const res = await ledger([txn('S3-1', '899999999927')]);
  assert.match(await res.text(), /not JSON/);
  assert.equal((await (await ledger([txn('S3-1', '899999999927')])).json()).context.errorCode, 'ERRP000245');
});

test('ledger: fail-once scenario succeeds on the next attempt', async () => {
  assert.equal((await (await ledger([txn('S4-1', '899999999921')])).json()).context.errorCode, 'ERRP000078');
  assert.equal((await (await ledger([txn('S4-1', '899999999921')])).json()).context.status, 'SUCCESS');
});

test('ledger: wrong leg field name and unbalanced legs are rejected', async () => {
  const typo = [{ debitCreditFlg: 'D', accountNumer: '1', amountAcntCCY: '10' }, { debitCreditFlg: 'C', accountNumer: '800000000001', amountAcntCCY: '10' }];
  assert.equal((await (await ledger([txn('S5-1', '', typo)])).json()).context.errorCode, 'ERRPMSG0007');
  const unbalanced = [{ debitCreditFlg: 'D', accountNumber: '1', amountAcntCCY: '10' }, { debitCreditFlg: 'C', accountNumber: '800000000001', amountAcntCCY: '9' }];
  assert.equal((await (await ledger([txn('S6-1', '', unbalanced)])).json()).context.errorCode, 'ERRPMSG00013');
});

test('transport scenarios: 502 once, 404, 503, bad JSON, timeout', async () => {
  assert.equal((await single('899999999907')).status, 502);
  assert.equal((await single('899999999907')).status, 200);
  assert.equal((await single('899999999906')).status, 404);
  assert.equal((await single('899999999902')).status, 503);
  const bad = await single('899999999904');
  assert.match(await bad.text(), /not JSON/);
  await assert.rejects(post(API, { context: { channelRefNumber: ref() }, payload: { vaNumber: '899999999901' } }, auth(), AbortSignal.timeout(300)));
});

test('admin: key required; revoke tokens forces 401; forced next reply', async () => {
  assert.equal((await post('/__mock/revoke-tokens', {})).status, 403);
  const admin = { 'X-Mock-Admin-Key': 'test-admin' };
  assert.equal((await post('/__mock/next', { mode: 'http503', count: 1 }, admin)).status, 200);
  assert.equal((await single('800000000001')).status, 503);
  assert.equal((await single('800000000001')).status, 200);
  assert.equal((await (await post('/__mock/revoke-tokens', {}, admin)).json()).revoked >= 1, true);
  assert.equal((await single('800000000001')).status, 401);
});

test('unknown path is a gateway-style 404', async () => {
  assert.equal((await post('/nope', {})).status, 404);
});
