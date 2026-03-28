/**
 * Cloudflare Worker: static assets from `public` + reverse-proxy API/uploads/health to your Node server.
 *
 * Set env API_ORIGIN to your Express host ONLY (e.g. https://sellitnow.onrender.com).
 * Do NOT use this Workers *.workers.dev URL — that loops the proxy and fails.
 *
 * Configure: Dashboard → Worker → Settings → Variables (or `wrangler secret put API_ORIGIN`).
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function shouldProxy(pathname) {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/') ||
    pathname === '/health'
  );
}

function resolveApiOrigin(env) {
  const raw = env.API_ORIGIN || env.UPSTREAM_ORIGIN || '';
  return String(raw).trim().replace(/\/$/, '');
}

async function proxyToOrigin(request, env) {
  const origin = resolveApiOrigin(env);
  if (!origin) {
    return Response.json(
      {
        code: 'API_ORIGIN_MISSING',
        error:
          'Set variable API_ORIGIN to your Node/Express HTTPS origin (example: https://sellitnow.onrender.com). Not this workers.dev URL. Cloudflare Dashboard → Workers → your worker → Settings → Variables → Add API_ORIGIN, or run: npx wrangler secret put API_ORIGIN',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  let upstreamUrl;
  let upstreamHost;
  try {
    upstreamUrl = new URL(origin);
    if (upstreamUrl.protocol !== 'https:' && upstreamUrl.protocol !== 'http:') {
      throw new Error('bad protocol');
    }
    upstreamHost = upstreamUrl.host;
  } catch {
    return Response.json(
      { code: 'API_ORIGIN_INVALID', error: 'API_ORIGIN must be a full URL like https://api.example.com' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const url = new URL(request.url);
  if (url.host === upstreamHost) {
    return Response.json(
      {
        code: 'API_ORIGIN_LOOP',
        error:
          'API_ORIGIN points to this same host as the Worker. Use a different URL where `npm start` (Express) runs — e.g. Render, Railway, Fly.io — not *.workers.dev.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const target = origin + url.pathname + url.search;

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  headers.set('Host', upstreamHost);
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  /** @type {RequestInit} */
  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  try {
    const res = await fetch(target, init);
    return res;
  } catch (err) {
    const msg = err && err.message ? String(err.message) : 'Upstream fetch failed';
    return Response.json(
      {
        code: 'UPSTREAM_UNREACHABLE',
        error: `Cannot reach API_ORIGIN (${upstreamHost}). Is the Node server running and HTTPS reachable? ${msg}`,
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (shouldProxy(url.pathname)) {
      return proxyToOrigin(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
