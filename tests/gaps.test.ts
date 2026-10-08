import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimit } from '@/lib/ratelimit';

/**
 * The gap log: questions the knowledge base could not answer become GitHub
 * issues for the owners to triage. Duplicates must collapse, or the backlog
 * fills with the same question asked by five different agents.
 */

const { getContent, issuesCreate, issuesList } = vi.hoisted(() => ({
  getContent: vi.fn(),
  issuesCreate: vi.fn(),
  issuesList: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: { getContent, createOrUpdateFileContents: vi.fn(), listCommits: vi.fn() },
      git: { getBlob: vi.fn(), getRef: vi.fn(), createRef: vi.fn(), getTree: vi.fn() },
      pulls: { create: vi.fn(), requestReviewers: vi.fn(), update: vi.fn() },
      issues: { create: issuesCreate, listForRepo: issuesList },
    };
  },
}));

import { POST as gapsRoute } from '@/app/api/gaps/route';
import { GAP_LABEL, __resetRecentGaps, gapTitle } from '@/lib/gaps';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

function post(body: unknown): Request {
  return new Request('http://localhost/api/gaps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const QUESTION = 'what camera models does cloud CVR support now';

const VALID = {
  question: QUESTION,
  specPath: 'spec/parent.md',
  specLabel: 'Parent spec (knowledge base)',
  answer: 'The specification does not answer this.',
  specGap: 'No rule covers camera-model support for Cloud CVR.',
  rulesConsidered: 172,
  rulesRetrieved: 50,
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  __resetRecentGaps();
  process.env.GITHUB_TOKEN = 'token';
  process.env.GITHUB_OWNER = 'jxue349';
  process.env.GITHUB_REPO = 'services-spec-tool';
  process.env.SPEC_ROOT = 'spec';
  process.env.SPEC_PARENT_PATH = 'spec/parent.md';

  issuesList.mockResolvedValue({ data: [] });
  issuesCreate.mockResolvedValue({ data: { html_url: 'https://github.com/o/r/issues/12', number: 12 } });
  getContent.mockResolvedValue({
    data: { type: 'file', encoding: 'base64', content: b64('jxue349\nsome-pm\n'), sha: 'x', size: 20 },
  });
});

describe('gapTitle', () => {
  it('is stable for the same question so duplicates collide', () => {
    expect(gapTitle(QUESTION)).toBe(gapTitle(`  ${QUESTION}\n`));
  });

  it('collapses whitespace and truncates a long question', () => {
    const title = gapTitle(`${'word '.repeat(60)}`);
    expect(title.length).toBeLessThanOrEqual(128);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('POST /api/gaps', () => {
  it('opens a labelled issue carrying the question and the gap', async () => {
    const res = await gapsRoute(post(VALID));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { issueNumber: number; alreadyLogged: boolean };
    expect(body).toMatchObject({ issueNumber: 12, alreadyLogged: false });

    const issue = issuesCreate.mock.calls[0]?.[0] as { title: string; body: string; labels: string[] };
    expect(issue.labels).toEqual([GAP_LABEL]);
    expect(issue.title).toContain('cloud CVR');
    expect(issue.body).toContain(QUESTION);
    expect(issue.body).toContain('No rule covers camera-model support');
    // Retrieval provenance distinguishes a real gap from a retrieval miss.
    expect(issue.body).toContain('50 of 172 rules');
  });

  it('mentions the parent spec followers', async () => {
    await gapsRoute(post(VALID));
    const issue = issuesCreate.mock.calls[0]?.[0] as { body: string };
    expect(issue.body).toContain('@jxue349');
    expect(issue.body).toContain('@some-pm');
  });

  it('joins an existing open issue instead of filing a duplicate', async () => {
    issuesList.mockResolvedValue({
      data: [{ title: gapTitle(QUESTION), html_url: 'https://github.com/o/r/issues/7', number: 7 }],
    });

    const res = await gapsRoute(post(VALID));
    const body = (await res.json()) as { issueNumber: number; alreadyLogged: boolean };

    expect(body).toEqual({ issueUrl: 'https://github.com/o/r/issues/7', issueNumber: 7, alreadyLogged: true });
    expect(issuesCreate).not.toHaveBeenCalled();
  });

  it('matches duplicates case- and whitespace-insensitively', async () => {
    issuesList.mockResolvedValue({
      data: [{ title: gapTitle(QUESTION).toUpperCase(), html_url: 'https://github.com/o/r/issues/7', number: 7 }],
    });

    await gapsRoute(post({ ...VALID, question: `  ${QUESTION.toUpperCase()}  ` }));
    expect(issuesCreate).not.toHaveBeenCalled();
  });

  it('still files when the followers file is missing', async () => {
    getContent.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    const res = await gapsRoute(post(VALID));
    expect(res.status).toBe(200);
    expect(issuesCreate).toHaveBeenCalledOnce();
  });

  it('explains the missing permission when the token cannot open issues', async () => {
    issuesCreate.mockRejectedValue(Object.assign(new Error('Resource not accessible'), { status: 403 }));

    const res = await gapsRoute(post(VALID));
    expect(res.status).toBe(502);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Issues: read and write');
  });

  it('rejects an empty question without touching GitHub', async () => {
    const res = await gapsRoute(post({ ...VALID, question: '' }));
    expect(res.status).toBe(400);
    expect(issuesCreate).not.toHaveBeenCalled();
  });

  it('rejects a path outside the spec root', async () => {
    const res = await gapsRoute(post({ ...VALID, specPath: '' }));
    expect(res.status).toBe(400);
  });
});

describe('the read-after-write race', () => {
  it('collapses a second flag GitHub has not indexed yet', async () => {
    // GitHub's issue list does not return an issue created moments ago, so the
    // API check alone would file a duplicate. Observed against the real repo.
    issuesList.mockResolvedValue({ data: [] });

    const first = await gapsRoute(post(VALID));
    expect(((await first.json()) as { alreadyLogged: boolean }).alreadyLogged).toBe(false);

    const second = await gapsRoute(post(VALID));
    const body = (await second.json()) as { issueNumber: number; alreadyLogged: boolean };

    expect(body).toMatchObject({ issueNumber: 12, alreadyLogged: true });
    expect(issuesCreate).toHaveBeenCalledOnce();
  });

  it('still matches case-insensitively through the memo', async () => {
    issuesList.mockResolvedValue({ data: [] });
    await gapsRoute(post(VALID));
    await gapsRoute(post({ ...VALID, question: VALID.question.toUpperCase() }));
    expect(issuesCreate).toHaveBeenCalledOnce();
  });
});
