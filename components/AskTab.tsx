'use client';

import { useState } from 'react';
import { RuleChip } from './RuleChip';
import { Button, EmptyState, ErrorNote, Panel, SectionLabel } from './ui';
import { ask, flagGap, getSpec, reportCrossTeamConflict } from '@/lib/client/api';
import { ASK_QUESTION_MAX_CHARS } from '@/lib/schemas';
import { matchTeamLabel } from '@/lib/teams';
import type {
  AskResult,
  CrossTeamConflict,
  CrossTeamReportResponse,
  GapResponse,
  SpecResponse,
  TeamSummary,
} from '@/lib/schemas';

/**
 * Ask — the main surface of the tool.
 *
 * Support agents and internal users come here with a question, not with a
 * spec to compile. So the answer leads, the rules it rests on follow, and the
 * status of those rules is shown: the knowledge base's own governance says an
 * answer may only be asserted from confirmed rules, and anything weaker needs
 * a caveat rather than confident delivery.
 */

/**
 * Rule status, as the knowledge base records it.
 *
 * `meaning` is shown in a legend under the citations: the whole governance
 * model of this tool is "you may assert a confirmed rule and must caveat
 * anything weaker", and that is worth nothing if a reader cannot tell what
 * the words mean.
 */
const STATUS = {
  confirmed: {
    label: 'confirmed',
    className: 'border-accent/50 text-accent',
    meaning: 'agreed and safe to tell a customer',
  },
  unverified: {
    label: 'unverified',
    className: 'border-warning/60 text-warning',
    meaning: 'written down but not yet agreed — check before asserting',
  },
  open: {
    label: 'open',
    className: 'border-warning/60 text-warning',
    meaning: 'a known question nobody has decided yet',
  },
  superseded: {
    label: 'superseded',
    className: 'border-line text-inkDim line-through',
    meaning: 'replaced by a newer rule; never answer from it',
  },
  unknown: {
    label: 'no status',
    className: 'border-line text-inkDim',
    meaning: 'the spec does not say how settled this is',
  },
} as const;

/** The statuses worth explaining; "no status" explains itself. */
const LEGEND = ['confirmed', 'unverified', 'open', 'superseded'] as const;

const CONFIDENCE = {
  high: { label: 'Answered from the spec', className: 'border-accent/50 bg-accent/10 text-accent' },
  medium: { label: 'Partly answered — read the caveats', className: 'border-secondary/50 bg-secondary/10 text-secondary' },
  none: { label: 'The spec does not answer this', className: 'border-warning/50 bg-warning/10 text-warning' },
} as const;

const EXAMPLES = [
  'How much does Pro AI cost per device?',
  'Can a customer have both CPT and HMS on one account?',
  'Why does a customer see two Cam Unlimited plans?',
];

