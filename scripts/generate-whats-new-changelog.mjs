#!/usr/bin/env node
/**
 * Merge package.json version bumps into docs/whats-new/changelog.json
 * without overwriting the hand-authored 1.0.0 block.
 *
 * Release source of truth is package.json — NOT Git tags.
 * Woodpecker builds on V* tags after you already bumped package.json, so tags
 * lag the version that ships in the image. The changelog must be updated from
 * the package.json bump (and committed) before you create the tag.
 *
 * Typical flow:
 *   1. Bump "version" in package.json to the release you are about to ship
 *   2. pnpm whats-new:generate   (or: node scripts/generate-whats-new-changelog.mjs)
 *   3. Curate the new entry bullets in docs/whats-new/changelog.json
 *   4. Commit package.json + changelog together
 *   5. Create the V* tag → Woodpecker builds Docker (changelog is already in the tree)
 *
 * Usage: node scripts/generate-whats-new-changelog.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'docs/whats-new/changelog.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function parseSemverParts(version) {
  const cleaned = String(version || '').replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareSemver(a, b) {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function normalizeVersion(raw) {
  return String(raw || '').replace(/^v/i, '').trim();
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    return { versions: [] };
  }
  return JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
}

/**
 * Version history from commits that touched package.json.
 * First (newest) occurrence of each version wins.
 */
function collectVersionBumpsFromPackageHistory() {
  const log = run('git log --format=%H%x09%ci%x09%s -- package.json');
  if (!log) return [];

  const bumps = [];
  for (const line of log.split('\n')) {
    const [hash, date, ...subjectParts] = line.split('\t');
    const subject = subjectParts.join('\t');
    if (!hash) continue;

    let version = null;
    try {
      const pkg = JSON.parse(run(`git show ${hash}:package.json`));
      version = normalizeVersion(pkg.version);
    } catch {
      continue;
    }
    if (!version) continue;

    const dateOnly = String(date || '').slice(0, 10);
    bumps.push({ version, date: dateOnly, hash, subject });
  }

  const seen = new Set();
  const unique = [];
  for (const bump of bumps) {
    if (seen.has(bump.version)) continue;
    seen.add(bump.version);
    unique.push(bump);
  }
  return unique.sort((a, b) => compareSemver(a.version, b.version));
}

/**
 * Ensure the working-tree package.json version is present even when the bump
 * is not committed yet (normal: bump → generate changelog → commit → tag).
 */
function ensureWorkingTreeVersion(bumps, currentVersion) {
  if (!currentVersion) return bumps;
  if (bumps.some((b) => b.version === currentVersion)) return bumps;

  const head = run('git rev-parse HEAD') || null;
  return [
    ...bumps,
    {
      version: currentVersion,
      date: todayIsoDate(),
      hash: head,
      subject: `Working tree package.json ${currentVersion}`,
    },
  ].sort((a, b) => compareSemver(a.version, b.version));
}

function subjectsBetween(olderHash, newerHash) {
  if (!newerHash) return [];
  const range = olderHash ? `${olderHash}..${newerHash}` : newerHash;
  const out = run(`git log --format=%s ${range}`);
  if (!out) return [];
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^Update version to /i.test(s))
    .slice(0, 8);
}

function summarizeItems(subjects) {
  if (subjects.length === 0) {
    return ['Maintenance and stability updates'];
  }
  return subjects.map((s) => {
    const trimmed = s.replace(/\.$/, '');
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
  });
}

function main() {
  const existing = loadChangelog();
  const byVersion = new Map(
    (existing.versions || []).map((entry) => [normalizeVersion(entry.version), entry])
  );

  const baseline = byVersion.get('1.0.0');
  if (!baseline) {
    console.error('Missing hand-authored 1.0.0 entry in changelog.json — aborting.');
    process.exit(1);
  }

  const currentVersion = normalizeVersion(
    JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8')).version
  );

  let bumps = collectVersionBumpsFromPackageHistory();
  bumps = ensureWorkingTreeVersion(bumps, currentVersion);

  for (let i = 0; i < bumps.length; i += 1) {
    const bump = bumps[i];
    // Baseline and earlier pre-release package versions are out of scope.
    if (compareSemver(bump.version, '1.0.0') <= 0) continue;
    if (compareSemver(bump.version, currentVersion) > 0) continue;

    const existingEntry = byVersion.get(bump.version);
    if (existingEntry && Array.isArray(existingEntry.items) && existingEntry.items.length > 0) {
      // Keep curated items; only fill missing date/title if absent.
      if (!existingEntry.date && bump.date) existingEntry.date = bump.date;
      continue;
    }

    const older = bumps[i - 1];
    const subjects = subjectsBetween(older?.hash || null, bump.hash);
    byVersion.set(bump.version, {
      version: bump.version,
      date: bump.date || existingEntry?.date || null,
      title: existingEntry?.title || `Version ${bump.version}`,
      items: summarizeItems(subjects),
    });
  }

  const versions = [...byVersion.values()]
    .filter((entry) => compareSemver(entry.version, '1.0.0') >= 0)
    .filter((entry) => compareSemver(entry.version, currentVersion) <= 0)
    .sort((a, b) => compareSemver(a.version, b.version));
  // Preserve exact 1.0.0 object from file
  const idx = versions.findIndex((v) => v.version === '1.0.0');
  if (idx >= 0) versions[idx] = baseline;

  const payload = { versions };
  fs.mkdirSync(path.dirname(CHANGELOG_PATH), { recursive: true });
  fs.writeFileSync(CHANGELOG_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${CHANGELOG_PATH} (${versions.length} versions, package.json=${currentVersion}; tags are not used)`
  );
}

main();
