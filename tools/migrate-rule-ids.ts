/**
 * One-off migration: give every rule ID its owning team.
 *
 *   npm run migrate:rule-ids            # dry run, writes nothing
 *   npm run migrate:rule-ids -- --apply # opens one pull request
 *
 * Dry run by default because this rewrites every rule in a knowledge base at
 * once, and the diff is the only review anyone gets. `--apply` opens a single
 * pull request across all teams rather than committing: the knowledge base is
 * never written directly, and this script is not an exception to that.
 *
 * Run it from the repo root with the same .env the app uses.
 */

import { Octokit } from '@octokit/rest';
import { migrateRuleIds } from '../lib/migrate-rule-ids';
import { TEAMS_MANIFEST, buildTeams, parseTeamManifest } from '../lib/teams';
import type { Team } from '../lib/teams';

const apply = process.argv.includes('--apply');

function env(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const owner = env('GITHUB_OWNER');
const repo = env('GITHUB_REPO');
const branch = env('SPEC_BASE_BRANCH', 'main');
const specRoot = env('SPEC_ROOT', 'specs').replace(/^\/+|\/+$/g, '');

const octokit = new Octokit({ auth: env('GITHUB_TOKEN') });

async function readFile(path: string): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch });
    const data = res.data as { content?: string; encoding?: string; sha: string; type?: string };
    if (data.type !== 'file' || typeof data.content !== 'string') return null;
    return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

async function listMarkdown(): Promise<string[]> {
  const res = await octokit.rest.git.getTree({ owner, repo, tree_sha: branch, recursive: 'true' });
  return res.data.tree
    .filter((node) => node.type === 'blob' && typeof node.path === 'string')
    .map((node) => node.path as string)
    .filter((path) => path.startsWith(`${specRoot}/`) && path.toLowerCase().endsWith('.md'));
}

/** Every spec a team owns: its knowledge base and its child specs. */
function pathsOf(team: Team): string[] {
  return [team.parentPath, ...team.specPaths];
}

async function main(): Promise<void> {
  const paths = await listMarkdown();
  const manifest = await readFile(`${specRoot}/${TEAMS_MANIFEST}`);
  const teams = buildTeams(paths, specRoot, parseTeamManifest(manifest?.content ?? null));

  if (teams.length === 0) {
    console.error(`No teams found under ${specRoot}/. Each team needs a parent.md.`);
    process.exit(1);
  }

  const codes = teams.map((team) => team.code);
  const changes: { path: string; content: string; sha: string; renamed: number }[] = [];

  console.log(`${apply ? 'Migrating' : 'Dry run —'} ${teams.length} teams in ${owner}/${repo}@${branch}\n`);

  for (const team of teams) {
    console.log(`${team.name} (${team.code})`);

    for (const path of pathsOf(team)) {
      const file = await readFile(path);
      if (file === null) {
        console.log(`  ${path} — unreadable, skipped`);
        continue;
      }

      const result = migrateRuleIds(file.content, team.code, codes);
      if (result.renamed.length === 0) {
        console.log(`  ${path} — nothing to do (${result.unchanged.length} ids already carry a team)`);
        continue;
      }

      changes.push({ path, content: result.content, sha: file.sha, renamed: result.renamed.length });

      const sample = result.renamed.slice(0, 3).map((r) => `${r.from} → ${r.to}`).join(', ');
      const more = result.renamed.length > 3 ? `, +${result.renamed.length - 3} more` : '';
      console.log(`  ${path} — ${result.renamed.length} renamed: ${sample}${more}`);
    }
  }

  const total = changes.reduce((sum, change) => sum + change.renamed, 0);
  console.log(`\n${total} rule ids across ${changes.length} file(s).`);

  if (changes.length === 0) return;

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to open a pull request.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
  const head = `spec/rule-id-teams-${stamp}`;

  const baseSha = (await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` })).data.object.sha;
  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${head}`, sha: baseSha });

  for (const change of changes) {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: change.path,
      branch: head,
      sha: change.sha,
      message: `spec: team-prefix ${change.renamed} rule id(s) in ${change.path}`,
      content: Buffer.from(change.content, 'utf8').toString('base64'),
    });
  }

  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    head,
    base: branch,
    title: `spec: give every rule id its owning team (${total} ids)`,
    body: [
      'Rule ids now carry the team that owns them, so an id pasted into a ticket',
      'says who to ask. `ENT-007` becomes `SVC-ENT-007`.',
      '',
      '## Files',
      '',
      ...changes.map((change) => `- \`${change.path}\` — ${change.renamed} ids`),
      '',
      '## What was and was not touched',
      '',
      '- Only ids the document **defines** were renamed. Jira keys in the Source',
      '  column (`BCS-137`, `CAMPLUSN-946`) are never in definition position, so',
      '  they are untouched.',
      '- Cross-references inside rule text were rewritten too, so "see ENT-007"',
      '  still points somewhere.',
      '- URLs were masked during the rewrite and are unchanged.',
      '- Ids that already carried a team were left alone.',
      '',
      'Existing citations keep working: the tool resolves a bare `ENT-007` to',
      '`SVC-ENT-007`, so tickets written before this merge still resolve.',
      '',
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    ].join('\n'),
  });

  console.log(`\nPull request opened: ${pr.data.html_url}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