export function AskTab({
  spec,
  draft,
  teams,
  onReveal,
}: {
  spec: SpecResponse | null;
  draft: string;
  teams: TeamSummary[];
  onReveal: (rule: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<'current' | 'parent' | 'teams'>('current');
  const [result, setResult] = useState<AskResult | null>(null);
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [composing, setComposing] = useState(false);
  const [gapTitleInput, setGapTitleInput] = useState('');
  const [gapDescription, setGapDescription] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState<GapResponse | null>(null);
  const [flagError, setFlagError] = useState<unknown>(null);

  // Filed cross-team conflicts, keyed by conflict index and owning team.
  const [filed, setFiled] = useState<Record<string, CrossTeamReportResponse>>({});
  const [filing, setFiling] = useState<string | null>(null);
  const [fileError, setFileError] = useState<unknown>(null);

  if (spec === null) return <EmptyState>Load a spec first.</EmptyState>;

  // Reading across teams only means anything when there is more than one.
  const canFederate = teams.length > 1;
  const federating = scope === 'teams' && canFederate;
  const askingParent = scope === 'parent' && !spec.isParent;

  // The team that owns the spec on screen — the reporter's own team.
  const currentTeam = teams.find((t) => t.parentPath === spec.specPath || t.specPaths.includes(spec.specPath));

  // Names the team rather than saying "parent spec": "asking Services
  // knowledge base" tells you what was searched; "asking Parent spec" does
  // not. Also travels to the server as provenance and into any gap issue.
  const scopeLabel = federating
    ? `All ${teams.length} team knowledge bases`
    : askingParent || spec.isParent
      ? `${currentTeam?.name ?? 'This team'} knowledge base`
      : spec.specPath;

  /**
   * Maps the team label the model wrote back to a real team.
   *
   * The server resolves the slug against the repo anyway, so an unmatched
   * label simply means no button rather than a bad report.
   */
  const teamByLabel = (label: string): TeamSummary | undefined => matchTeamLabel(label, teams) ?? undefined;

  const fileConflict = async (conflict: CrossTeamConflict, index: number, owner: TeamSummary) => {
    const key = `${index}:${owner.slug}`;
    setFiling(key);
    setFileError(null);
    try {
      const filedIssue = await reportCrossTeamConflict({
        topic: conflict.topic,
        // Normalise the model's label to the team's real name, so the issue
        // reads consistently however the model happened to word it.
        positions: conflict.positions.map((p) => ({
          ...p,
          team: teamByLabel(p.team)?.name ?? p.team,
        })),
        ...(conflict.impact.trim() !== '' ? { impact: conflict.impact } : {}),
        ...(asked !== '' ? { question: asked } : {}),
        owningTeamSlug: owner.slug,
        ...(currentTeam ? { reportingTeamSlug: currentTeam.slug } : {}),
      });
      setFiled((prev) => ({ ...prev, [key]: filedIssue }));
    } catch (err) {
      setFileError(err);
    } finally {
      setFiling(null);
    }
  };

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed === '') return;

    setBusy(true);
    setError(null);
    setAsked(trimmed);
    setFlagged(null);
    setFlagError(null);
    setComposing(false);
    setGapTitleInput('');
    setGapDescription('');
    setFiled({});
    setFileError(null);
    try {
      if (federating) {
        // The server loads every team's parent itself. The draft goes along so
        // an edit you have not committed still participates — asking whether a
        // rule you just wrote conflicts with another team is the point.
        setResult(await ask(draft, trimmed, scopeLabel, { scope: 'teams', specPath: spec.specPath }));
      } else {
        // Asking the parent while a child is selected reads it fresh, so the
        // answer reflects the knowledge base as it stands right now.
        const text = askingParent ? (await getSpec(spec.parentPath)).content : draft;
        // Team codes so a question quoting the pre-migration `ENT-007` still
        // reaches a rule the document now writes as `SVC-ENT-007`.
        setResult(await ask(text, trimmed, scopeLabel, { teamCodes: teams.map((t) => t.code) }));
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // Mirrors the server's gapTitle(), so the placeholder shows exactly what
  // will be used when the field is left blank.
  const defaultGapTitle = (() => {
    const flat = asked.replace(/\s+/g, ' ').trim();
    return `KB gap: ${flat.length > 120 ? `${flat.slice(0, 117)}…` : flat}`;
  })();

  const flag = async () => {
    if (result === null || asked === '') return;
    setFlagging(true);
    setFlagError(null);
    try {
      setFlagged(
        await flagGap({
          question: asked,
          ...(gapTitleInput.trim() !== '' ? { title: gapTitleInput.trim() } : {}),
          ...(gapDescription.trim() !== '' ? { description: gapDescription.trim() } : {}),
          // A cross-team gap is filed against the selected team's knowledge
          // base. Writes stay siloed even when the read was not: no gap gets
          // logged against another team's spec on their behalf.
          specPath: askingParent || federating ? spec.parentPath : spec.specPath,
          specLabel: scopeLabel,
          answer: result.answer,
          ...(result.specGap !== null ? { specGap: result.specGap } : {}),
          rulesConsidered: result.retrieval.rulesConsidered,
          rulesRetrieved: result.retrieval.rulesSent,
        }),
      );
    } catch (err) {
      setFlagError(err);
    } finally {
      setFlagging(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Ask the spec</SectionLabel>
          {/*
            Scope widens left to right: this document, this team's knowledge
            base, every team's. The last one exists because the questions that
            are hardest to answer today — anything spanning hardware, app and
            services — are exactly the ones no single document settles.
          */}
          {!spec.isParent || canFederate ? (
            <div className="flex overflow-hidden rounded-md border border-line text-[10px]">
              {([
                ...(spec.isParent
                  ? ([['current', 'this knowledge base']] as const)
                  : ([
                      ['current', 'this spec'],
                      ['parent', 'knowledge base'],
                    ] as const)),
                ...(canFederate ? ([['teams', `all ${teams.length} teams`]] as const) : []),
              ] as [typeof scope, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setScope(value)}
                  className={`px-2 py-1 font-mono transition-colors ${
                    scope === value ? 'bg-accent/15 text-accent' : 'text-inkDim hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <textarea
          value={question}
          maxLength={ASK_QUESTION_MAX_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(question);
          }}
          rows={3}
          placeholder="Ask anything the spec should answer — pricing, entitlement, lifecycle, what a customer should be told…"
          className="scroll-thin mt-2 w-full resize-none rounded-md border border-line bg-panelAlt px-2 py-2 text-xs leading-relaxed text-ink outline-none focus:border-accent/60"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => void submit(question)} loading={busy} disabled={question.trim() === ''}>
            Ask
          </Button>
          <span className="font-mono text-[10px] text-inkDim">
            ⌘↵ to send · asking {scopeLabel}
          </span>
          <span className="ml-auto font-mono text-[10px] text-inkDim">
            {question.length}/{ASK_QUESTION_MAX_CHARS}
          </span>
        </div>

        {result === null && !busy ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => {
                  setQuestion(example);
                  void submit(example);
                }}
                className="rounded border border-line bg-panelAlt px-2 py-1 text-left text-[10px] text-inkDim transition-colors hover:border-accent/50 hover:text-ink"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}
      </Panel>

      {error ? <ErrorNote error={error} onDismiss={() => setError(null)} /> : null}

      {result ? (
        <>
          {/*
            Headline, then facts, then reasoning. An agent on a call reads the
            first line; the rest is there when the customer pushes back.
          */}
          <Panel className={`px-3 py-3 ${CONFIDENCE[result.confidence].className}`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              {CONFIDENCE[result.confidence].label}
            </div>
            <p className="mt-1.5 text-sm font-medium leading-snug">{result.headline}</p>
          </Panel>

          {/*
            Teams disagreeing outranks everything below it. Deliberately shown
            as two positions side by side with no verdict: which knowledge base
            is right is a decision for their owners, and a tool that picked one
            would turn a visible conflict into a confidently wrong answer.
          */}
          {result.crossTeamConflicts && result.crossTeamConflicts.length > 0 ? (
            <Panel className="border-warning/60 bg-warning/5 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <SectionLabel>
                  Teams disagree ({result.crossTeamConflicts.length})
                </SectionLabel>
                <span className="font-mono text-[10px] text-warning">unresolved — owners decide</span>
              </div>

              <ul className="mt-2 space-y-3">
                {result.crossTeamConflicts.map((conflict, i) => (
                  <li key={`${conflict.topic}-${i}`} className="rounded-md border border-line bg-panelAlt p-2">
                    <p className="text-xs font-medium text-ink">{conflict.topic}</p>

                    <ul className="mt-1.5 space-y-1">
                      {conflict.positions.map((position, j) => (
                        <li key={`${position.ruleId}-${j}`} className="flex flex-wrap items-baseline gap-2">
                          <span className="shrink-0 rounded border border-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-secondary">
                            {position.team}
                          </span>
                          <RuleChip rule={position.ruleId} onReveal={onReveal} />
                          <span className="text-[11px] leading-relaxed text-ink">{position.says}</span>
                        </li>
                      ))}
                    </ul>

                    {conflict.impact.trim() !== '' ? (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-inkDim">{conflict.impact}</p>
                    ) : null}

                    {/*
                      Filing is allowed across teams; writing is not. Telling
                      another team their rule conflicts with yours opens an
                      issue on their knowledge base and changes nothing in it,
                      so it needs no write access to their spec.
                    */}
                    {(() => {
                      const owners = [
                        ...new Map(
                          conflict.positions
                            .map((p) => teamByLabel(p.team))
                            .filter((t): t is TeamSummary => t !== undefined)
                            .map((t) => [t.slug, t] as const),
                        ).values(),
                      ];
                      if (owners.length === 0) return null;

                      return (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {owners.map((owner) => {
                            const key = `${i}:${owner.slug}`;
                            const done = filed[key];
                            if (done) {
                              return (
                                <span key={key} className="text-[10px] text-accent">
                                  {done.alreadyLogged ? 'Already filed with' : 'Filed with'} {done.owningTeam} ·{' '}
                                  <a
                                    href={done.issueUrl}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="underline underline-offset-2"
                                  >
                                    Issue #{done.issueNumber} →
                                  </a>
                                </span>
                              );
                            }
                            return (
                              <Button
                                key={key}
                                onClick={() => void fileConflict(conflict, i, owner)}
                                loading={filing === key}
                                disabled={filing !== null}
                                title={`Open an issue on the ${owner.name} knowledge base. Nothing in their spec changes.`}
                              >
                                Tell {owner.name}
                                {currentTeam?.slug === owner.slug ? ' (your team)' : ''}
                              </Button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </li>
                ))}
              </ul>

              {fileError ? (
                <div className="mt-2">
                  <ErrorNote error={fileError} onDismiss={() => setFileError(null)} />
                </div>
              ) : null}

              <p className="mt-2 text-[10px] leading-relaxed text-inkDim">
                Reporting a conflict opens an issue on that team&rsquo;s knowledge base and changes nothing in it.
                Editing their rules stays with them.
              </p>
            </Panel>
          ) : null}

          {result.keyFacts.length > 0 ? (
            <Panel className="overflow-hidden">
              <dl className="divide-y divide-line/60">
                {result.keyFacts.map((fact, i) => (
                  <div key={`${fact.label}-${i}`} className="flex gap-3 px-3 py-1.5">
                    <dt className="w-32 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-inkDim">
                      {fact.label}
                    </dt>
                    <dd className="text-xs leading-relaxed text-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ) : null}

          {result.answer.trim() !== '' ? (
            <Panel className="px-3 py-3">
              <SectionLabel>Detail</SectionLabel>
              <p className="mt-1 text-xs leading-relaxed text-ink">{result.answer}</p>
            </Panel>
          ) : null}

          {result.caveat !== null && result.caveat.trim() !== '' ? (
            <Panel className="border-warning/50 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
              <span className="font-semibold">Do not assert to a customer: </span>
              {result.caveat}
            </Panel>
          ) : null}

          {result.specGap !== null && result.specGap.trim() !== '' ? (
            <Panel className="border-secondary/50 bg-secondary/5 px-3 py-2 text-[11px] leading-relaxed text-ink">
              <span className="font-semibold text-secondary">Spec gap: </span>
              {result.specGap}
            </Panel>
          ) : null}

          {result.citations.length > 0 ? (
            <Panel className="overflow-hidden">
              <div className="border-b border-line px-3 py-2">
                <SectionLabel>Rules this rests on</SectionLabel>
              </div>
              <ul className="divide-y divide-line/60">
                {result.citations.map((c, i) => (
                  <li key={`${c.ruleId}-${i}`} className="flex flex-wrap items-start gap-2 px-3 py-2">
                    {/* Which team owns the rule is part of a federated answer. */}
                    {c.team ? (
                      <span className="shrink-0 rounded border border-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-secondary">
                        {c.team}
                      </span>
                    ) : null}
                    <RuleChip rule={c.ruleId} onReveal={onReveal} />
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${STATUS[c.status].className}`}>
                      {STATUS[c.status].label}
                    </span>
                    <span className="text-xs leading-relaxed text-ink">{c.why}</span>
                  </li>
                ))}
              </ul>

              {/*
                What the status words mean. The tool's whole governance model
                is "assert a confirmed rule, caveat anything weaker", which is
                worth nothing if the reader cannot tell the difference.
              */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2">
                {LEGEND.filter((status) => result.citations.some((c) => c.status === status)).map((status) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${STATUS[status].className}`}
                    >
                      {STATUS[status].label}
                    </span>
                    <span className="text-[10px] text-inkDim">{STATUS[status].meaning}</span>
                  </span>
                ))}
              </div>
            </Panel>
          ) : null}

          {/*
            A question the spec cannot answer is the most useful signal this
            tool produces, so logging it is the primary action in that case
            rather than a footnote. It stays available on any answer — a thin
            or wrong answer is worth flagging too.
          */}
          <Panel
            className={`p-3 ${result.confidence === 'none' ? 'border-warning/50 bg-warning/5' : ''}`}
          >
            <SectionLabel>
              {result.confidence === 'none' ? 'Not covered — tell the owners' : 'Answer not good enough?'}
            </SectionLabel>

            <p className="mt-1 text-xs leading-relaxed text-ink">
              {result.confidence === 'none'
                ? 'Log this question for the knowledge-base owners. They review flagged questions and decide what to write into the spec.'
                : 'If this is wrong or incomplete, log it so the owners can tighten the rules behind it.'}
            </p>

            {flagError ? (
              <div className="mt-2">
                <ErrorNote error={flagError} onDismiss={() => setFlagError(null)} />
              </div>
            ) : null}

            {flagged ? (
              <div className="mt-3 rounded-md border border-accent/50 bg-accent/10 px-3 py-2 text-[11px] text-accent">
                {flagged.alreadyLogged
                  ? 'Already logged — someone asked this before.'
                  : 'Logged for the knowledge-base owners.'}{' '}
                <a
                  href={flagged.issueUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2"
                >
                  Issue #{flagged.issueNumber} →
                </a>
              </div>
            ) : composing ? (
              /*
                Title and description are both optional. Blank means the
                auto-generated title and no note, which is the common case —
                so the form opens with empty fields and a visible default
                rather than demanding input before anything can be logged.
              */
              <div className="mt-3 space-y-2">
                <label className="block space-y-1">
                  <SectionLabel>Title (optional)</SectionLabel>
                  <input
                    autoFocus
                    value={gapTitleInput}
                    maxLength={200}
                    onChange={(e) => setGapTitleInput(e.target.value)}
                    placeholder={defaultGapTitle}
                    className="w-full rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
                  />
                  <p className="font-mono text-[10px] text-inkDim">
                    {gapTitleInput.trim() === '' ? `defaults to: ${defaultGapTitle}` : ' '}
                  </p>
                </label>

                <label className="block space-y-1">
                  <SectionLabel>Description (optional)</SectionLabel>
                  <textarea
                    value={gapDescription}
                    maxLength={4000}
                    rows={3}
                    onChange={(e) => setGapDescription(e.target.value)}
                    placeholder="What were you actually trying to find out? Anything the owners should know — a customer ticket, where you looked, what you expected."
                    className="scroll-thin w-full resize-none rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs leading-relaxed text-ink outline-none focus:border-accent/60"
                  />
                </label>

                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={() => void flag()} loading={flagging}>
                    Log it
                  </Button>
                  <Button onClick={() => setComposing(false)} disabled={flagging}>
                    Cancel
                  </Button>
                  <span className="font-mono text-[10px] text-inkDim">
                    the question, rules retrieved and spec are attached automatically
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <Button
                  variant={result.confidence === 'none' ? 'primary' : 'ghost'}
                  onClick={() => setComposing(true)}
                >
                  Flag to knowledge-base owners
                </Button>
              </div>
            )}
          </Panel>

          {/*
            Company knowledge, kept visibly apart from the spec answer.
            Same question, different source — Confluence, Jira, Slack rather
            than the specification. Merging the two would destroy the one
            guarantee this tool makes, so it gets its own panel, its own
            colour, and a label saying it is not spec-derived.
          */}
          {result.companyKnowledge ? (
            <Panel className="border-secondary/40 bg-secondary/5 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <SectionLabel>Also found in company knowledge</SectionLabel>
                <span className="font-mono text-[10px] text-secondary">not from the spec</span>
              </div>

              <p className="mt-1 text-xs leading-relaxed text-ink">{result.companyKnowledge.answer}</p>

              {result.companyKnowledge.sources.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {result.companyKnowledge.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[11px] text-secondary underline underline-offset-2 hover:text-ink"
                      >
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="mt-2 text-[10px] leading-relaxed text-inkDim">
                If this disagrees with the spec answer above, one of them is stale — that is worth flagging to the
                knowledge-base owners rather than picking a side.
              </p>
            </Panel>
          ) : null}

          {/*
            The sources, not just the paraphrase.
            A support agent needs to check the answer against the rules it came
            from, and an answer that cites the wrong rule is only visibly wrong
            if the right one is on screen next to it.
          */}
          {result.retrievedRules.length > 0 ? (
            <details className="rounded-lg border border-line bg-panel">
              <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-inkDim hover:text-ink">
                Rules retrieved for this question ({result.retrieval.rulesSent}) — check the answer against them
              </summary>
              <ul className="divide-y divide-line/60 border-t border-line">
                {result.retrievedRules.map((rule, i) => (
                  <li key={`${rule.ruleId ?? i}`} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {rule.team ? (
                        <span
                          title={rule.team.name}
                          className="rounded border border-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-secondary"
                        >
                          {rule.team.code}
                        </span>
                      ) : null}
                      {rule.ruleId ? <RuleChip rule={rule.ruleId} onReveal={onReveal} /> : null}
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${STATUS[rule.status].className}`}
                      >
                        {STATUS[rule.status].label}
                      </span>
                      <span className="font-mono text-[10px] text-inkDim">{rule.section}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-inkDim">{rule.text}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <p className="px-1 font-mono text-[10px] text-inkDim">
            {asked === '' ? '' : `“${asked}” · `}
            {result.retrieval.wholeDocument
              ? `whole spec searched (${result.retrieval.rulesConsidered} rules)`
              : `${result.retrieval.rulesSent} of ${result.retrieval.rulesConsidered} rules retrieved`}
          </p>

          {/*
            Per-team counts. "Hardware: 0 of 3" is the difference between a
            team having nothing to say and a team whose knowledge base is
            nearly empty — a reader cannot weigh a cross-team answer, or a
            cross-team silence, without being able to tell those apart.
          */}
          {result.retrieval.teams && result.retrieval.teams.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 font-mono text-[10px] text-inkDim">
              {result.retrieval.teams.map((team) => (
                <span key={team.slug} className={team.rulesSent === 0 ? 'opacity-50' : ''}>
                  {team.name}: {team.rulesSent}/{team.rulesConsidered}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : busy ? null : (
        <EmptyState>Nothing asked yet. Try one of the examples above.</EmptyState>
      )}
    </div>
  );
}
