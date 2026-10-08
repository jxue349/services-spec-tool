'use client';

import { useState } from 'react';
import { RuleChip } from './RuleChip';
import { Button, EmptyState, ErrorNote, Panel, SectionLabel } from './ui';
import { ask, flagGap, getSpec } from '@/lib/client/api';
import { ASK_QUESTION_MAX_CHARS } from '@/lib/schemas';
import type { AskResult, GapResponse, SpecResponse } from '@/lib/schemas';

/**
 * Ask — the main surface of the tool.
 *
 * Support agents and internal users come here with a question, not with a
 * spec to compile. So the answer leads, the rules it rests on follow, and the
 * status of those rules is shown: the knowledge base's own governance says an
 * answer may only be asserted from confirmed rules, and anything weaker needs
 * a caveat rather than confident delivery.
 */

const STATUS = {
  confirmed: { label: 'confirmed', className: 'border-accent/50 text-accent' },
  unverified: { label: 'unverified', className: 'border-warning/60 text-warning' },
  open: { label: 'open', className: 'border-warning/60 text-warning' },
  superseded: { label: 'superseded', className: 'border-line text-inkDim line-through' },
  unknown: { label: 'no status', className: 'border-line text-inkDim' },
} as const;

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
  onReveal,
}: {
  spec: SpecResponse | null;
  draft: string;
  onReveal: (rule: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<'current' | 'parent'>('current');
  const [result, setResult] = useState<AskResult | null>(null);
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState<GapResponse | null>(null);
  const [flagError, setFlagError] = useState<unknown>(null);

  if (spec === null) return <EmptyState>Load a spec first.</EmptyState>;

  const askingParent = scope === 'parent' && !spec.isParent;
  const scopeLabel = askingParent ? 'Parent spec (knowledge base)' : spec.isParent ? 'Parent spec (knowledge base)' : spec.specPath;

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed === '') return;

    setBusy(true);
    setError(null);
    setAsked(trimmed);
    setFlagged(null);
    setFlagError(null);
    try {
      // Asking the parent while a child is selected reads it fresh, so the
      // answer reflects the knowledge base as it stands right now.
      const text = askingParent ? (await getSpec(spec.parentPath)).content : draft;
      setResult(await ask(text, trimmed, scopeLabel));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const flag = async () => {
    if (result === null || asked === '') return;
    setFlagging(true);
    setFlagError(null);
    try {
      setFlagged(
        await flagGap({
          question: asked,
          specPath: askingParent ? spec.parentPath : spec.specPath,
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
          {!spec.isParent ? (
            <div className="flex overflow-hidden rounded-md border border-line text-[10px]">
              {(['current', 'parent'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setScope(value)}
                  className={`px-2 py-1 font-mono transition-colors ${
                    scope === value ? 'bg-accent/15 text-accent' : 'text-inkDim hover:text-ink'
                  }`}
                >
                  {value === 'current' ? 'this spec' : 'knowledge base'}
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
          <Panel className={`px-3 py-3 ${CONFIDENCE[result.confidence].className}`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              {CONFIDENCE[result.confidence].label}
            </div>
            <p className="mt-1 text-xs leading-relaxed">{result.answer}</p>
          </Panel>

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
                  <li key={`${c.ruleId}-${i}`} className="flex items-start gap-2 px-3 py-2">
                    <RuleChip rule={c.ruleId} onReveal={onReveal} />
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${STATUS[c.status].className}`}>
                      {STATUS[c.status].label}
                    </span>
                    <span className="text-xs leading-relaxed text-ink">{c.why}</span>
                  </li>
                ))}
              </ul>
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
            ) : (
              <div className="mt-3">
                <Button
                  variant={result.confidence === 'none' ? 'primary' : 'ghost'}
                  onClick={() => void flag()}
                  loading={flagging}
                >
                  Flag to knowledge-base owners
                </Button>
              </div>
            )}
          </Panel>

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
        </>
      ) : busy ? null : (
        <EmptyState>
          Ask a question and the spec answers it — with the rules it relied on, and their status.
        </EmptyState>
      )}
    </div>
  );
}
