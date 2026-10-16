import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetGleanAuth } from '@/lib/providers/glean';
import { __resetRateLimit } from '@/lib/ratelimit';
import type { RepoFile, SpecRepoClient } from '@/lib/github';

/**
 * Federated Ask — reading across every team's knowledge base.
 *
 * The guarantees under test are the two halves of the decision in
 * docs/multi-team.md: a question may reach every team's rules, and nothing
 * about answering it may write anywhere. Plus the one that makes conflict
 * detection possible at all — a small knowledge base still reaches the model
 * when a large one is competing for the same budget.
 */

const PARENTS: Record<string, string> = {
  'specs/services/parent.md': [
    '# Services',
    '- **ADDON-014** — Cam Plus grace period is 16 days after failed payment ✅ Confirmed',
  ].join('\n'),
  'specs/hardware/parent.md': [
    '# Hardware',
    '- **HW-007** — Plugin page shows a 30 day grace period banner ⚠️ Unverified',
  ].join('\n'),
  'specs/app-experience/parent.md': ['# App Experience', '- **APPEX-002** — Drawer lists devices ✅ Confirmed'].join(
    '\n',
  ),
};

const MANIFEST = JSON.stringify([
  { slug: 'services', name: 'Services', code: 'SVC' },
  { slug: 'hardware', name: 'HW Team', code: 'HW' },
  { slug: 'app-experience', name: 'App Experience', code: 'APPEX' },
]);

const getFile = vi.fn<SpecRepoClient['getFile']>();
const listSpecFiles = vi.fn<SpecRepoClient['listSpecFiles']>();

/** Every write method throws: a read must never reach one. */
function forbidden(name: string) {
  return vi.fn(() => {
    throw new Error(`federated ask must not call ${name}`);
  });
}

const putFile = forbidden('putFile');
const createBranch = forbidden('createBranch');
const createPullRequest = forbidden('createPullRequest');
const createIssue = forbidden('createIssue');

vi.mock('@/lib/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github')>()),
  createSpecRepoClient: () =>
    ({
      getFile,
      listSpecFiles,
      putFile,
      createBranch,
      createPullRequest,
      createIssue,
      getBranchHeadSha: forbidden('getBranchHeadSha'),
      lastCommitForPath: vi.fn(async () => null),
      listCommitsForPath: vi.fn(async () => []),
      requestReviewers: forbidden('requestReviewers'),
      updatePullRequestBody: forbidden('updatePullRequestBody'),
      findOpenIssueByMarker: vi.fn(async () => null),
    }) as unknown as SpecRepoClient,
}));

const { POST: askRoute } = await import('@/app/api/ask/route');

const fetchMock = vi.fn();

function gleanReply(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: JSON.stringify(payload) }] }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

const CONFLICT_ANSWER = {
  headline: 'Services and HW Team disagree on the grace period.',
  answer: 'Services defines 16 days; the HW Team plugin-page rule shows 30.',
  keyFacts: [],
  citations: [
    { ruleId: 'ADDON-014', team: 'Services', status: 'confirmed', why: '16 days' },
    { ruleId: 'HW-007', team: 'HW Team', status: 'unverified', why: '30 days' },
  ],
  confidence: 'medium',
  specGap: null,
  caveat: null,
  crossTeamConflicts: [
    {
      topic: 'grace period length',
      positions: [
        { team: 'Services', ruleId: 'ADDON-014', says: '16 days' },
        { team: 'HW Team', ruleId: 'HW-007', says: '30 days' },
      ],
      impact: 'A customer is told two different things depending on the screen.',
    },
  ],
};

