// Draws the Earworm card. Shared by the Worker and by scripts/previews.mjs.

export const W = 900;
const PAD = 48;
const CHAR = 0.6;
const FONT = "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export const THEMES = {
  dark: { bg: '#0b0d17', border: '#1d2133', ink: '#e8e4d8', dim: '#8a90a8', accent: '#f1d79a' },
  light: { bg: '#f7f5ef', border: '#e2ddcf', ink: '#1c1e2a', dim: '#5f6477', accent: '#a87516' },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fit = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

function label(text, y) {
  const x1 = Math.round(PAD + text.length * 15 * (CHAR + 0.18) + 16);
  return `<text class="label" x="${PAD}" y="${y}">${esc(text)}</text>\n` +
    `<line class="rule" x1="${x1}" y1="${y - 5}" x2="${W - PAD}" y2="${y - 5}"/>`;
}

export function render(themeName, data, { accent, cover } = {}) {
  const t = { ...(THEMES[themeName] || THEMES.dark) };
  if (accent) t.accent = `#${accent}`;
  const recent = (data && data.recent) || [];
  const h = 150 + (recent.length ? 76 + 30 * recent.length : 0);
  const playing = Boolean(data && data.isPlaying);
  let state = 'NOTHING PLAYING';
  let track = 'Nothing playing right now';
  let artist = 'Spotify is quiet';
  if (data) {
    state = playing ? 'NOW PLAYING' : 'LAST PLAYED';
    ({ track, artist } = data);
  }
  const anim = playing ? 'running' : 'paused';
  const barRest = playing ? '' : '.bar { animation: none; transform: scaleY(.12); opacity: .45; }';
  const cx = PAD + 34;
  const art = cover
    ? `<clipPath id="art"><rect x="${PAD}" y="70" width="68" height="68" rx="8"/></clipPath>
<image href="${cover}" x="${PAD}" y="70" width="68" height="68" clip-path="url(#art)" preserveAspectRatio="xMidYMid slice"/>`
    : `<g class="spin">
<circle class="disc" cx="${cx}" cy="104" r="34" stroke-width="2"/>
<circle class="disc" cx="${cx}" cy="104" r="22" stroke-width="1" opacity=".5"/>
<circle class="disc" cx="${cx}" cy="104" r="6" stroke-width="1"/>
</g>`;
  const bars = Array.from({ length: 7 }, (_, i) =>
    `<rect class="bar" x="${W - PAD - 92 + i * 14}" y="84" width="8" height="40" rx="2" style="animation-delay:-${((i * 0.37) % 1).toFixed(2)}s"/>`).join('\n');
  const rows = recent.map((r, i) =>
    `<text x="${PAD}" y="${232 + i * 30}"><tspan class="idx">${String(i + 1).padStart(2, '0')}</tspan>` +
    `<tspan class="rtrack" dx="20">${esc(fit(r.track, 34))}</tspan>` +
    `<tspan class="rartist">  ${esc(fit(r.artist, 26))}</tspan></text>`).join('\n');
  const title = `${state.charAt(0)}${state.slice(1).toLowerCase()}: ${track} by ${artist}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(title)}" font-family="${FONT}">
<title>${esc(title)}</title>
<style>
text { white-space: pre; }
.label { fill: ${t.dim}; font-size: 15px; letter-spacing: .18em; }
.rule { stroke: ${t.border}; }
.track { fill: ${t.ink}; font-size: 24px; font-weight: 700; }
.artist { fill: ${t.dim}; font-size: 19px; }
.idx { fill: ${t.dim}; font-size: 15px; }
.rtrack { fill: ${t.ink}; font-size: 19px; }
.rartist { fill: ${t.dim}; font-size: 19px; }
.disc { fill: none; stroke: ${t.accent}; }
.spin { transform-origin: ${cx}px 104px; animation: spin 3.2s linear infinite; animation-play-state: ${anim}; }
.bar { fill: ${t.accent}; transform-box: fill-box; transform-origin: bottom; animation: eq 1s ease-in-out infinite; animation-play-state: ${anim}; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes eq { 0%, 100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
${barRest}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="16" fill="${t.bg}" stroke="${t.border}"/>
${label(state, 56)}
${art}
<text class="track" x="${PAD + 96}" y="100">${esc(fit(track, 40))}</text>
<text class="artist" x="${PAD + 96}" y="128">${esc(fit(artist, 52))}</text>
${bars}
${recent.length ? label('BEFORE THAT', 190) + '\n' + rows : ''}
</svg>`;
}
