'use strict';

const crypto = require('crypto');
const config = require('./config');

// Everything lives in memory; a restart (or POST /__mock/reset) starts clean.
const state = {
  startedAt: new Date(),
  tokens: new Map(),
  posted: new Map(),
  attempts: new Map(),
  channelRefs: new Set(),
  log: [],
  counters: {},
  override: null,
};

const base64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** A JWT-shaped token of realistic length, so the Finacle side stores a similar-size sealed value. */
function issueToken(scope, clientId) {
  const now = Math.floor(Date.now() / 1000);
  const header = { x5t: crypto.randomBytes(20).toString('base64url'), kid: 'vam-mock-key', typ: 'at+jwt', alg: 'RS256' };
  const claims = {
    sub: clientId, aut: 'APPLICATION', aud: clientId, nbf: now, azp: clientId, scope,
    iss: 'https://vam-mock/oauth2/token', exp: now + config.tokenTtlSec, iat: now,
    jti: crypto.randomUUID(), client_id: clientId,
  };
  const value = `${base64url(header)}.${base64url(claims)}.${crypto.randomBytes(256).toString('base64url')}`;
  state.tokens.set(value, (now + config.tokenTtlSec) * 1000);
  return value;
}

function tokenValid(value) {
  const expiresAt = state.tokens.get(value);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    state.tokens.delete(value);
    return false;
  }
  return true;
}

function revokeTokens() {
  const count = state.tokens.size;
  state.tokens.clear();
  return count;
}

/** 1 on the first call for a key, 2 on the second, ... (used by the "once" scenarios). */
function nextAttempt(key) {
  const attempt = (state.attempts.get(key) || 0) + 1;
  state.attempts.set(key, attempt);
  return attempt;
}

function setOverride(mode, count) {
  state.override = { mode, remaining: Math.max(1, count) };
}

function takeOverride() {
  const override = state.override;
  if (!override) return null;
  override.remaining -= 1;
  if (override.remaining <= 0) state.override = null;
  return override.mode;
}

function count(api, outcome) {
  const counter = state.counters[api] || (state.counters[api] = { calls: 0, success: 0, failure: 0, other: 0 });
  counter.calls += 1;
  counter[outcome] += 1;
}

function record(entry) {
  state.log.unshift({ at: new Date().toISOString(), ...entry });
  if (state.log.length > config.logSize) state.log.length = config.logSize;
}

function reset() {
  state.tokens.clear();
  state.posted.clear();
  state.attempts.clear();
  state.channelRefs.clear();
  state.log = [];
  state.counters = {};
  state.override = null;
}

module.exports = { state, issueToken, tokenValid, revokeTokens, nextAttempt, setOverride, takeOverride, count, record, reset };
