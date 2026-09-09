#!/usr/bin/env node
// Local preview server for the Unakin business toolkit.
//
//   node business/serve.mjs        → http://localhost:4455
//
// Regenerates business/dist/ from variables.json on startup, then serves the
// filled markdown as clean, print-to-PDF web pages. Zero npm dependencies
// (markdown is rendered client-side via a pinned CDN copy of marked).

import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const PORT = 4455;

// Regenerate so the preview always reflects the current variables.json.
try {
  execFileSync('node', [join(ROOT, 'build.mjs')], { stdio: 'inherit' });
} catch {
  console.error('build.mjs failed — serving whatever is already in dist/.');
}

function* walk(dir) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (extname(full) === '.md') yield full;
  }
}

const docs = () =>
  [...walk(DIST)].map((f) => relative(DIST, f)).sort();

// Resolve a requested doc path safely inside DIST.
function safeDocPath(rel) {
  const full = join(DIST, rel);
  if (!full.startsWith(DIST + '/') || extname(full) !== '.md') return null;
  try { statSync(full); } catch { return null; }
  return full;
}

const shell = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Unakin</title>
<style>
  :root{--ink:#14151a;--muted:#6b7180;--line:#e7e8ec;--bg:#f6f6f4;--card:#fff;--accent:#5b4bff}
  @media(prefers-color-scheme:dark){:root{--ink:#e9eaee;--muted:#9aa0af;--line:#2a2c34;--bg:#0e0f13;--card:#16171d}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
  header{position:sticky;top:0;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
  header a{color:var(--muted);text-decoration:none;font-size:14px}
  header a:hover{color:var(--ink)}
  header .brand{font-weight:600;color:var(--ink);letter-spacing:.02em}
  header .spacer{flex:1}
  header button{font:inherit;font-size:14px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 14px;cursor:pointer}
  header button:hover{border-color:var(--accent)}
  main{max-width:820px;margin:0 auto;padding:40px 24px 120px}
  .doc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:56px 64px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
  .doc h1{font-size:30px;line-height:1.2;margin:.2em 0 .6em}
  .doc h2{font-size:20px;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:1px solid var(--line)}
  .doc h3{font-size:16px;margin:1.6em 0 .4em}
  .doc table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14.5px}
  .doc th,.doc td{border:1px solid var(--line);padding:8px 12px;text-align:left;vertical-align:top}
  .doc th{background:color-mix(in srgb,var(--accent) 8%,transparent)}
  .doc code{background:color-mix(in srgb,var(--muted) 18%,transparent);padding:.1em .4em;border-radius:4px;font-size:.9em}
  .doc pre{background:color-mix(in srgb,var(--muted) 12%,transparent);padding:16px 18px;border-radius:10px;overflow:auto;font-size:13.5px;line-height:1.5}
  .doc pre code{background:none;padding:0}
  .doc blockquote{margin:1.2em 0;padding:.4em 1.2em;border-left:3px solid var(--accent);color:var(--muted)}
  .doc hr{border:none;border-top:1px solid var(--line);margin:2em 0}
  .doc a{color:var(--accent)}
  .index li{margin:.4em 0}
  .index a{color:var(--accent);text-decoration:none;font-size:17px}
  .index a:hover{text-decoration:underline}
  .hint{color:var(--muted);font-size:13px;margin-top:8px}
  @media print{
    header{display:none}
    body{background:#fff}
    main{max-width:none;padding:0}
    .doc{border:none;border-radius:0;box-shadow:none;padding:0}
  }
</style></head><body>
<header>
  <span class="brand">Unakin · business toolkit</span>
  <a href="/">All documents</a>
  <span class="spacer"></span>
  <button onclick="window.print()">Print / Save as PDF</button>
</header>
<main>${body}</main>
</body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    const items = docs()
      .map((d) => `<li><a href="/doc?path=${encodeURIComponent(d)}">${d}</a></li>`)
      .join('\n');
    const body = `<div class="doc index">
      <h1>Unakin business toolkit</h1>
      <p class="hint">Generated from <code>variables.json</code>. Edit that file and restart to refresh. Open a doc, then <b>Print / Save as PDF</b> to produce something to send.</p>
      <ul>${items || '<li>No documents in dist/. Run <code>node business/build.mjs</code>.</li>'}</ul>
    </div>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(shell('Toolkit', body));
  }

  if (url.pathname === '/raw') {
    const full = safeDocPath(url.searchParams.get('path') || '');
    if (!full) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(readFileSync(full, 'utf8'));
  }

  if (url.pathname === '/doc') {
    const rel = url.searchParams.get('path') || '';
    if (!safeDocPath(rel)) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end(shell('Not found', '<div class="doc"><h1>Not found</h1></div>')); }
    const body = `<div class="doc" id="doc">Rendering…</div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
      <script>
        const path = ${JSON.stringify(encodeURIComponent(rel))};
        fetch('/raw?path=' + path)
          .then(r => r.text())
          .then(md => { document.getElementById('doc').innerHTML = marked.parse(md); })
          .catch(() => { document.getElementById('doc').textContent = 'Failed to load. Is the server running?'; });
      </script>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(shell(rel, body));
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\nUnakin toolkit preview → http://localhost:${PORT}\n`);
  for (const d of docs()) console.log(`   • ${d}`);
  console.log('\nCtrl-C to stop.');
});
