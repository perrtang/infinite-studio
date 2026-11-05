import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecentFiles, recordRecentFile } from './recent-files.js';

function storage() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; }
test('recent files keep successful opens in recency order and deduplicate by source and identity', () => {
  const s = storage();
  recordRecentFile(s, { kind: 'local', id: 'one', name: 'A' }, new Date('2026-11-01T00:00:00Z'));
  recordRecentFile(s, { kind: 'drive', id: 'file-123456789', name: 'B', resourceKey: 'resource' }, new Date('2026-11-02T00:00:00Z'));
  recordRecentFile(s, { kind: 'local', id: 'one', name: 'Renamed' }, new Date('2026-11-03T00:00:00Z'));
  assert.deepEqual(readRecentFiles(s).map(x => [x.kind, x.id, x.name]), [['local', 'one', 'Renamed'], ['drive', 'file-123456789', 'B']]);
  assert.equal(readRecentFiles(s)[1].resourceKey, 'resource');
});
test('recent history is bounded and storage errors do not block opening', () => {
  const s = storage();
  for (let i = 0; i < 25; i++) recordRecentFile(s, { kind: 'local', id: String(i) });
  assert.equal(readRecentFiles(s).length, 20);
  assert.doesNotThrow(() => recordRecentFile({ getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } }, { kind: 'local', id: '1' }));
});
