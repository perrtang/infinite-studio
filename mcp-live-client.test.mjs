import test from 'node:test';
import assert from 'node:assert/strict';
import { connectCanvasAgent, validateCanvasPairingUrl } from './mcp-live-client.js';
import { translateInterfaceText } from './i18n.js';

const url = `ws://127.0.0.1:12345/${'a'.repeat(64)}`;
class FakeSocket {
  constructor(address) { this.address = address; this.readyState = 1; this.sent = []; }
  send(value) { this.sent.push(JSON.parse(value)); }
}
test('AI pairing and approval controls are available in English and Simplified Chinese', () => {
  assert.equal(translateInterfaceText('AI 連線', 'en'), 'AI connection');
  assert.equal(translateInterfaceText('AI 請求新增物件', 'en'), 'AI requests a new object');
  assert.equal(translateInterfaceText('AI 連線', 'zh-Hans'), 'AI 连接');
});
test('canvas agent accepts only a loopback pairing address with a random token', () => {
  assert.equal(validateCanvasPairingUrl(url), url);
  for (const bad of ['ws://example.com:1234/' + 'a'.repeat(64), 'ws://127.0.0.1:1234/x', url + '?extra=1']) assert.throws(() => validateCanvasPairingUrl(bad));
});

test('canvas agent requires approval and refuses stale, invalid, or read-only edits', async () => {
  let board = {id:'b', revision:2, objects:[{id:'o',type:'text',text:'old'}], groups:[]};
  let approve = true; let edits = 0; let readOnly = false;
  const socket = connectCanvasAgent(url, {getBoard:()=>board, isReadOnly:()=>readOnly, approveEdit:async()=>approve, applyEdit:()=>{edits++; return {ok:true}}, onStatus:()=>{}}, FakeSocket);
  const send = (params) => socket.onmessage({data:JSON.stringify({id:'00000000-0000-0000-0000-000000000001',method:'edit_object',params})});
  await send({id:'o',patch:{text:'new'}}); assert.equal(edits,1);
  approve=false; await send({id:'o',patch:{text:'new'}}); assert.match(socket.sent.at(-1).error,/沒有核准/);
  approve=true; readOnly=true; await send({id:'o',patch:{text:'new'}}); assert.match(socket.sent.at(-1).error,/編輯權限/);
  readOnly=false; await send({id:'o',patch:{width:'bad'}}); assert.match(socket.sent.at(-1).error,/不支援/);
  board={...board,id:'other'}; await send({id:'o',patch:{text:'new'}}); assert.match(socket.sent.at(-1).error,/已切換/);
});

test('creating an object requires approval and rejects invalid shapes', async () => {
  const board = {id:'b', revision:0, objects:[], groups:[]};
  let approved = false; let created = 0;
  const socket = connectCanvasAgent(url, {getBoard:()=>board, isReadOnly:()=>false, approveEdit:async()=>approved, applyEdit:()=>{}, applyCreate:()=>{created++; return {id:'new'}}, onStatus:()=>{}}, FakeSocket);
  const send = (params) => socket.onmessage({data:JSON.stringify({id:'00000000-0000-0000-0000-000000000002',method:'create_object',params})});
  await send({type:'text',text:'Hello',x:1,y:2}); assert.equal(created,0);
  approved=true; await send({type:'text',text:'Hello',x:1,y:2}); assert.equal(created,1);
  await send({type:'shape',shapeKind:'unknown',x:1,y:2}); assert.equal(created,1);
});
