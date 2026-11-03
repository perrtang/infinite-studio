import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioFileStore } from './mcp/file-store.mjs';
import { BOARD_SCHEMA_VERSION, createBoard } from './model.js';

test('MCP file edits preserve groups and unknown data, and never overwrite files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mcp-'));
  const input = join(dir, 'source.moodboard');
  const output = join(dir, 'copy.studio');
  const original = createBoard({ name: 'Project', customField: { keep: true }, objects: [
    { id: 'a', type: 'text', text: 'before', groupId: 'g' },
    { id: 'b', type: 'text', text: 'other', groupId: 'g' },
  ], groups: [{id: 'g', memberIds: ['a', 'b']}] });
  await writeFile(input, JSON.stringify(original));
  const store = new StudioFileStore(input, output);
  await store.open();
  store.patchObject('a', {text: 'after'});
  const created = store.createObject({ type:'text', text:'new text', x:120, y:240 });
  await store.saveCopy();
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.objects[0].text, 'after');
  assert.equal(saved.objects.find((object) => object.id === created.id)?.text, 'new text');
  assert.deepEqual(saved.groups, original.groups);
  assert.deepEqual(saved.customField, original.customField);
  assert.deepEqual(JSON.parse(await readFile(input, 'utf8')), original);
  const again = await store.saveCopy();
  assert.notEqual(again.output, output);
  assert.equal(JSON.parse(await readFile(again.output, 'utf8')).objects[0].text, 'after');
  const secondStore = new StudioFileStore(input, output);
  await secondStore.open();
  await assert.rejects(secondStore.saveCopy(), {code: 'EEXIST'});
});

test('MCP requires explicit output, respects locks, and refuses a changed source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mcp-'));
  const input = join(dir, 'source.studio');
  const output = join(dir, 'copy.studio');
  const board = createBoard({objects: [{id:'a', type:'text', text:'one', locked:true}]});
  await writeFile(input, JSON.stringify(board));
  const readOnly = new StudioFileStore(input);
  await readOnly.open();
  assert.throws(() => readOnly.patchObject('a', {text:'two'}), /disabled/);
  const editable = new StudioFileStore(input, output);
  await editable.open();
  assert.throws(() => editable.patchObject('a', {text:'two'}), /locked/);
  await writeFile(input, JSON.stringify({...board, name:'changed'}));
  await assert.rejects(editable.saveCopy(), /source changed/);
  assert.throws(() => new StudioFileStore(input, input), /cannot be overwritten/);
});

test('legacy files without format metadata can be saved as studio without rewriting the source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mcp-legacy-'));
  const input = join(dir, 'legacy.moodboard'), output = join(dir, 'copy.studio');
  const original = JSON.stringify({objects:[{id:'a',type:'text',text:'legacy'}]});
  await writeFile(input, original);
  const store = new StudioFileStore(input, output);
  await store.open(); await store.saveCopy();
  const copy = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(copy.format, 'infinite-moodboard');
  assert.equal(copy.objects[0].text, 'legacy');
  assert.equal(await readFile(input, 'utf8'), original);
});


test('MCP upgrades an old studio copy when adding current-schema objects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mcp-schema-'));
  const input = join(dir, 'old.studio'), output = join(dir, 'copy.studio');
  const old = { ...createBoard(), schemaVersion: 15 };
  await writeFile(input, JSON.stringify(old));
  const store = new StudioFileStore(input, output);
  await store.open();
  store.createObject({ type:'shape', shapeKind:'rectangle', x:10, y:20 });
  await store.saveCopy();
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.schemaVersion, BOARD_SCHEMA_VERSION);
  assert.equal(saved.objects[0].strokeStyle, 'none');
  assert.equal(JSON.parse(await readFile(input, 'utf8')).schemaVersion, 15);
});
