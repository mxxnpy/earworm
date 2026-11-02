// Earworm: a live "now playing" card for your GitHub profile, served by a Cloudflare Worker.
//
// GET /?theme=dark|light&recent=0..5&accent=rrggbb&cover=1  ->  image/svg+xml
// Secrets (npm run auth sets them): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN

import { render } from './render.js';

const CACHE_SECONDS = 15; // absorbs bursts of profile views without hammering the Spotify API


let token = { value: null, expiresAt: 0 };

async function accessToken(env) {
  if (token.value && Date.now() < token.expiresAt) return token.value;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
  });
  if (!response.ok) throw new Error(`token ${response.status}`);
  const data = await response.json();
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

function info(track) {
  const images = track.album?.images || [];
  return {
    track: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    cover: images.length ? images[images.length - 1].url : null, // smallest size
  };
}

const same = (a, b) => a.track === b.track && a.artist === b.artist;

function previous(history, shown, count) {
  const out = [];
  for (const item of history) {
    if (out.length === count) break;
    if (same(item, shown) || (out.length && same(item, out[out.length - 1]))) continue;
    out.push(item);
  }
  return out;
}

async function nowPlaying(env, recentCount) {
  const headers = { Authorization: `Bearer ${await accessToken(env)}` };
  const [recentRes, currentRes] = await Promise.all([
    fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', { headers }),
    fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers }),
  ]);
  if (!recentRes.ok) throw new Error(`recent ${recentRes.status}`);
  const history = ((await recentRes.json()).items || []).map((item) => info(item.track));

  // 204 means nothing is playing; podcasts and ads arrive without a music item
  if (currentRes.status === 200) {
    const data = await currentRes.json();
    if (data.is_playing && data.currently_playing_type === 'track' && data.item) {
      const now = info(data.item);
      return { isPlaying: true, ...now, recent: previous(history, now, recentCount) };
    }
  }
  if (history.length) {
    return { isPlaying: false, ...history[0], recent: previous(history.slice(1), history[0], recentCount) };
  }
  return null;
}

// Album art is inlined as a data URI: GitHub's image proxy blocks external fetches inside SVGs
async function coverDataUri(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${res.headers.get('content-type') || 'image/jpeg'};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function options(url) {
  const p = url.searchParams;
  const recent = Math.min(5, Math.max(0, parseInt(p.get('recent') ?? '3', 10) || 0));
  const accent = /^[0-9a-fA-F]{6}$/.test(p.get('accent') || '') ? p.get('accent').toLowerCase() : null;
  return { theme: p.get('theme') === 'light' ? 'light' : 'dark', recent, accent, cover: p.get('cover') === '1' };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const o = options(url);
    const cacheKey = new Request(`${url.origin}/?theme=${o.theme}&recent=${o.recent}&accent=${o.accent || ''}&cover=${o.cover ? 1 : 0}`);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return withNoStore(cached);

    let data = null;
    try {
      data = await nowPlaying(env, o.recent);
    } catch (err) {
      // Without Spotify, show the empty card instead of a broken image on the profile
      console.error('spotify', err.message);
    }
    const cover = o.cover && data && data.cover ? await coverDataUri(data.cover) : null;
    const response = new Response(render(o.theme, data, { accent: o.accent, cover }), {
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withNoStore(response);
  },
};

// GitHub's image proxy and browsers must always refetch; the short cache lives only at Cloudflare's edge
function withNoStore(response) {
  const out = new Response(response.body, response);
  out.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  return out;
}
