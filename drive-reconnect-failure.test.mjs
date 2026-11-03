import assert from 'node:assert/strict';
import test from 'node:test';
import { driveReconnectFailure } from './drive-state.js';

test('Drive reconnection distinguishes expired authorization from an unavailable service', () => {
  const expired = driveReconnectFailure({ code: 'authorization_required' });
  assert.equal(expired.status, 'authorization-required');
  assert.match(expired.message, /重新連結/);
  const unavailable = driveReconnectFailure({ code: 'unavailable', status: 503 });
  assert.equal(unavailable.status, 'error');
  assert.match(unavailable.message, /稍後重試/);
  assert.doesNotMatch(unavailable.message, /重新連結/);
  const offline = driveReconnectFailure({ code: 'drive/offline' });
  assert.equal(offline.status, 'offline');
  assert.match(offline.message, /離線/);
  for (const result of [expired, unavailable, offline]) {
    assert.equal(result.connected, false);
    assert.equal(result.busy, false);
  }
});
