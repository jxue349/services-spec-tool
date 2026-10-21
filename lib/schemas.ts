import { z } from 'zod';

/**
 * Request and response contracts. Shared by the API routes and the client so
 * both sides agree on shape; this module deliberately imports nothing
 * server-only so it is safe in the client bundle.
 */

export const SPEC_MAX_BYTES = 100 * 1024;
export const QUESTION_MAX_CHARS = 500;
export const MAX_SCENARIO_DEVICES = 10;

/** 100 KB measured in bytes, not code units — the limit is about payload size. */
const specString = z
  .string()
  .min(1, 'Spec is empty')
  .refine((s) => new TextEncoder().encode(s).length <= SPEC_MAX_BYTES, {
    message: `Spec exceeds the ${SPEC_MAX_BYTES / 1024} KB limit`,
  });

// --------------------------------------------------------------------------
// Requests
// --------------------------------------------------------------------------

export const SubscriptionSchema = z.string().min(1).max(80);

export const ScenarioSchema = z.object({
  account: SubscriptionSchema,
  devices: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        subscription: SubscriptionSchema,
      }),
    )
    .max(MAX_SCENARIO_DEVICES, `At most ${MAX_SCENARIO_DEVICES} devices per scenario`),
});

export const ExplorerRequestSchema = z.union([
  z.object({ spec: specString, scenario: ScenarioSchema }),
  z.object({ spec: specString, question: z.string().min(1).max(QUESTION_MAX_CHARS) }),
]);

export const SpecOnlyRequestSchema = z.object({ spec: specString });

/**
 * Declared after TestMatrixSchema below via a getter-free lazy reference would
 * be noise; the test-case shape is small enough to restate for the request
 * boundary, where it only needs to be bounded and rule-citing.
 */
export const ConsistencyRequestSchema = z.object({
  spec: specString,
  testMatrix: z
    .array(
      z.object({
        id: z.string().max(40),
        scenario: z.string().max(2_000),
        expected: z.string().max(2_000),
        priority: z.enum(['P1', 'P2', 'P3']),
        rules: z.array(z.string().max(40)).max(30),
        inPrototype: z.boolean(),
      }),
    )
    .max(40)
    .optional(),
});

export const UploadRequestSchema = z.object({
  /** Human name; becomes the directory the spec lives in. */
  name: z.string().min(1).max(80),
  /** Original filename, used for the extension check and the PR body. */
  filename: z.string().min(1).max(260),
  content: specString,
  /** Optional note from the uploader, added to the pull request body. */
  note: z.string().max(2_000).optional(),
});

export const CommitRequestSchema = z.object({
  /** Repo path of the spec being written; validated against the spec root. */
  specPath: z.string().min(1).max(400),
  content: specString,
  baseSha: z.string().min(1).max(200),
  commitMessage: z.string().min(1).max(500),
  prTitle: z.string().min(1).max(300).optional(),
  prBody: z.string().max(5_000).optional(),
  direct: z.boolean().optional(),
});

// --------------------------------------------------------------------------
// Compiler responses (model output — validated, never trusted)
// --------------------------------------------------------------------------

const ruleIds = z.array(z.string().max(40)).max(30);
const shortText = z.string().max(2_000);

export const ExplorerScenarioResultSchema = z.object({
  accountSummary: shortText,
  devices: z
    .array(
      z.object({
        name: z.string().max(120),
        effectiveEntitlement: z.string().max(200),
        why: shortText,
        rules: ruleIds,
      }),
    )
    .max(MAX_SCENARIO_DEVICES),
  notes: shortText,
});

export const ExplorerWhatIfResultSchema = z.object({
  answer: shortText,
  rules: ruleIds,
  specGap: shortText.nullable(),
});

