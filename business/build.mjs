#!/usr/bin/env node
// Unakin business-doc generator — zero dependencies.
//
// Reads business/variables.json (the single source of truth) and fills every
// {{token}} in the markdown under templates/ and clients/, writing ready-to-send
// copies into business/dist/ (mirroring the folder structure).
//
//   node business/build.mjs
//
// Token syntax:  {{studio.legalName}}, {{rates.rackHourly}}, {{today}}
// Left untouched: anything in [BRACKETS] — those are intentionally bespoke per
// engagement, so you edit them by hand in the generated file.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_DIRS = ['templates', 'clients'];
const OUT = join(ROOT, 'dist');

const vars = JSON.parse(readFileSync(join(ROOT, 'variables.json'), 'utf8'));
vars.today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Resolve a dotted path like "studio.legalName" against the vars object.
const resolve = (path) =>
  path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);

// Walk a directory recursively, yielding absolute file paths.
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

let filled = 0;
const missing = new Set();

for (const sub of SRC_DIRS) {
  const dir = join(ROOT, sub);
  let exists = true;
  try { statSync(dir); } catch { exists = false; }
  if (!exists) continue;

  for (const file of walk(dir)) {
    if (!file.endsWith('.md')) continue;
    const rel = relative(ROOT, file); // e.g. "clients/kaf/proposal.md"

    // templates/package/ holds the raw per-client base docs — they're stamped out
    // per client by new-client.mjs, not rendered directly here.
    if (rel.split('/').includes('package')) continue;

    // Bind {{client.*}} to the folder's client: anything under clients/<slug>/.
    const parts = rel.split('/');
    vars.client =
      parts[0] === 'clients' && vars.clients ? vars.clients[parts[1]] || {} : undefined;

    const raw = readFileSync(file, 'utf8');
    const out = raw.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, path) => {
      const val = resolve(path);
      if (val === undefined || typeof val === 'object') {
        missing.add(path);
        return m; // leave the token visible so the gap is obvious
      }
      // Format numbers with thousands separators (1200 -> 1,200) for clean money display.
      if (typeof val === 'number') return val.toLocaleString('en-US');
      return String(val);
    });

    const dest = join(OUT, rel); // business/dist/clients/kaf/proposal.md
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out);
    filled++;
    console.log(`  ✓ ${rel}  →  ${relative(ROOT, dest)}`);
  }
}

console.log(`\nGenerated ${filled} document(s) into business/dist/`);
if (missing.size) {
  console.log(`\n⚠ Unresolved tokens (add them to variables.json):`);
  for (const p of [...missing].sort()) console.log(`   {{${p}}}`);
}
console.log(`\nReminder: [BRACKETS] in the generated files are bespoke — fill them per engagement.`);
