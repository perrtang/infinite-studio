import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { handleRequest } from './cloudflare/infinite-studio-gateway.js';

test('gateway serves only the fixed static origin and does not forward shared-file tokens or cookies', async () => {
  let received;
  const request = new Request('https://infinite.petfashion.tw/?driveFile=private-file', {
    headers: { cookie: 'session=private', authorization: 'Bearer private', accept: 'text/html' },
  });
  const response = await handleRequest(request, async (url, options) => {
    received = { url, options };
    return new Response('page', { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(received.url, 'https://moodboard.petfashion.tw/');
  assert.equal(received.options.headers.get('accept'), 'text/html');
  assert.equal(received.options.headers.get('cookie'), null);
  assert.equal(received.options.headers.get('authorization'), null);
  assert.equal(await response.text(), 'page');
});

test('gateway does not proxy writes or permit a URL path to select another host', async () => {
  assert.equal((await handleRequest(new Request('https://infinite.petfashion.tw/', { method: 'POST' }))).status, 405);
  let destination;
  await handleRequest(new Request('https://infinite.petfashion.tw//example.com/a'), async (url) => {
    destination = new URL(url);
    return new Response('ok');
  });
  assert.equal(destination.origin, 'https://moodboard.petfashion.tw');
});

test('gateway preserves HEAD and keeps same-origin redirects on the new hostname', async () => {
  const response = await handleRequest(new Request('https://infinite.petfashion.tw/example', { method: 'HEAD' }), async (url, options) => {
    assert.equal(options.method, 'HEAD');
    return new Response(null, { status: 301, headers: { location: 'https://moodboard.petfashion.tw/example/' } });
  });
  assert.equal(response.headers.get('location'), 'https://infinite.petfashion.tw/example/');
});


test('update checks preserve only a numeric cache-busting timestamp', async () => {
  let destination;
  await handleRequest(new Request('https://infinite.petfashion.tw/infinite-moodboard-update.json?checked=123456&driveFile=private'), async (url) => {
    destination = url;
    return new Response('{}');
  });
  assert.equal(destination, 'https://moodboard.petfashion.tw/infinite-moodboard-update.json?checked=123456');
});


test('worker handler accepts Cloudflare environment and context without using them as fetch', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('ok');
    const response = await worker.fetch(new Request('https://infinite.petfashion.tw/'), {}, {});
    assert.equal(await response.text(), 'ok');
  } finally { globalThis.fetch = original; }
});
