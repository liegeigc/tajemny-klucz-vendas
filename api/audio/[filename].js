// Vercel Edge Function — proxy GitHub Releases audios with proper headers
// Buffers the file once, then serves with explicit Content-Length and proper
// Range support so iOS Safari plays it inline instead of treating it as a live
// stream.
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

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, { redirect: 'follow' });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Upstream error: ${upstream.status}`, {
      status: upstream.status,
    });
  }

  const buffer = await upstream.arrayBuffer();
  const totalSize = buffer.byteLength;

  const baseHeaders = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Content-Disposition': `inline; filename="${filename}"`,
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        return new Response('Requested range not satisfiable', {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${totalSize}` },
        });
      }

      const slice = buffer.slice(start, end + 1);
      return new Response(req.method === 'HEAD' ? null : slice, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Content-Length': String(slice.byteLength),
        },
      });
    }
  }

  return new Response(req.method === 'HEAD' ? null : buffer, {
    status: 200,
    headers: {
      ...baseHeaders,
      'Content-Length': String(totalSize),
    },
  });
}
