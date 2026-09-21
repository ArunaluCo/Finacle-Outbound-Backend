'use strict';

// Deterministic test data keyed by VA number, so no database is needed.
// Any other number starting with 8 is a normal valid VA.

const DATA = {
  '800000000001': { vaName: 'ABC TRADERS', customerName: 'ABC TRADERS PVT LTD', customerID: 'C001234', realAccountNumber: '102030405060' },
  '800000000002': { vaExpiryDate: '01-01-2025' },
  '800000000003': { vaStatus: 'D' },
  '800000000004': { realAccountCurrency: 'USD' },
  '800000000005': { creditAllowed: 'N' },
  '800000000006': { creditAllowed: '', debitAllowed: '' },
  '800000000007': { realAccountNumber: '' },
};

const ERRORS = {
  '800000000008': { code: 'ERRP000078', message: 'Virtual Account Number has been Closed.' },
  '800000000010': { code: 'ERRP000095', message: 'Invalid Customer Root VA' },
};

const NOT_FOUND = new Set(['800000000009']);
const INVALID = { code: 'ERRP000009', message: 'Invalid Virtual Account Number' };

// Any request carrying one of these VA numbers (single, bulk list, or ledger VA leg) behaves this way
const TRIGGERS = {
  '899999999901': 'timeout',
  '899999999902': 'http503',
  '899999999903': 'http500',
  '899999999904': 'badjson',
  '899999999905': 'tech998',
  '899999999906': 'http404',
  '899999999907': 'http502Once',
  '899999999911': 'batchReject',
  '899999999921': 'failOnce',
  '899999999922': 'lateSuccess',
  '899999999926': 'alwaysFail',
  '899999999927': 'postThenBadJson',
};

const CATALOG = [
  ['800000000001', 'Valid VA (ABC TRADERS, real a/c 102030405060, LKR)', 'Valid; saved in c_va_maint_dtl'],
  ['800000000002', 'Expired 01-01-2025', 'Invalid: VA_EXPIRED'],
  ['800000000003', 'Status D', 'Invalid: VA_INACTIVE'],
  ['800000000004', 'Real account in USD', 'Invalid: CCY_NOT_ALLOWED'],
  ['800000000005', 'creditAllowed N', 'Invalid: CREDIT_NOT_ALLOWED'],
  ['800000000006', 'creditAllowed and debitAllowed blank', 'Valid when VA_RULE_BLANK_FLAG_PASS = Y'],
  ['800000000007', 'No real account number', 'Invalid: NO_REAL_ACCT'],
  ['800000000008', 'Closed (ERRP000078)', 'Invalid: VAM_ERROR ERRP000078'],
  ['800000000009', 'Unknown to VAM', 'Bulk: NOT_RETURNED; single: ERRP000009'],
  ['800000000010', 'ERRP000095 Invalid Customer Root VA', 'Invalid: VAM_ERROR ERRP000095'],
  ['7xxxxxxxxxxx', 'Does not start with 8', 'Invalid: ERRP000009'],
  ['8 + anything', 'Any other 8-number', 'Valid (generated data)'],
  ['899999999901', 'No reply for MOCK_SLOW_SEC, then 504', 'TIMEOUT x retries, run stops, nothing updated'],
  ['899999999902', 'HTTP 503', 'Retried as timeout, then stops'],
  ['899999999903', 'HTTP 500', 'HARDFAIL (ledger row F)'],
  ['899999999904', 'HTTP 200 with a non-JSON body', 'Retried as timeout (outcome unknown)'],
  ['899999999905', 'context FAILURE 998 Runtime Technical Error', 'Single/bulk: failed call; ledger: row F'],
  ['899999999906', 'HTTP 404', 'STOP code: run stops (ledger row F)'],
  ['899999999907', 'HTTP 502 first time, then normal', 'Attempt 2 succeeds'],
  ['899999999911', 'Bulk request rejected, no VA details', 'Bulk batch fails, nothing updated'],
  ['899999999921', 'Ledger: fails first time per transactionID, then OK', 'Row F, succeeds after replay'],
  ['899999999922', 'Ledger: posted, reply delayed MOCK_SLOW_SEC', 'Timeout, retry gets ERRP000245, row S (reconciled)'],
  ['899999999926', 'Ledger: always ERRP000078', 'Row F'],
  ['899999999927', 'Ledger: posted, reply not JSON', 'Retry gets ERRP000245, row S (reconciled)'],
];

function baseDetail(va) {
  const tail = va.slice(-4);
  return {
    vaNumber: va, vaName: `TEST VA ${tail}`, vaAliasName: '', vaIBAN: '', parentVaNumber: '', rootVa: va.slice(0, 3),
    vaType: 'COLLECTION', customerID: `C${va.slice(-6)}`, customerName: `TEST CUSTOMER ${tail}`, payerID: '', payerName: '',
    vaExpiryDate: '31-12-2030', vaStatus: 'A', mobileNumber: '', emailId: '', transactionCurrency: 'LKR',
    intermediaryAccountNumber: '', realAccountNumber: `1${va.slice(-11).padStart(11, '0')}`, realAccountCurrency: 'LKR',
    realAccountName: `TEST CUSTOMER ${tail}`, accountCreditFlag: 'R', vaBalance: '0', availableBudgetLimit: '', guid: '',
    debitAllowed: 'N', creditAllowed: 'Y',
  };
}

/** { detail } for a known VA, { error } when VAM would reject it, { missing: true } when VAM has never heard of it. */
function lookup(vaNumber) {
  const va = String(vaNumber || '').trim();
  if (!/^8[0-9A-Za-z]{0,33}$/.test(va)) return { error: INVALID };
  if (TRIGGERS[va]) return { detail: baseDetail(va) };
  if (NOT_FOUND.has(va)) return { missing: true };
  if (ERRORS[va]) return { error: ERRORS[va] };
  return { detail: Object.assign(baseDetail(va), DATA[va] || {}) };
}

function trigger(vaNumbers) {
  for (const va of vaNumbers) {
    const mode = TRIGGERS[String(va || '').trim()];
    if (mode) return mode;
  }
  return null;
}

module.exports = { lookup, trigger, CATALOG, INVALID };
