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
 * By default every version after 1.0.0 is rebuilt from git commit subjects
 * (introduction of previous version → this version / HEAD for current).
 * Pass --keep-curated to skip versions that already have items (except current).
 *
 * Usage: node scripts/generate-whats-new-changelog.mjs [--keep-curated]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'docs/whats-new/changelog.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const MAX_SUBJECTS = 100;
const KEEP_CURATED = process.argv.includes('--keep-curated');

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
 * Commits that touched package.json, oldest → newest, with version at that commit.
 */
function packageJsonVersionTimeline() {
  const log = run('git log --reverse --format=%H%x09%ci%x09%s -- package.json');
  if (!log) return [];

  const rows = [];
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

    rows.push({
      version,
      date: String(date || '').slice(0, 10),
      hash,
      subject,
    });
  }
  return rows;
}

/**
 * First commit where each version appears (introduction / bump commit).
 * Sorted ascending by semver.
 */
function collectVersionIntroductions() {
  const timeline = packageJsonVersionTimeline();
  const introductions = [];
  let previous = null;

  for (const row of timeline) {
    if (previous === row.version) continue;
    introductions.push(row);
    previous = row.version;
  }

  const byVersion = new Map();
  for (const intro of introductions) {
    if (!byVersion.has(intro.version)) {
      byVersion.set(intro.version, intro);
    }
  }

  return [...byVersion.values()].sort((a, b) => compareSemver(a.version, b.version));
}

/**
 * Ensure the working-tree package.json version is present even when the bump
 * is not committed yet (normal: bump → generate changelog → commit → tag).
 */
function ensureWorkingTreeVersion(intros, currentVersion) {
  if (!currentVersion) return intros;
  if (intros.some((b) => b.version === currentVersion)) return intros;

  return [
    ...intros,
    {
      version: currentVersion,
      date: todayIsoDate(),
      hash: null,
      subject: `Working tree package.json ${currentVersion}`,
      workingTree: true,
    },
  ].sort((a, b) => compareSemver(a.version, b.version));
}

/**
 * Commit subjects after olderHash up to and including newerRef.
 * newerRef may be a commit hash or HEAD.
 */
function subjectsBetween(olderHash, newerRef) {
  if (!newerRef) return [];
  const range = olderHash ? `${olderHash}..${newerRef}` : newerRef;
  const out = run(`git log --format=%s ${range}`);
  if (!out) return [];
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^Update version to /i.test(s))
    .slice(0, MAX_SUBJECTS);
}

function summarizeItems(subjects) {
  if (subjects.length === 0) {
    return ['Maintenance and stability updates'];
  }
  // Keep full commit subjects — do not truncate (UI can wrap).
  return subjects.map((s) => s.replace(/\.$/, ''));
}

function defaultTitle(version, existingTitle, subjects) {
  // Prefer a curated title — never "Version x.y.z" (the version is shown separately).
  if (
    existingTitle &&
    existingTitle.trim() &&
    !/^Version\s+/i.test(existingTitle)
  ) {
    return existingTitle;
  }
  // Placeholder until curated: short hint from the first subject.
  const first = (subjects && subjects[0]) || '';
  if (first.length > 0 && first.length <= 72) return first;
  if (first.length > 72) return `${first.slice(0, 69)}…`;
  return `Release ${version}`;
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

  let intros = collectVersionIntroductions();
  intros = ensureWorkingTreeVersion(intros, currentVersion);

  const head = run('git rev-parse HEAD') || null;
  let rebuilt = 0;
  let kept = 0;

  for (let i = 0; i < intros.length; i += 1) {
    const intro = intros[i];
    // Baseline and earlier pre-release package versions are out of scope.
    if (compareSemver(intro.version, '1.0.0') <= 0) continue;
    if (compareSemver(intro.version, currentVersion) > 0) continue;

    const existingEntry = byVersion.get(intro.version);
    const isCurrent = intro.version === currentVersion;
    if (
      KEEP_CURATED &&
      !isCurrent &&
      existingEntry &&
      Array.isArray(existingEntry.items) &&
      existingEntry.items.length > 0
    ) {
      if (!existingEntry.date && intro.date) existingEntry.date = intro.date;
      kept += 1;
      continue;
    }

    const older = intros[i - 1];
    // Current release: include all commits since previous introduction through HEAD
    // (working-tree bump may not have its own commit yet).
    const newerRef = isCurrent ? head || intro.hash : intro.hash;
    const subjects = subjectsBetween(older?.hash || null, newerRef);
    byVersion.set(intro.version, {
      version: intro.version,
      date: intro.date || existingEntry?.date || todayIsoDate(),
      title: defaultTitle(intro.version, existingEntry?.title, subjects),
      items: summarizeItems(subjects),
    });
    rebuilt += 1;
  }

  // Drop any leftover entries above current or below baseline that are not 1.0.0
  for (const key of [...byVersion.keys()]) {
    if (key === '1.0.0') continue;
    if (compareSemver(key, '1.0.0') < 0 || compareSemver(key, currentVersion) > 0) {
      byVersion.delete(key);
    }
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

  const current = versions.find((v) => v.version === currentVersion);
  console.log(
    `Wrote ${CHANGELOG_PATH} (${versions.length} versions, package.json=${currentVersion}; tags are not used)`
  );
  console.log(
    KEEP_CURATED
      ? `Rebuilt ${rebuilt} version(s), kept curated ${kept} (pass without --keep-curated to rebuild all after 1.0.0)`
      : `Rebuilt ${rebuilt} version(s) from git (1.0.0 preserved; use --keep-curated to skip existing entries)`
  );
  if (current) {
    console.log(`Current ${currentVersion}: ${current.items.length} item(s)`);
  }
}

main();
