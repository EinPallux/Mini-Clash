#!/usr/bin/env node
//
// Fail if the lockfile resolves anything over git.
//
//   node scripts/check-lockfile.mjs
//
// Why this exists, specifically.
//
// `colyseus` declares every transport it can speak to under peerDependencies
// and marks none of them optional, so pnpm's auto-install-peers pulled in
// @colyseus/uwebsockets-transport, whose own uWebSockets.js dependency is not
// on the registry — it resolves to `git@github.com:uNetworking/uWebSockets.js`.
// The game never loaded that transport, but `pnpm install --frozen-lockfile`
// still had to fetch it, and fetching it needs a GitHub SSH key.
//
// A developer machine has one. A CI runner does not. A fresh VPS does not. The
// Docker build image does not even have git. So the tree installed cleanly for
// the person who wrote it and failed for everybody else — CI red at the install
// step, and a deploy that died three minutes into `docker compose build` with
// "ENOENT not found: git", which names the missing binary rather than the
// dependency that wanted it.
//
// That whole class of failure is invisible where it is introduced and only
// shows up where it hurts. Hence a check that runs everywhere.
//
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockfile = join(root, 'pnpm-lock.yaml');

const lines = readFileSync(lockfile, 'utf8').split('\n');
const offenders = [];

for (const [i, line] of lines.entries()) {
  // A git-sourced package appears as its resolution, e.g.
  //   resolution: {commit: 442087c…, repo: git@github.com:org/pkg.git, type: git}
  // and as a `pkg@git+https://…` key. The resolution is the one that cannot be
  // faked, so match on it and report the key it belongs to.
  if (!/^\s*resolution: \{.*\btype: git\b/.test(line)) continue;
  // The entry key is the nearest preceding line ending in a colon.
  let name = '(unknown package)';
  for (let j = i - 1; j >= 0; j--) {
    const m = lines[j].match(/^\s{2}(\S.*):$/);
    if (m) {
      name = m[1];
      break;
    }
  }
  offenders.push({ line: i + 1, name, resolution: line.trim() });
}

if (offenders.length === 0) {
  console.info(`lockfile: OK — ${lines.length} lines, no git-sourced packages`);
  process.exit(0);
}

console.error(`\n  pnpm-lock.yaml resolves ${offenders.length} package(s) over git:\n`);
for (const o of offenders) {
  console.error(`    ${o.name}`);
  console.error(`      pnpm-lock.yaml:${o.line}  ${o.resolution}`);
}
console.error(`
  Every machine that installs this tree then needs git and a key for that host.
  CI runners, a fresh VPS and the Docker build image have none of those, so the
  install fails there and nowhere else.

  If a real dependency was added: prefer the registry release. If there isn't
  one, vendor the code or wrap it in a package you publish.

  If it arrived on its own, it is an auto-installed peer. autoInstallPeers is
  off in pnpm-workspace.yaml precisely to stop that; check whether something
  turned it back on, then declare the peer you actually use as a dependency of
  the package that uses it.
`);
process.exit(1);
