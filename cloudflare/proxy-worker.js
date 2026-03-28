/**
 * Cloudflare Worker: static assets from `public` + reverse-proxy API/uploads/health to your Node server.
 * Bindings: env.ASSETS (assets), env.API_ORIGIN or env.UPSTREAM_ORIGIN (Express HTTPS origin, dashboard/secret).
 * Forwards CF-Connecting-IP as X-Forwarded-For / X-Real-IP for rate limits on the origin.
 *
 * Do not set API_ORIGIN to this Worker’s *.workers.dev host (proxy loop).
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
  const raw = env.API_ORIGIN || env.UPSTREAM_ORIGIN || env.SELLITNOW_API || '';
  return String(raw).trim().replace(/\/$/, '');
}

function jsonError(code, message, status) {
  return Response.json(
    { code, error: message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Sellitnow-Proxy-Error': code,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-Sellitnow-Proxy-Error, X-Sellitnow-Upstream-Status',
      },
    }
  );
}

async function proxyToOrigin(request, env) {
  const origin = resolveApiOrigin(env);
  if (!origin) {
    return jsonError(
      'API_ORIGIN_MISSING',
      'Worker has no API_ORIGIN. In Cloudflare: Workers → sellitnow → Settings → Variables → add API_ORIGIN = your Express URL (e.g. https://xxx.onrender.com). Open GET /cf-worker-ping on this host to verify.',
      503
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
    return jsonError(
      'API_ORIGIN_INVALID',
      'API_ORIGIN must be a full URL like https://api.example.com (no path, trim trailing slash).',
      503
    );
  }

  const url = new URL(request.url);
  if (url.host === upstreamHost) {
    return jsonError(
      'API_ORIGIN_LOOP',
      'API_ORIGIN must be your Node server (Render/Railway/Fly), not this *.workers.dev URL.',
      503
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

  const cfConnecting = request.headers.get('cf-connecting-ip');
  const trueClient = request.headers.get('true-client-ip');
  const xffFirst = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const clientIp = cfConnecting || trueClient || xffFirst;
  if (clientIp) {
    headers.set('X-Forwarded-For', clientIp);
    headers.set('X-Real-IP', clientIp);
  }

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
    if (res.status >= 500) {
      const headers = new Headers(res.headers);
      headers.set('X-Sellitnow-Upstream-Status', String(res.status));
      headers.set('Access-Control-Expose-Headers', 'X-Sellitnow-Upstream-Status');
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }
    return res;
  } catch (err) {
    const msg = err && err.message ? String(err.message) : 'Upstream fetch failed';
    return jsonError(
      'UPSTREAM_UNREACHABLE',
      `Cannot reach API_ORIGIN (${upstreamHost}). Open that URL + /health in a browser. ${msg}`,
      502
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/cf-worker-ping') {
      const origin = resolveApiOrigin(env);
      return Response.json(
        {
          worker: true,
          api_origin_configured: Boolean(origin),
          hint: origin
            ? 'Proxy is configured. If /api still returns 503, open Response headers for X-Sellitnow-Upstream-Status or hit API_ORIGIN/health directly.'
            : 'Add API_ORIGIN (HTTPS origin of npm start / Express only).',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (shouldProxy(url.pathname)) {
      return proxyToOrigin(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
