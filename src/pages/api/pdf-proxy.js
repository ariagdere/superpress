// src/pages/api/pdf-proxy.js
// R2 custom domain'de (assets.superpress.com.tr) CORS header'ı gelmiyor (bilinen bir
// Cloudflare R2 sorunu). Bu route PDF'i sunucu tarafında çekip aynı origin'den
// (bu site) geri veriyor, böylece tarayıcı için cross-origin diye bir durum kalmıyor.
export const prerender = false;

const ALLOWED_HOSTS = ['assets.superpress.com.tr'];

export async function GET({ request }) {
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get('url');
  if (!target) {
    return new Response('Eksik url parametresi', { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response('Geçersiz url', { status: 400 });
  }
  if (!ALLOWED_HOSTS.includes(targetUrl.hostname)) {
    return new Response('İzin verilmeyen kaynak', { status: 403 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get('range');
  if (range) upstreamHeaders.set('range', range);

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), { headers: upstreamHeaders });
  } catch (e) {
    return new Response('Kaynağa ulaşılamadı', { status: 502 });
  }

  const headers = new Headers(upstream.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
  headers.delete('set-cookie');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
