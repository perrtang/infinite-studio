import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';

// Loopback-only, explicitly paired, single-client bridge. It never hosts the MCP protocol over HTTP.
export async function startLiveBridge({ origin = 'https://infinite.petfashion.tw' } = {}) {
  const token = randomBytes(32).toString('hex');
  const pending = new Map();
  let peer;
  const http = createServer((_req, res) => { res.writeHead(404); res.end(); });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  http.on('upgrade', (req, socket, head) => {
    const host = req.headers.host;
    const supplied = (req.url || '').slice(1);
    const a = Buffer.from(supplied); const b = Buffer.from(token);
    const valid = host === `127.0.0.1:${http.address().port}` && req.headers.origin === origin
      && a.length === b.length && timingSafeEqual(a, b) && !peer;
    if (!valid) { socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws));
  });
  sockets.on('connection', (ws) => {
    peer = ws;
    ws.on('message', (data) => {
      let response;
      try { response = JSON.parse(String(data)); } catch { ws.close(1003); return; }
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id); clearTimeout(request.timer);
      if (response.error) request.reject(new Error(String(response.error))); else request.resolve(response.result);
    });
    ws.on('close', () => {
      peer = null;
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('The canvas disconnected.')); }
      pending.clear();
    });
    ws.on('error', () => ws.close());
  });
  await new Promise((resolve, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', resolve); });
  return {
    pairingUrl: `ws://127.0.0.1:${http.address().port}/${token}`,
    get connected() { return Boolean(peer && peer.readyState === 1); },
    request(method, params = {}) {
      if (!peer || peer.readyState !== 1) throw new Error('The canvas is not paired.');
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Canvas request timed out.')); }, 120000);
        pending.set(id, { resolve, reject, timer });
        peer.send(JSON.stringify({ id, method, params }), (error) => { if (error && pending.has(id)) { clearTimeout(timer); pending.delete(id); reject(error); } });
      });
    },
    close() { peer?.close(); sockets.close(); http.close(); },
  };
}
