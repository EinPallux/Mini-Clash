#!/usr/bin/env node
// Package boundary rules from TECHNICAL_ARCHITECTURE §3, enforced mechanically.
// sim/data/protocol must stay browser- and node-free; nothing imports client.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const rules = [
  { pkg: 'sim', banned: [/^three/, /^react/, /^node:/, /^@mini-clash\/(client|server|api|tools)/] },
  { pkg: 'data', banned: [/^three/, /^react/, /^node:/, /^@mini-clash\//] },
  {
    pkg: 'protocol',
    banned: [/^three/, /^react/, /^node:/, /^@mini-clash\/(client|server|api|tools)/],
  },
  { pkg: 'tools', banned: [/^@mini-clash\/(client|sim)/] },
];
const importRe =
  /(?:^|\n)\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

let failures = 0;
function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, fn);
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) fn(p);
  }
}
for (const { pkg, banned } of rules) {
  const root = join('packages', pkg, 'src');
  try {
    statSync(root);
  } catch {
    continue;
  }
  walk(root, (file) => {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(importRe)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      for (const rule of banned) {
        if (rule.test(spec)) {
          console.error(
            `BOUNDARY VIOLATION: ${file} imports '${spec}' (banned in ${pkg}: ${rule})`,
          );
          failures++;
        }
      }
    }
  });
}
// No package may import the client.
walk('packages', (file) => {
  if (file.includes(`packages${join('/')}client`)) return;
  const src = readFileSync(file, 'utf8');
  if (/@mini-clash\/client/.test(src)) {
    console.error(`BOUNDARY VIOLATION: ${file} imports @mini-clash/client`);
    failures++;
  }
});
if (failures > 0) process.exit(1);
console.info('boundaries: OK');