export const TestMatrixSchema = z.object({
  tests: z
    .array(
      z.object({
        id: z.string().max(40),
        scenario: shortText,
        expected: shortText,
        priority: z.enum(['P1', 'P2', 'P3']),
        rules: ruleIds,
        inPrototype: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
});

export const StateMachineSchema = z.object({
  states: z.array(z.string().max(80)).min(1).max(30),
  transitions: z
    .array(
      z.object({
        from: z.string().max(80),
        to: z.string().max(80),
        event: z.string().max(120),
        rules: ruleIds,
        note: shortText,
      }),
    )
    .max(80),
});

// --------------------------------------------------------------------------
// Ask — the support/customer-facing question surface
// --------------------------------------------------------------------------

export const ASK_QUESTION_MAX_CHARS = 1_000;

/**
 * `spec` — only the selected document.
 * `teams` — every team's knowledge base, federated.
 *
 * Federated read is the decision recorded in docs/multi-team.md: a question
 * like "what does the plugin page show for a Cam Plus user?" spans three
 * teams, and no single document answers it. Reading across them is safe;
 * writing across them is not, so no write path takes this field.
 */
export const AskScopeSchema = z.enum(['spec', 'teams']);

export const AskRequestSchema = z.object({
  spec: specString,
  question: z.string().min(1).max(ASK_QUESTION_MAX_CHARS),
  /** Which document was asked about, for display and provenance. */
  specLabel: z.string().min(1).max(120),
  scope: AskScopeSchema.optional(),
  /**
   * Path of the document in `spec`. Federated reads use it to substitute the
   * caller's unsaved draft for that team's committed parent — editing a rule
   * and asking whether it now contradicts another team is the case this whole
   * feature exists for, and it would be useless against committed text only.
   */
  specPath: z.string().min(1).max(400).optional(),
  /**
   * Known team codes, so a question quoting the pre-migration `ENT-007`
   * reaches a rule now written `SVC-ENT-007`.
   *
   * Sent by the client because the single-spec path deliberately never reads
   * the repo, and loading the team list to answer one question would undo
   * that. Only ever used to strip a prefix while ranking, so the worst a bad
   * value can do is make the caller's own retrieval slightly worse.
   */
  teamCodes: z
    .array(z.string().regex(/^[A-Z0-9]{1,16}$/))
    .max(20)
    .optional(),
});

const ruleStatus = z.enum(['confirmed', 'unverified', 'open', 'superseded', 'unknown']);

export const AskResponseSchema = z.object({
  /**
   * The answer in one sentence. A support agent reads this and nothing else
   * when they are on a call, so it has to stand alone.
   */
  headline: z.string().max(400),
  /** The reasoning and qualifications behind the headline. */
  answer: shortText,
  /**
   * Discrete facts worth lifting out of the prose — a price, a limit, a
   * device list. Scannable where a paragraph is not.
   */
  keyFacts: z
    .array(z.object({ label: z.string().max(60), value: z.string().max(300) }))
    .max(8),
  /**
   * Rules the answer rests on. Status comes from the spec, not the model, so
   * a reader can tell a confirmed rule from an open question.
   *
   * `team` is set only on a federated answer, where "which team's rule is
   * this" is part of the answer rather than context the reader already has.
   */
  citations: z
    .array(
      z.object({
        ruleId: z.string().max(40),
        status: ruleStatus,
        why: shortText,
        team: z.string().max(80).nullish(),
      }),
    )
    .max(20),
  /**
   * How far the spec actually settles the question. "none" means the spec is
   * silent and the answer must say so rather than improvise.
   */
  confidence: z.enum(['high', 'medium', 'none']),
  specGap: shortText.nullable(),
  /**
   * Set when the answer leans on a rule the spec does not mark confirmed —
   * the knowledge base's own governance says those need a caveat.
   */
  caveat: shortText.nullable(),
  /**
   * Places where two teams' knowledge bases disagree about the same behavior,
   * found while answering. Federated answers only.
   *
   * Reported, never resolved — the same rule Parent Check follows for
   * contradictions. A tool that quietly picks one team's version destroys
   * exactly the signal that makes reading across teams worth doing, and which
   * knowledge base is right is a product decision for their owners.
   */
  crossTeamConflicts: z
    .array(
      z.object({
        topic: z.string().max(200),
        positions: z
          .array(
            z.object({
              team: z.string().max(80),
              ruleId: z.string().max(40),
              says: shortText,
            }),
          )
          .max(6),
        impact: shortText,
      }),
    )
    .max(10)
    .optional(),
});

export type AskResponse = z.infer<typeof AskResponseSchema>;
export type CrossTeamConflict = NonNullable<AskResponse['crossTeamConflicts']>[number];
export type AskCitation = AskResponse['citations'][number];

export type RetrievedRule = {
  ruleId: string | null;
  section: string;
  status: 'confirmed' | 'unverified' | 'open' | 'superseded' | 'unknown';
  text: string;
  /** Owning team, on a federated answer. Absent when one spec was searched. */
  team?: { slug: string; name: string; code: string };
};

/**
 * What each team's knowledge base contributed.
 *
 * Shown rather than kept internal because "Hardware: 0 of 3 rules" is the
 * difference between a team having nothing to say and a team not having been
 * asked — and a reader cannot judge a cross-team answer without knowing which.
 */
export type TeamRetrieval = {
  slug: string;
  name: string;
  rulesConsidered: number;
  rulesSent: number;
};

export type AskResult = AskResponse & {
  /** Retrieval provenance, added server-side. */
  retrieval: {
    rulesConsidered: number;
    rulesSent: number;
    wholeDocument: boolean;
    /** Per-team breakdown, on a federated answer. */
    teams?: TeamRetrieval[];
  };
  /**
   * The rules actually sent to the model, highest ranked first.
   *
   * Shown in the UI so a reader can check the answer against its sources
   * rather than trusting the paraphrase — and so a model that cites the wrong
   * rule is visibly wrong instead of quietly wrong.
   */
  retrievedRules: RetrievedRule[];
  /**
   * Glean's company-knowledge answer, when enabled. Deliberately a separate
   * field, never merged into `answer`: a reader must always be able to tell
   * which claims the specification actually backs.
   */
  companyKnowledge: { answer: string; sources: { title: string; url: string }[] } | null;
};

export const GapRequestSchema = z.object({
  question: z.string().min(1).max(ASK_QUESTION_MAX_CHARS),
  /** Both optional: blank means the auto-generated title and no extra note. */
  title: z.string().max(200).optional(),
  description: z.string().max(4_000).optional(),
  specPath: z.string().min(1).max(400),
  specLabel: z.string().min(1).max(120),
  answer: z.string().max(4_000).optional(),
  specGap: z.string().max(2_000).optional(),
  rulesConsidered: z.number().int().nonnegative().max(100_000).optional(),
  rulesRetrieved: z.number().int().nonnegative().max(100_000).optional(),
});

/**
 * Filing a cross-team contradiction with the team that owns the rule.
 *
 * Read is federated and so is filing; writing is not. This request opens an
 * issue on the owning team's knowledge base and changes nothing in it, which
 * is what lets one team raise a conflict against another without holding
 * write access to their spec.
 */
export const CrossTeamReportSchema = z.object({
  topic: z.string().min(1).max(200),
  positions: z
    .array(
      z.object({
        team: z.string().min(1).max(80),
        ruleId: z.string().min(1).max(40),
        says: z.string().max(2_000),
      }),
    )
    .min(2)
    .max(6),
  impact: z.string().max(2_000).optional(),
  /** The question that surfaced the conflict, for context in the issue. */
  question: z.string().max(ASK_QUESTION_MAX_CHARS).optional(),
  /** Anything the reporter wants the owners to know. */
  note: z.string().max(4_000).optional(),
  /** Slug of the team whose knowledge base this is filed against. */
  owningTeamSlug: z.string().min(1).max(80),
  /** Slug of the team the reporter was working in, when known. */
  reportingTeamSlug: z.string().max(80).optional(),
});

export type CrossTeamReportResponse = {
  issueUrl: string;
  issueNumber: number;
  /** True when an open issue for this same pair of rules already existed. */
  alreadyLogged: boolean;
  /** Team the issue was filed against, for the confirmation message. */
  owningTeam: string;
};

export type GapResponse = {
  issueUrl: string;
  issueNumber: number;
  /** True when an open issue for this question already existed. */
  alreadyLogged: boolean;
};

// --------------------------------------------------------------------------
// Parent-spec conflict check
// --------------------------------------------------------------------------

export const ConflictRequestSchema = z.object({
  parentSpec: specString,
  childSpec: specString,
  childLabel: z.string().min(1).max(80),
});

/**
 * `addition` — the child defines behavior the parent is silent on.
 * `contradiction` — child and parent both define it, incompatibly.
 * `duplicate` — the child restates a parent rule; nothing to merge.
 */
const conflictKind = z.enum(['addition', 'contradiction', 'duplicate']);

export const ConflictReportSchema = z.object({
  headline: shortText,
  findings: z
    .array(
      z.object({
        kind: conflictKind,
        childRule: z.string().max(40),
        /** The parent rule involved, or null for a pure addition. */
        parentRule: z.string().max(40).nullable(),
        summary: shortText,
        recommendation: shortText,
      }),
    )
    .max(60),
  /**
   * Markdown for rules the parent is missing. Only additions are ever applied
   * automatically — a contradiction is a product decision and goes to the
   * followers as discussion, never as a silent edit to the knowledge base.
   */
  proposedAdditions: z
    .array(
      z.object({
        ruleId: z.string().max(40),
        markdown: z.string().max(4_000),
      }),
    )
    .max(40),
});

export const RequestChangeSchema = z.object({
  childPath: z.string().min(1).max(400),
  childLabel: z.string().min(1).max(80),
  summary: z.string().min(1).max(300),
  additions: z
    .array(z.object({ ruleId: z.string().max(40), markdown: z.string().max(4_000) }))
    .max(40),
  conflicts: z
    .array(
      z.object({
        kind: conflictKind,
        childRule: z.string().max(40),
        parentRule: z.string().max(40).nullable(),
        summary: z.string().max(2_000),
        recommendation: z.string().max(2_000),
      }),
    )
    .max(60),
});

export type ConflictReport = z.infer<typeof ConflictReportSchema>;
export type ConflictFinding = ConflictReport['findings'][number];
export type ProposedAddition = ConflictReport['proposedAdditions'][number];

export type RequestChangeResponse = {
  prUrl: string;
  branch: string;
  /** Followers we successfully asked to review. */
  reviewersRequested: string[];
  /** Followers who could not be added as reviewers; @-mentioned instead. */
  reviewersMentioned: string[];
  additionsApplied: number;
};

const coverage = z.enum(['covered', 'partial', 'missing']);

export const ConsistencySchema = z.object({
  findings: z
    .array(
      z.object({
        rule: z.string().max(40),
        summary: shortText,
        prototype: coverage,
        qa: z.enum(['covered', 'missing', 'unknown']),
        note: shortText,
      }),
    )
    .max(60),
  headline: shortText,
});

// --------------------------------------------------------------------------
// GitHub responses
// --------------------------------------------------------------------------

export type SpecResponse = {
  content: string;
  sha: string;
  commit: { sha: string; author: string; date: string; message: string };
  htmlUrl: string;
  specPath: string;
  /** Commits touching this path — commits are the versions, so this is vN. */
  version: number;
  /** False when the history was longer than we scanned, so vN is a floor. */
  versionExact: boolean;
  /** True when this is the parent spec / knowledge base. */
  isParent: boolean;
  specRoot: string;
  parentPath: string;
  baseBranch: string;
  allowDirectCommit: boolean;
};

export type MeResponse = {
  /** False when sign-in is unavailable, including temporary test mode. */
  authConfigured: boolean;
  authMode?: 'oidc' | 'test-readonly' | 'development';
  integrations?: { github: boolean; compiler: boolean };
  user: { email: string; name: string } | null;
};

export type TeamSummary = {
  slug: string;
  name: string;
  code: string;
  parentPath: string;
  specPaths: string[];
  description?: string;
};

export type TeamsResponse = {
  teams: TeamSummary[];
  specRoot: string;
  defaultTeamSlug: string | null;
};

export type SpecListEntry = {
  path: string;
  /** Directory name for a child spec, or an explicit parent label. */
  label: string;
  isParent: boolean;
};

export type SpecListResponse = {
  specs: SpecListEntry[];
  parentPath: string;
  specRoot: string;
  /** False when the parent spec does not exist in the repo yet. */
  parentExists: boolean;
};

export type CommitResponse = {
  mode: 'pull-request' | 'direct';
  prUrl?: string;
  branch: string;
  commitSha: string;
  sha: string;
};

export type HistoryEntry = {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  /** Commit author email — the identity the change was committed under. */
  authorEmail: string;
  date: string;
  htmlUrl: string;
};

// --------------------------------------------------------------------------
// Inferred types
// --------------------------------------------------------------------------

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ExplorerScenarioResult = z.infer<typeof ExplorerScenarioResultSchema>;
export type ExplorerWhatIfResult = z.infer<typeof ExplorerWhatIfResultSchema>;
export type TestMatrix = z.infer<typeof TestMatrixSchema>;
export type TestCase = TestMatrix['tests'][number];
export type StateMachine = z.infer<typeof StateMachineSchema>;
export type Transition = StateMachine['transitions'][number];
export type ConsistencyReport = z.infer<typeof ConsistencySchema>;
export type ConsistencyFinding = ConsistencyReport['findings'][number];
