import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_SCHEMA_VERSION, ensureBoard, createObjectDuplicate } from './model.js';
import { objectStroke, strokeDashArray } from './object-stroke.js';
import { objectExportArtifact } from './asset-export.js';
import { createPortableHtml } from './portable.js';

test('old colorable objects remain unframed; stroke properties survive file and duplicate', () => {
  assert.ok(BOARD_SCHEMA_VERSION > 15, 'older clients must reject documents with stroke properties');
  const board = ensureBoard({ objects: [{ id:'t', type:'text' }, { id:'s', type:'shape' }, { id:'p', type:'artboard' }] });
  for (const object of board.objects) assert.equal(objectStroke(object).style, 'none');
  const original = { ...board.objects[1], strokeStyle:'dashed', strokeWidth:4, strokeColor:'#c03422' };
  const loaded = ensureBoard({ objects:[original] }).objects[0];
  assert.deepEqual(objectStroke(loaded), { enabled:true, style:'dashed', width:4, color:'#c03422' });
  assert.equal(createObjectDuplicate(loaded).strokeColor, '#c03422');
  assert.deepEqual(strokeDashArray(objectStroke(loaded)), [16, 8]);
});

test('individual SVG output preserves geometry, line style and text/paper frames', async () => {
  const board = ensureBoard({objects:[{type:'shape',shapeKind:'triangle',strokeStyle:'dotted',strokeWidth:3,strokeColor:'#123456'}, {type:'text',strokeStyle:'solid',strokeWidth:2,strokeColor:'#123456'}, {type:'artboard',strokeStyle:'dashed',strokeWidth:3,strokeColor:'#123456'}]});
  const [shape,text,paper] = await Promise.all(board.objects.map(async o => (await objectExportArtifact(o).blob.text())));
  assert.match(shape, /<polygon[^>]*stroke="#123456"[^>]*stroke-dasharray="3 6"/);
  assert.match(text, /outline:2px solid #123456/);
  assert.match(paper, /stroke="#123456"[^>]*stroke-dasharray="12 6"/);
  const portable = createPortableHtml(board);
  assert.match(portable, /"stroke":\{"style":"dotted","width":3,"color":"#123456","enabled":true\}/);
});
