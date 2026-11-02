import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from './mcp/node_modules/ws/wrapper.mjs';
import { startLiveBridge } from './mcp/live-bridge.mjs';

test('live bridge requires its secret and exact origin and sends requests to one paired canvas', async (t) => {
  const bridge = await startLiveBridge();
  t.after(() => bridge.close());
  const rejected = new WebSocket(bridge.pairingUrl, { origin: 'https://attacker.example' });
  await new Promise((resolve) => { rejected.on('error', resolve); });
  assert.equal(bridge.connected, false);
  const wrong = new WebSocket(bridge.pairingUrl.replace(/\/[0-9a-f]+$/, '/bad'), { origin: 'https://infinite.petfashion.tw' });
  await new Promise((resolve) => { wrong.on('error', resolve); });
  const socket = new WebSocket(bridge.pairingUrl, { origin: 'https://infinite.petfashion.tw' });
  t.after(() => socket.close());
  await new Promise((resolve, reject) => { socket.on('open', resolve); socket.on('error', reject); });
  socket.on('message', (raw) => { const req = JSON.parse(String(raw)); socket.send(JSON.stringify({id:req.id, result:{boardId:'demo'}})); });
  assert.deepEqual(await bridge.request('inspect_project'), {boardId:'demo'});
});
