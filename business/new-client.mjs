#!/usr/bin/env node
// Onboard a new client — the first step of the engagement pipeline.
//
//   node business/new-client.mjs "kaf adventures" \
//        --contact "Mick" --email mick@kafadventures.com \
//        --class player --project "Immersive 3D Trail Fly-By"
//
// What it does:
//   1. Registers the client in variables.json (the single source of truth).
//   2. Stamps out their base package (proposal, MSA, SOW, invoice) into
//      clients/<slug>/ from templates/package/.
// Then you tailor the numbers in variables.json + the [BRACKETS] in the docs,
// run `node business/build.mjs`, and send from dist/.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const VARS = join(ROOT, 'variables.json');
const PKG = join(ROOT, 'templates', 'package');

// ---- parse args -------------------------------------------------------------
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const name = positional.join(' ').trim();
if (!name) {
  console.error('Usage: node business/new-client.mjs "Client Name" [--contact .. --email .. --class .. --project ..]');
  process.exit(1);
}

const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
if (!slug) { console.error(`Could not derive a folder name from "${name}".`); process.exit(1); }

// ---- register the client in variables.json ----------------------------------
const vars = JSON.parse(readFileSync(VARS, 'utf8'));
vars.clients ||= {};

if (vars.clients[slug] && !('force' in flags)) {
  console.error(`Client "${slug}" already exists in variables.json. Re-run with --force to overwrite its entry.`);
  process.exit(1);
}

vars.clients[slug] = {
  legalName: flags.legalname || `${name} [LEGAL ENTITY NAME]`,
  shortName: flags.short || name.split(/\s+/)[0],
  contact: flags.contact || '[CONTACT NAME]',
  contactTitle: flags.title || '[TITLE]',
  email: flags.email || '[EMAIL]',
  website: flags.website || '[WEBSITE]',
  class: flags.class || 'commercial',
  project: flags.project || '[PROJECT NAME]',
};
writeFileSync(VARS, JSON.stringify(vars, null, 2) + '\n');

// ---- stamp out the base package ---------------------------------------------
const destDir = join(ROOT, 'clients', slug);
mkdirSync(destDir, { recursive: true });

const pkgFiles = existsSync(PKG) ? readdirSync(PKG).filter((f) => f.endsWith('.md')) : [];
if (!pkgFiles.length) { console.error(`No package templates found in ${PKG}.`); process.exit(1); }

const copied = [];
const skipped = [];
for (const f of pkgFiles) {
  const dest = join(destDir, f);
  if (existsSync(dest) && !('force' in flags)) { skipped.push(f); continue; }
  writeFileSync(dest, readFileSync(join(PKG, f), 'utf8'));
  copied.push(f);
}

// ---- report -----------------------------------------------------------------
console.log(`\n✓ Registered client "${name}"  →  clients/${slug}/  (class: ${vars.clients[slug].class})`);
if (copied.length) console.log(`  stamped: ${copied.join(', ')}`);
if (skipped.length) console.log(`  kept (already existed): ${skipped.join(', ')}  — use --force to overwrite`);
console.log(`\nNext:
  1. Tailor  → edit clients.${slug} in business/variables.json (contact, project) and the [BRACKETS] in clients/${slug}/*.md (scope, price, courtesy).
  2. Build   → node business/build.mjs
  3. Review  → node business/serve.mjs  →  http://localhost:4455
  4. Send    → print the doc to PDF and email it, then collect signature + deposit.\n`);
