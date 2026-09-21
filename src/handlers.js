'use strict';

const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const scenarios = require('./scenarios');
const { send, delay } = require('./reply');

const NOT_JSON = '<html><body>Mock gateway page - this is not JSON</body></html>';
const UNAUTHORIZED = {
  code: '900901',
  message: 'Invalid Credentials',
  description: 'Invalid JWT token. Make sure you have provided the correct security credentials',
};
const ADMIN_MODES = ['timeout', 'http502', 'http503', 'http504', 'http500', 'http404', 'badjson', 'tech998'];

const sameSecret = (given, expected) => {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function parseJson(ctx) {
  try {
    return JSON.parse(ctx.body);
  } catch (error) {
    return null;
  }
}

function authorized(ctx) {
  const header = ctx.req.headers.authorization || '';
  return header.startsWith('Bearer ') && store.tokenValid(header.slice(7).trim());
}

/** Contract checks that do not change the reply but show up on the status page and in X-Mock-Warnings. */
function checkContext(ctx, context, interfaceId) {
  ctx.entry.ref = context.channelRefNumber || '-';
  if (context.interfaceId !== interfaceId) ctx.warnings.push(`interfaceId should be ${interfaceId}`);
  if (!context.channelId) ctx.warnings.push('channelId missing');
  const ref = String(context.channelRefNumber || '');
  if (!ref) ctx.warnings.push('channelRefNumber missing');
  if (ref.length > 35) ctx.warnings.push('channelRefNumber longer than 35');
  if (ref && store.state.channelRefs.has(ref)) ctx.warnings.push('channelRefNumber reused');
  if (ref) store.state.channelRefs.add(ref);
  if (!ctx.req.headers.requestheaderuuid) ctx.warnings.push('RequestHeaderUUID header missing');
}

/** Transport-level misbehaviour shared by all three APIs. Returns true when it has replied. */
async function transport(ctx, mode) {
  switch (mode) {
    case 'timeout':
      await delay(config.slowSec);
      send(ctx, 504, { code: '504', message: `Mock: no reply for ${config.slowSec}s` }, 'timeout scenario', 'other');
      return true;
    case 'http502':
    case 'http503':
    case 'http504':
    case 'http500':
      send(ctx, Number(mode.slice(4)), { code: mode.slice(4), message: `Mock HTTP ${mode.slice(4)}` }, mode, 'other');
      return true;
    case 'http404':
      send(ctx, 404, { code: '404', type: 'Status report', message: 'Not Found', description: 'The requested resource is not available.' }, 'http404', 'other');
      return true;
    case 'badjson':
      send(ctx, 200, NOT_JSON, 'non-JSON body', 'other');
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- token

function token(ctx) {
  ctx.entry.api = 'TOKEN';
  const header = ctx.req.headers.authorization || '';
  const decoded = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const separator = decoded.indexOf(':');
  const id = separator > 0 ? decoded.slice(0, separator) : '';
  const secret = separator > 0 ? decoded.slice(separator + 1) : '';
  if (!sameSecret(id, config.clientId) || !sameSecret(secret, config.clientSecret)) {
    return send(ctx, 401, { error: 'invalid_client', error_description: 'Client Authentication failed.' }, 'bad client credentials', 'failure');
  }
  const form = new URLSearchParams(ctx.body);
  if (form.get('grant_type') !== 'client_credentials') {
    return send(ctx, 400, { error: 'unsupported_grant_type', error_description: 'Only client_credentials is supported' }, 'bad grant_type', 'failure');
  }
  const scope = form.get('scope') || ctx.url.searchParams.get('scope') || 'default';
  const value = store.issueToken(scope, id);
  return send(ctx, 200, { access_token: value, scope, token_type: 'Bearer', expires_in: config.tokenTtlSec },
    `token issued, expires_in ${config.tokenTtlSec}s`, 'success');
}

// ---------------------------------------------------------------- single (doc 24)

function singlePayload(detail, requestCurrency, error) {
  const d = detail || {};
  return {
    vaName: d.vaName || '', depositorCharges: '', vaStatus: d.vaStatus || '', mobileNumber: d.mobileNumber || '',
    realAccountBalance: '', emailId: d.emailId || '', ledgerChkFlag: '', tinRequired: '', realAccountName: d.realAccountName || '',
    vaNumber: d.vaNumber || '', realAccountsList: d.realAccountNumber ? [{ transactionCurrency: requestCurrency || 'LKR',
      realAccountNumber: d.realAccountNumber, realAccountCurrency: d.realAccountCurrency, realAccountName: d.realAccountName, defaultFlag: 'Y' }] : [],
    payerName: d.payerName || '', accountCreditFlag: d.accountCreditFlag || '', vaAliasName: d.vaAliasName || '',
    creditAllowed: d.creditAllowed === undefined ? '' : d.creditAllowed, realAccountCurrency: d.realAccountCurrency || '',
    vaType: d.vaType || '', debitAllowed: d.debitAllowed === undefined ? '' : d.debitAllowed, vaExpiryDate: d.vaExpiryDate || '',
    transactionCurrency: requestCurrency || '', collectionAmount: '', vaIBAN: d.vaIBAN || '', realAccountNumber: d.realAccountNumber || '',
    payerID: d.payerID || '', parentVaNumber: d.parentVaNumber || '', VAValidationError: error ? error.message : '',
    VAValidationStatus: error ? 'FAILURE' : 'SUCCESS', customerName: d.customerName || '', vaBalance: d.vaBalance || '',
    budgetChkFlag: '', availableBudgetLimit: d.availableBudgetLimit || '', rootVa: d.rootVa || '', customerID: d.customerID || '',
    guid: d.guid || '',
  };
}

function singleContext(context, status, code, message) {
  return {
    channelRefNumber: context.channelRefNumber || '', errorMessage: message, errorCode: code, bankEntityId: '003',
    interfaceId: 'VAVALIDATE_E_VALIDATION', channelId: context.channelId || '', status,
  };
}

async function single(ctx) {
  ctx.entry.api = 'SINGLE';
  if (!authorized(ctx)) return send(ctx, 401, UNAUTHORIZED, 'missing/expired token', 'failure');
  const request = parseJson(ctx);
  if (!request) return send(ctx, 400, { code: '400', message: 'Mock: request body is not JSON' }, 'bad request', 'failure');
  const context = request.context || {};
  const payload = request.payload || {};
  checkContext(ctx, context, 'VAVALIDATE_E_VALIDATION');
  const va = String(payload.vaNumber || '').trim();
  let mode = store.takeOverride() || scenarios.trigger([va]);
  if (mode === 'http502Once') mode = store.nextAttempt(`S:${va}`) === 1 ? 'http502' : null;
  if (await transport(ctx, mode)) return undefined;
  if (mode === 'tech998') {
    const error = { code: '998', message: 'Runtime Technical Error' };
    return send(ctx, 200, { payload: singlePayload({ vaNumber: va }, payload.transactionCurrency, error),
      context: singleContext(context, 'FAILURE', error.code, error.message) }, `VA ${va} 998`, 'failure');
  }
  const found = scenarios.lookup(va);
  if (found.error || found.missing) {
    const error = found.error || scenarios.INVALID;
    return send(ctx, 200, { payload: singlePayload({ vaNumber: va }, payload.transactionCurrency, error),
      context: singleContext(context, 'FAILURE', error.code, error.message) }, `VA ${va} ${error.code}`, 'failure');
  }
  return send(ctx, 200, { payload: singlePayload(found.detail, payload.transactionCurrency, null),
    context: singleContext(context, 'SUCCESS', '', '') }, `VA ${va} valid`, 'success');
}

// ---------------------------------------------------------------- bulk (doc 102)

function bulkItem(detail) {
  const currencyKey = config.bulkSampleSpelling ? 'realAccountCurrrency' : 'realAccountCurrency';
  const listKey = config.bulkSampleSpelling ? 'realAccountsList' : 'realAccountList';
  return {
    vaNumber: detail.vaNumber, vaName: detail.vaName, vaAliasName: detail.vaAliasName, vaIBAN: detail.vaIBAN,
    parentVaNumber: detail.parentVaNumber, rootVa: detail.rootVa, vaType: detail.vaType, customerID: detail.customerID,
    customerName: detail.customerName, payerID: detail.payerID, payerName: detail.payerName, vaExpiryDate: detail.vaExpiryDate,
    vaStatus: detail.vaStatus, mobileNumber: detail.mobileNumber, emailId: detail.emailId, transactionCurrency: detail.transactionCurrency,
    intermediaryAccountNumber: detail.intermediaryAccountNumber, realAccountNumber: detail.realAccountNumber,
    [currencyKey]: detail.realAccountCurrency, realAccountName: detail.realAccountName, accountCreditFlag: detail.accountCreditFlag,
    vaBalance: 1000, availableBudgetLimit: detail.availableBudgetLimit, guid: detail.guid, debitAllowed: detail.debitAllowed,
    creditAllowed: detail.creditAllowed, errorCode: '', errorMessage: '', status: 'SUCCESS',
    [listKey]: detail.realAccountNumber ? [{ transactionCurrency: 'LKR', realAccountNumber: detail.realAccountNumber,
      realAccountCurrency: detail.realAccountCurrency, realAccountName: detail.realAccountName, defaultFlag: 'Y' }] : [],
  };
}

function bulkBody(context, status, code, message, items) {
  return {
    context: { interfaceId: 'VAVALIDATE_E_BULKVALIDATION', channelId: context.channelId || '', channelRefNumber: context.channelRefNumber || '',
      bankEntityId: '003', status, errorCode: code, errorMessage: message },
    payload: { vaNumberDetails: items },
  };
}

async function bulk(ctx) {
  ctx.entry.api = 'BULK';
  if (!authorized(ctx)) return send(ctx, 401, UNAUTHORIZED, 'missing/expired token', 'failure');
  const request = parseJson(ctx);
  if (!request) return send(ctx, 400, { code: '400', message: 'Mock: request body is not JSON' }, 'bad request', 'failure');
  const context = request.context || {};
  checkContext(ctx, context, 'VAVALIDATE_E_BULKVALIDATION');
  if (context.bankEntityId !== '003') ctx.warnings.push('bankEntityId should be 003');
  const list = request.payload && Array.isArray(request.payload.vaNumbers) ? request.payload.vaNumbers : [];
  const vaNumbers = list.map((entry) => String((entry && entry.vaNumber) || '').trim());
  if (vaNumbers.length > config.bulkMax) {
    return send(ctx, 200, bulkBody(context, 'Failure', 'MOCK_LIMIT', `Mock: more than ${config.bulkMax} VA numbers in one request`, []),
      `${vaNumbers.length} VAs > limit`, 'failure');
  }
  let mode = store.takeOverride() || scenarios.trigger(vaNumbers);
  if (mode === 'http502Once') mode = store.nextAttempt(`B:${vaNumbers.join(',')}`) === 1 ? 'http502' : null;
  if (await transport(ctx, mode)) return undefined;
  if (mode === 'tech998') {
    return send(ctx, 200, bulkBody(context, 'Failure', '998', 'Runtime Technical Error', []), 'bulk 998', 'failure');
  }
  if (mode === 'batchReject') {
    return send(ctx, 200, bulkBody(context, 'Failure', 'ERRP000068', 'Authorization Failed', []), 'bulk rejected', 'failure');
  }
  const items = [];
  let valid = 0;
  let rejected = 0;
  for (const va of vaNumbers) {
    const found = scenarios.lookup(va);
    if (found.missing) continue;
    if (found.error) {
      rejected += 1;
      items.push({ vaNumber: va, errorCode: found.error.code, errorMessage: found.error.message, status: 'FAILURE' });
    } else {
      valid += 1;
      items.push(bulkItem(found.detail));
    }
  }
  const status = rejected === 0 ? 'Success' : valid === 0 ? 'Failure' : 'Partial';
  return send(ctx, 200, bulkBody(context, status, '', '', items),
    `${vaNumbers.length} VAs: ${valid} ok, ${rejected} rejected, ${vaNumbers.length - valid - rejected} not returned`, 'success');
}

// ---------------------------------------------------------------- ledger (doc 77)

function ledgerBody(context, status, code, message) {
  return {
    context: { interfaceId: 'VAACCOUNTING_P_PROCESS', channelId: context.channelId || 'CBS', channelRefNumber: context.channelRefNumber || '',
      status, errorCode: code, errorMessage: message },
    payload: {},
  };
}

const vaLegOf = (txn) => (Array.isArray(txn.legs) ? txn.legs : []).find((leg) => /^8/.test(String(leg.accountNumber || '')));

/** Validates every transaction, then posts all of them - or none (doc 77 answers with one context status). */
function postAll(transactions, batchId) {
  for (const txn of transactions) {
    const id = String(txn.transactionID || '').trim();
    const legs = Array.isArray(txn.legs) ? txn.legs : [];
    if (!id) return { code: 'MOCK_NO_TXN_ID', message: 'Mock: transactionID missing' };
    if (legs.some((leg) => !String(leg.accountNumber || '').trim())) return { code: 'ERRPMSG0007', message: 'AccountNumber is not valid' };
    const vaLeg = vaLegOf(txn);
    if (!vaLeg) return { code: 'ERRPMSG00012', message: 'At least One leg should Have Valid VA' };
    const cents = (flag) => legs.filter((leg) => leg.debitCreditFlg === flag)
      .reduce((sum, leg) => sum + Math.round(Number(leg.amountAcntCCY || 0) * 100), 0);
    if (cents('D') === 0 || cents('D') !== cents('C')) return { code: 'ERRPMSG00013', message: 'Both Debit And Credit Amount Should Match' };
    const found = scenarios.lookup(vaLeg.accountNumber);
    if (found.error || found.missing) return found.error || scenarios.INVALID;
    if (store.state.posted.has(id)) return { code: 'ERRP000245', message: 'VA Transaction is Duplicated, Record Already Exist' };
  }
  for (const txn of transactions) {
    store.state.posted.set(String(txn.transactionID).trim(), { batchId, at: new Date().toISOString() });
  }
  return null;
}

async function ledger(ctx) {
  ctx.entry.api = 'LEDGER';
  if (!authorized(ctx)) return send(ctx, 401, UNAUTHORIZED, 'missing/expired token', 'failure');
  const request = parseJson(ctx);
  if (!request) return send(ctx, 400, { code: '400', message: 'Mock: request body is not JSON' }, 'bad request', 'failure');
  const context = request.context || {};
  const payload = request.payload || {};
  checkContext(ctx, context, 'VAACCOUNTING_P_PROCESS');
  if (context.channelId !== 'CBS') ctx.warnings.push('channelId should be CBS');
  if (context.bankEntityId !== '003') ctx.warnings.push('bankEntityId should be 003');
  if (!payload.batchID) ctx.warnings.push('batchID missing');
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  const ids = transactions.map((txn) => txn.transactionID).join(',');
  const fail = (error) => send(ctx, 200, ledgerBody(context, 'FAILURE', error.code, error.message), `${ids} ${error.code}`, 'failure');
  if (!transactions.length) return fail({ code: 'MOCK_NO_TXN', message: 'Mock: no transactions in payload' });

  let mode = store.takeOverride() || scenarios.trigger(transactions.map((txn) => (vaLegOf(txn) || {}).accountNumber));
  if (mode === 'http502Once') mode = store.nextAttempt(`L:${ids}`) === 1 ? 'http502' : null;
  if (mode === 'lateSuccess' || mode === 'postThenBadJson') {
    // VAM posts, then the reply is lost; the retry must see ERRP000245 and reconcile to S
    const error = postAll(transactions, payload.batchID);
    if (error) return fail(error);
    if (mode === 'postThenBadJson') return send(ctx, 200, NOT_JSON, `${ids} posted, reply not JSON`, 'other');
    await delay(config.slowSec);
    return send(ctx, 200, ledgerBody(context, 'SUCCESS', '000', 'Success'), `${ids} posted, reply after ${config.slowSec}s`, 'success');
  }
  if (await transport(ctx, mode)) return undefined;
  if (mode === 'tech998') return fail({ code: '998', message: 'Runtime Technical Error' });
  if (mode === 'alwaysFail') return fail({ code: 'ERRP000078', message: 'Virtual Account Number has been Closed.' });
  if (mode === 'failOnce' && store.nextAttempt(`F:${ids}`) === 1) {
    return fail({ code: 'ERRP000078', message: 'Virtual Account Number has been Closed.' });
  }
  const error = postAll(transactions, payload.batchID);
  if (error) return fail(error);
  return send(ctx, 200, ledgerBody(context, 'SUCCESS', '000', 'Success'), `${ids} posted`, 'success');
}

// ---------------------------------------------------------------- admin, health, not found

function admin(ctx) {
  ctx.entry.api = 'ADMIN';
  if (!config.adminKey) return send(ctx, 403, { message: 'Admin endpoints are disabled - set MOCK_ADMIN_KEY' }, 'disabled', 'failure');
  if (!sameSecret(ctx.req.headers['x-mock-admin-key'] || '', config.adminKey)) {
    return send(ctx, 403, { message: 'Wrong or missing X-Mock-Admin-Key' }, 'denied', 'failure');
  }
  const route = `${ctx.req.method} ${ctx.path}`;
  if (route === 'POST /__mock/reset') {
    store.reset();
    return send(ctx, 200, { reset: true }, 'state reset', 'success');
  }
  if (route === 'POST /__mock/revoke-tokens') {
    return send(ctx, 200, { revoked: store.revokeTokens() }, 'tokens revoked', 'success');
  }
  if (route === 'POST /__mock/next') {
    const request = parseJson(ctx) || {};
    if (!ADMIN_MODES.includes(request.mode)) {
      return send(ctx, 400, { message: `mode must be one of ${ADMIN_MODES.join(', ')}` }, 'bad mode', 'failure');
    }
    const count = Number(request.count) > 0 ? Number(request.count) : 1;
    store.setOverride(request.mode, count);
    return send(ctx, 200, { mode: request.mode, count }, `next ${count} call(s): ${request.mode}`, 'success');
  }
  if (route === 'GET /__mock/log') {
    return send(ctx, 200, { log: store.state.log }, 'log read', 'success');
  }
  return send(ctx, 404, { message: 'Unknown admin route' }, 'unknown admin route', 'failure');
}

function health(ctx) {
  ctx.entry.api = 'HEALTH';
  return send(ctx, 200, { status: 'UP', uptimeSec: Math.round((Date.now() - store.state.startedAt) / 1000) }, 'health');
}

function notFound(ctx) {
  ctx.entry.api = 'OTHER';
  return send(ctx, 404, { code: '404', type: 'Status report', message: 'Not Found', description: 'The requested resource is not available.' },
    'unknown path', 'other');
}

module.exports = { token, single, bulk, ledger, admin, health, notFound };
