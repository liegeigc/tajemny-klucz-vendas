// Vercel Edge Function — proxy GitHub Releases audios with proper headers
// iOS Safari requires Content-Type audio/mpeg + no attachment disposition.
// Streams response (no 4.5MB body limit) and supports Range requests.
//
// Usage from FlowLink:  https://wybrana.online/audio/day-01.mp3

export const config = {
  runtime: 'edge',
};

const RELEASE_BASE =
  'https://github.com/liegeigc/wieczernik-audios/releases/download/v1';

export default async function handler(req) {
  const url = new URL(req.url);
  const filename = decodeURIComponent(url.pathname.split('/').pop() || '');

  if (!/^day-\d{2}\.mp3$/.test(filename)) {
    return new Response('Invalid filename', { status: 400 });
  }

  const upstreamUrl = `${RELEASE_BASE}/${filename}`;
  const fwdHeaders = {};
  const range = req.headers.get('range');
  if (range) fwdHeaders['range'] = range;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: fwdHeaders,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
  }

  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', 'audio/mpeg');
  responseHeaders.set('Accept-Ranges', 'bytes');
  responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  responseHeaders.set('Content-Disposition', `inline; filename="${filename}"`);

  const cl = upstream.headers.get('content-length');
  if (cl) responseHeaders.set('Content-Length', cl);
  const cr = upstream.headers.get('content-range');
  if (cr) responseHeaders.set('Content-Range', cr);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
