#!/usr/bin/env node
// Authorizes Earworm to read your Spotify and stores the credentials as Worker secrets.
// Run once, after `npx wrangler login`:  npm run auth
// Nothing is printed or written to disk: values go straight to `wrangler secret put` through stdin.

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';

const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'user-read-currently-playing user-read-recently-played';

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Do not echo what is typed or pasted
      rl._writeToOutput = (s) => { if (s.startsWith(question)) rl.output.write(s); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

function waitForCode(state) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const ok = url.searchParams.get('state') === state && url.searchParams.has('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<p style="font-family:monospace">${ok ? 'Done, you can close this tab.' : 'Authorization failed, check the terminal.'}</p>`);
      server.close();
      ok ? resolve(url.searchParams.get('code'))
        : reject(new Error(url.searchParams.get('error') || 'state mismatch'));
    });
    server.listen(8888, '127.0.0.1');
  });
}

async function exchange(code, clientId, clientSecret) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = {
      invalid_client: 'Client ID or Client Secret is wrong. Copy them again from the Spotify dashboard.',
      invalid_grant: 'The code expired, or the Redirect URI in your Spotify app is not exactly ' + REDIRECT_URI,
    }[body.error] || '';
    throw new Error(`Spotify refused the code: ${body.error_description || body.error || res.status}. ${hint}`);
  }
  return body.refresh_token;
}

function putSecret(name, value) {
  const run = spawnSync('npx', ['wrangler', 'secret', 'put', name], {
    input: value, stdio: ['pipe', 'ignore', 'inherit'], shell: process.platform === 'win32',
  });
  if (run.status !== 0) throw new Error(`wrangler secret put ${name} failed`);
  console.log(`  ✓ ${name}`);
}

async function main() {
  const clientId = await ask('Spotify Client ID: ');
  const clientSecret = await ask('Spotify Client Secret (hidden): ', { hidden: true });
  for (const [name, value] of [['Client ID', clientId], ['Client Secret', clientSecret]]) {
    if (!/^[0-9a-f]{32}$/.test(value)) {
      throw new Error(`${name} looks wrong (${value.length} characters, expected 32 hex). Paste it again.`);
    }
  }

  const state = randomBytes(16).toString('base64url');
  const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: REDIRECT_URI, scope: SCOPES, state,
  });
  console.log(`\nOpen this link and allow access:\n${url}\n`);
  const opener = { win32: ['cmd', ['/c', 'start', '', url]], darwin: ['open', [url]] }[process.platform] || ['xdg-open', [url]];
  spawnSync(opener[0], opener[1], { stdio: 'ignore' });

  const refreshToken = await exchange(await waitForCode(state), clientId, clientSecret);

  console.log('Saving Worker secrets:');
  putSecret('SPOTIFY_CLIENT_ID', clientId);
  putSecret('SPOTIFY_CLIENT_SECRET', clientSecret);
  putSecret('SPOTIFY_REFRESH_TOKEN', refreshToken);
  console.log('\nDone. Run `npm run deploy` if you have not deployed yet.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
