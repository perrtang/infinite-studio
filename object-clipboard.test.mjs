import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureBoard } from './model.js';
import { serializeObjectClipboard, parseObjectClipboard } from './object-clipboard.js';

test('object clipboard survives a text round trip with image content and groups', () => {
  const board = ensureBoard({ objects: [
    { id: 'a', type: 'image', src: 'data:image/png;base64,YQ==', groupId: 'g' },
    { id: 'b', type: 'text', text: 'Hello', groupId: 'g' },
  ], groups: [{ id: 'g', name: 'Group', memberIds: ['a', 'b'] }] });
  const parsed = parseObjectClipboard(serializeObjectClipboard(board), ensureBoard);
  assert.equal(parsed.objects[0].src, 'data:image/png;base64,YQ==');
  assert.equal(parsed.objects[1].text, 'Hello');
  assert.deepEqual(parsed.groups[0].memberIds, ['a', 'b']);
});

test('ordinary or invalid clipboard text never becomes objects', () => {
  assert.equal(parseObjectClipboard('hello', ensureBoard), null);
  assert.equal(parseObjectClipboard('INFINITE-STUDIO-OBJECTS-V1\n{"objects":[]}', ensureBoard), null);
  assert.equal(parseObjectClipboard('INFINITE-STUDIO-OBJECTS-V1\n{', ensureBoard), null);
});
