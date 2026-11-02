// Serve the public static app under a second hostname while the original site
// remains available for existing links and browser-local recovery data.
const UPSTREAM = 'https://moodboard.petfashion.tw';
const ALLOWED_METHODS = new Set(['GET', 'HEAD']);
const FORWARDED_HEADERS = ['accept', 'if-none-match', 'if-modified-since', 'range', 'if-range'];

export async function handleRequest(request, fetchUpstream = fetch) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const incoming = new URL(request.url);
  const upstream = new URL(UPSTREAM);
  upstream.pathname = incoming.pathname;
  if (upstream.pathname === "/infinite-moodboard-update.json") {
    const checked = incoming.searchParams.get("checked");
    if (checked && /^\d{1,16}$/.test(checked)) upstream.searchParams.set("checked", checked);
  }
  // The app reads share tokens in the browser. They are not needed by static hosting.
  // Do not forward them, cookies, credentials, or other user headers to the origin.
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await fetchUpstream(upstream.href, { method: request.method, headers, redirect: 'manual' });
  const resultHeaders = new Headers(response.headers);
  const location = resultHeaders.get('location');
  if (location) {
    const destination = new URL(location, UPSTREAM);
    if (destination.origin === UPSTREAM) {
      destination.host = incoming.host;
      destination.protocol = incoming.protocol;
      resultHeaders.set('location', destination.href);
    }
  }
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: resultHeaders,
  });
}

export default { fetch(request) { return handleRequest(request); } };
