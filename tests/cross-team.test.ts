import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRecentConflicts,
  conflictKey,
  conflictMarkerIn,
  conflictTitle,
  renderConflictBody,
} from '@/lib/cross-team';
import { __resetRateLimit } from '@/lib/ratelimit';
import type { RepoFile, SpecRepoClient } from '@/lib/github';

const POSITIONS = [
  { team: 'Services', ruleId: 'SVC-ENT-007', says: 'Stays an active entitlement.' },
  { team: 'HW Team', ruleId: 'HW-004', says: 'Treated as cancelled.' },
];

describe('conflictKey', () => {
  it('is the pair of rules, not the topic wording', () => {
    // Two people hit the same contradiction and describe it differently; it
    // is still one conflict and must dedupe to one issue.
    expect(conflictKey(POSITIONS)).toBe(conflictKey([...POSITIONS]));
  });

  it('does not depend on the order the teams came back in', () => {
    expect(conflictKey(POSITIONS)).toBe(conflictKey([...POSITIONS].reverse()));
  });

  it('differs for a different pair of rules', () => {
    const other = [POSITIONS[0]!, { team: 'HW Team', ruleId: 'HW-009', says: 'Something else.' }];
    expect(conflictKey(other)).not.toBe(conflictKey(POSITIONS));
  });
});

describe('renderConflictBody', () => {
  const body = renderConflictBody({
    topic: 'Whether an unbound add-on remains an entitlement',
    positions: POSITIONS,
    impact: 'A customer is told two different things.',
    owningTeam: 'HW Team',
    reportingTeam: 'Services',
    reportedBy: 'jxue@wyze.com',
    followers: ['someone'],
  });

  it('carries a marker that survives title edits', () => {
    expect(conflictMarkerIn(body)).toBe(conflictKey(POSITIONS));
  });

  it('states both positions without choosing one', () => {
    expect(body).toContain('`SVC-ENT-007`');
    expect(body).toContain('`HW-004`');
    expect(body).toContain('which knowledge base');
    expect(body).toContain('is correct is a product decision for the owners');
  });

  it('says plainly that nothing was changed', () => {
    // The permission model has to be legible to the team receiving the issue.
    expect(body).toContain('needs no write access');
    expect(body).toContain('nothing here has been changed');
  });

  it('notifies the owning team’s followers, naming that team', () => {
    expect(body).toContain('@someone');
    expect(body).toContain('**HW Team** knowledge base');
  });

  it('omits the cross-team banner when a team reports against itself', () => {
    const own = renderConflictBody({
      topic: 'x',
      positions: POSITIONS,
      owningTeam: 'HW Team',
      reportingTeam: 'HW Team',
      reportedBy: null,
      followers: [],
    });
    expect(own).not.toContain('needs no write access');
  });
});

describe('conflictTitle', () => {
  it('clips a long topic', () => {
    expect(conflictTitle('x'.repeat(300)).length).toBeLessThan(140);
  });
});

// ---------------------------------------------------------------------------

const MANIFEST = JSON.stringify([
  { slug: 'services', name: 'Services', code: 'SVC' },
  { slug: 'hardware', name: 'HW Team', code: 'HW' },
]);

const FILES: Record<string, string> = {
  'specs/teams.json': MANIFEST,
  'specs/hardware/followers.txt': 'hw-owner\n',
  'specs/services/followers.txt': 'svc-owner\n',
};

const getFile = vi.fn<SpecRepoClient['getFile']>();
const createIssue = vi.fn<SpecRepoClient['createIssue']>();
const findOpenIssueByMarker = vi.fn<SpecRepoClient['findOpenIssueByMarker']>();

function forbidden(name: string) {
  return vi.fn(() => {
    throw new Error(`filing a cross-team report must not call ${name}`);
  });
}

const putFile = forbidden('putFile');
const createPullRequest = forbidden('createPullRequest');

