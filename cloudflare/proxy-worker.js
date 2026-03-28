/**
 * Cloudflare Worker: static assets from `public` + reverse-proxy API/uploads/health to your Node server.
 * Set secret API_ORIGIN (e.g. https://sellitnow-api.onrender.com) — no trailing slash.
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

async function proxyToOrigin(request, env) {
  const origin = String(env.API_ORIGIN || '')
    .trim()
    .replace(/\/$/, '');
  if (!origin) {
    return Response.json(
      {
        error:
          'Set Workers secret API_ORIGIN to your Node app HTTPS origin (no path, no trailing slash). wrangler secret put API_ORIGIN',
      },
      { status: 503 }
    );
  }

  let upstreamHost;
  try {
    upstreamHost = new URL(origin).host;
  } catch {
    return Response.json({ error: 'Invalid API_ORIGIN' }, { status: 503 });
  }

  const url = new URL(request.url);
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

  return fetch(target, init);
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