function post(body: unknown): Request {
  return new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function promptOf(call = 0): string {
  const init = fetchMock.mock.calls[call]?.[1] as { body: string } | undefined;
  if (init === undefined) return '';
  const parsed = JSON.parse(init.body) as { messages: Array<{ fragments: Array<{ text: string }> }> };
  return parsed.messages[0]?.fragments[0]?.text ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  __resetGleanAuth();
  vi.stubGlobal('fetch', fetchMock);

  process.env.GLEAN_API_KEY = 'glean-test-token-value';
  process.env.GLEAN_INSTANCE = 'wyze';
  delete process.env.GLEAN_CLIENT_ID;
  delete process.env.GLEAN_CLIENT_SECRET;
  process.env.GITHUB_TOKEN = 'gh-test-token';
  process.env.GITHUB_OWNER = 'wyze';
  process.env.GITHUB_REPO = 'specs';
  process.env.SPEC_ROOT = 'specs';
  process.env.SPEC_PARENT_PATH = 'specs/services/parent.md';

  listSpecFiles.mockResolvedValue(Object.keys(PARENTS));
  getFile.mockImplementation(async (_ref: string, path: string): Promise<RepoFile | null> => {
    if (path === 'specs/teams.json') return { content: MANIFEST, sha: 'm1' } as RepoFile;
    const content = PARENTS[path];
    return content === undefined ? null : ({ content, sha: `sha-${path}` } as RepoFile);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/ask — federated scope', () => {
  it('reads every team and groups the prompt by team', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply(CONFLICT_ANSWER));

    const res = await askRoute(
      post({
        spec: '# draft',
        question: 'How long is the grace period?',
        specLabel: 'All teams',
        scope: 'teams',
      }),
    );

    expect(res.status).toBe(200);

    const prompt = promptOf();
    expect(prompt).toContain('### Team: Services (SVC)');
    expect(prompt).toContain('### Team: HW Team (HW)');
    expect(prompt).toContain('ADDON-014');
    expect(prompt).toContain('HW-007');
    // Reported, never resolved — the whole point of showing both.
    expect(prompt).toContain('Do NOT resolve the conflict');
  });

  it('returns the conflict, the team labels and the per-team breakdown', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply(CONFLICT_ANSWER));

    const res = await askRoute(
      post({ spec: '# draft', question: 'grace period?', specLabel: 'All teams', scope: 'teams' }),
    );
    const body = (await res.json()) as {
      crossTeamConflicts?: { positions: { team: string }[] }[];
      citations: { team?: string | null }[];
      retrieval: { teams?: { slug: string; rulesSent: number }[] };
      retrievedRules: { team?: { code: string } }[];
    };

    expect(body.crossTeamConflicts?.[0]?.positions.map((p) => p.team)).toEqual(['Services', 'HW Team']);
    expect(body.citations.map((c) => c.team)).toEqual(['Services', 'HW Team']);

    // App Experience matched nothing — listed with zero, not dropped, so a
    // reader can tell silence from absence.
    const appex = body.retrieval.teams?.find((t) => t.slug === 'app-experience');
    expect(appex?.rulesSent).toBe(0);
    expect(body.retrievedRules.every((r) => r.team !== undefined)).toBe(true);
  });

  it('writes nothing', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply(CONFLICT_ANSWER));

    await askRoute(post({ spec: '# draft', question: 'grace period?', specLabel: 'All', scope: 'teams' }));

    // Siloed write is the other half of the decision: reading across teams
    // must not create a path by which one team's answer edits another's spec.
    expect(putFile).not.toHaveBeenCalled();
    expect(createBranch).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
    expect(createIssue).not.toHaveBeenCalled();
  });

  it('substitutes an uncommitted draft for that team’s committed parent', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply(CONFLICT_ANSWER));

    await askRoute(
      post({
        spec: '# Hardware\n- **HW-007** — Plugin page shows a 45 day grace period banner ⚠️ Unverified',
        question: 'grace period?',
        specLabel: 'All',
        scope: 'teams',
        specPath: 'specs/hardware/parent.md',
      }),
    );

    // The edit you have not committed is exactly what you want checked for
    // conflicts, so the draft wins over the committed text for that team.
    expect(promptOf()).toContain('45 day');
    expect(promptOf()).not.toContain('30 day');
    // And only for that team.
    expect(promptOf()).toContain('ADDON-014');
  });

  it('rejects a draft path outside the spec root', async () => {
    const res = await askRoute(
      post({
        spec: '# evil',
        question: 'grace period?',
        specLabel: 'All',
        scope: 'teams',
        specPath: '../../../etc/passwd',
      }),
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still answers when one team’s knowledge base cannot be read', async () => {
    getFile.mockImplementation(async (_ref: string, path: string): Promise<RepoFile | null> => {
      if (path === 'specs/teams.json') return { content: MANIFEST, sha: 'm1' } as RepoFile;
      if (path === 'specs/hardware/parent.md') throw new Error('502 from GitHub');
      const content = PARENTS[path];
      return content === undefined ? null : ({ content, sha: 'x' } as RepoFile);
    });
    fetchMock.mockResolvedValueOnce(gleanReply({ ...CONFLICT_ANSWER, crossTeamConflicts: [] }));

    const res = await askRoute(
      post({ spec: '# draft', question: 'grace period?', specLabel: 'All', scope: 'teams' }),
    );

    expect(res.status).toBe(200);
    expect(promptOf()).toContain('ADDON-014');
    expect(promptOf()).not.toContain('HW-007');
  });

  it('says so plainly when no team covers the question', async () => {
    const res = await askRoute(
      post({ spec: '# draft', question: 'quantum tunnelling diode', specLabel: 'All', scope: 'teams' }),
    );

    const body = (await res.json()) as { confidence: string; retrieval: { teams?: unknown[] } };
    expect(body.confidence).toBe('none');
    expect(body.retrieval.teams).toHaveLength(3);
    // No model call at all: there is nothing to reason over.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the single-spec path alone, and off GitHub entirely', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply({
        headline: 'Sixteen days.',
        answer: 'Per ADDON-014.',
        keyFacts: [],
        citations: [{ ruleId: 'ADDON-014', status: 'confirmed', why: '16 days' }],
        confidence: 'high',
        specGap: null,
        caveat: null,
      }),
    );

    const res = await askRoute(
      post({
        spec: PARENTS['specs/services/parent.md'],
        question: 'grace period?',
        specLabel: 'specs/services/parent.md',
      }),
    );

    expect(res.status).toBe(200);
    expect(listSpecFiles).not.toHaveBeenCalled();
    expect(getFile).not.toHaveBeenCalled();

    const body = (await res.json()) as { retrieval: { teams?: unknown } };
    expect(body.retrieval.teams).toBeUndefined();
  });
});