vi.mock('@/lib/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github')>()),
  createSpecRepoClient: () =>
    ({
      getFile,
      createIssue,
      findOpenIssueByMarker,
      putFile,
      createPullRequest,
      createBranch: forbidden('createBranch'),
      getBranchHeadSha: forbidden('getBranchHeadSha'),
      requestReviewers: forbidden('requestReviewers'),
      updatePullRequestBody: forbidden('updatePullRequestBody'),
      lastCommitForPath: vi.fn(async () => null),
      listCommitsForPath: vi.fn(async () => []),
      listSpecFiles: vi.fn(async () => ['specs/services/parent.md', 'specs/hardware/parent.md']),
    }) as unknown as SpecRepoClient,
}));

const { POST: reportRoute } = await import('@/app/api/cross-team/report/route');

function post(body: unknown): Request {
  return new Request('http://localhost/api/cross-team/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = {
  topic: 'Whether an unbound add-on remains an entitlement',
  positions: POSITIONS,
  impact: 'A customer is told two different things.',
  owningTeamSlug: 'hardware',
  reportingTeamSlug: 'services',
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  __resetRecentConflicts();

  process.env.GITHUB_TOKEN = 'gh-test-token';
  process.env.GITHUB_OWNER = 'wyze';
  process.env.GITHUB_REPO = 'specs';
  process.env.SPEC_ROOT = 'specs';
  process.env.SPEC_PARENT_PATH = 'specs/services/parent.md';
  // No OIDC configured: the app stays open and attributes to nobody.
  delete process.env.OIDC_ISSUER;

  getFile.mockImplementation(async (_ref: string, path: string) => {
    const content = FILES[path];
    return content === undefined ? null : ({ content, sha: 'x' } as RepoFile);
  });
  findOpenIssueByMarker.mockResolvedValue(null);
  createIssue.mockResolvedValue({ url: 'https://github.com/o/r/issues/12', number: 12 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/cross-team/report', () => {
  it('files an issue against the owning team and notifies their followers', async () => {
    const res = await reportRoute(post(VALID));
    expect(res.status).toBe(200);

    const args = createIssue.mock.calls[0]?.[0];
    expect(args?.labels).toEqual(['cross-team-conflict']);
    // The OWNING team's followers, not the reporter's.
    expect(args?.body).toContain('@hw-owner');
    expect(args?.body).not.toContain('@svc-owner');

    const body = (await res.json()) as { owningTeam: string; alreadyLogged: boolean };
    expect(body).toMatchObject({ owningTeam: 'HW Team', alreadyLogged: false });
  });

  it('changes nothing in the other team’s spec', async () => {
    await reportRoute(post(VALID));

    // The entire permission model: file across teams, write only your own.
    expect(putFile).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it('joins an existing issue rather than filing a second', async () => {
    findOpenIssueByMarker.mockResolvedValue({ url: 'https://github.com/o/r/issues/3', number: 3 });

    const res = await reportRoute(post(VALID));
    const body = (await res.json()) as { issueNumber: number; alreadyLogged: boolean };

    expect(body).toMatchObject({ issueNumber: 3, alreadyLogged: true });
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('dedupes a second report before GitHub’s list catches up', async () => {
    await reportRoute(post(VALID));
    const res = await reportRoute(post({ ...VALID, topic: 'worded entirely differently' }));

    const body = (await res.json()) as { alreadyLogged: boolean; issueNumber: number };
    expect(body).toMatchObject({ alreadyLogged: true, issueNumber: 12 });
    expect(createIssue).toHaveBeenCalledTimes(1);
  });

  it('rejects a team that owns no knowledge base', async () => {
    // The slug decides who gets notified, so it is resolved against the repo
    // rather than trusted.
    const res = await reportRoute(post({ ...VALID, owningTeamSlug: 'not-a-team' }));
    expect(res.status).toBe(400);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('needs at least two positions to be a conflict', async () => {
    const res = await reportRoute(post({ ...VALID, positions: [POSITIONS[0]] }));
    expect(res.status).toBe(400);
  });
});
