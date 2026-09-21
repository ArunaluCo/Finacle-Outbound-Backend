'use strict';

const number = (value, fallback) =>
  value !== undefined && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : fallback;

module.exports = {
  port: number(process.env.PORT, 8080),
  clientId: process.env.MOCK_CLIENT_ID || 'vam-mock-client',
  clientSecret: process.env.MOCK_CLIENT_SECRET || 'vam-mock-secret',
  usingDefaultCredentials: !process.env.MOCK_CLIENT_ID || !process.env.MOCK_CLIENT_SECRET,
  adminKey: process.env.MOCK_ADMIN_KEY || '',
  tokenTtlSec: number(process.env.MOCK_TOKEN_TTL_SEC, 3600),
  slowSec: number(process.env.MOCK_SLOW_SEC, 120),
  bulkMax: number(process.env.MOCK_BULK_MAX, 500),
  // The doc 102 sample spells it realAccountCurrrency / realAccountsList; Finacle must read both
  bulkSampleSpelling: (process.env.MOCK_BULK_SAMPLE_SPELLING || 'true') === 'true',
  tlsKeyFile: process.env.MOCK_TLS_KEY || '',
  tlsCertFile: process.env.MOCK_TLS_CERT || '',
  logSize: 50,
  apiBase: '/apis/svcv3/accounts/validateAccDetails/1.0.0/vaValidate',
};
