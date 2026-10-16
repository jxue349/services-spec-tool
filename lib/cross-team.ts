import { createRecentMemo, marker, markerIn, markerKey } from './issue-marker';

/**
 * Cross-team conflict reports.
 *
 * When a federated answer finds two teams' knowledge bases contradicting each
 * other, somebody has to be told — and the somebody is the team that owns the
 * rule, not the person who happened to ask the question.
 *
 * Filed as an issue, deliberately. A team may raise a conflict against
 * another team's knowledge base without having write access to it: the report
 * changes nothing, names both rules, and leaves the owning team to decide.
 * That is the whole permission model — read across teams, file across teams,
 * write only your own.
 */

export const CROSS_TEAM_LABEL = 'cross-team-conflict';
export const CROSS_TEAM_MARKER_NAME = 'cross-team-key';

export type ConflictPosition = {
  team: string;
  ruleId: string;
  says: string;
};

/**
 * The identity of a conflict: the rules in dispute, and nothing else.
 *
 * Not the topic — two people hitting the same contradiction will describe it
 * differently, and that must not file it twice. Not the team labels either:
 * those are model-generated text that varies between "Services", "SVC" and
 * "Services (SVC)", so including them would make dedupe depend on wording
 * the model happened to choose. The rule IDs are the only stable identity,
 * and sorting them means the order the teams came back in cannot matter.
 */
export function conflictKey(positions: readonly ConflictPosition[]): string {
  const ids = positions.map((p) => p.ruleId.trim().toUpperCase()).sort();
  return markerKey(...ids);
}

export function conflictMarker(positions: readonly ConflictPosition[]): string {
  return marker(CROSS_TEAM_MARKER_NAME, conflictKey(positions));
}

export function conflictMarkerIn(body: string | null | undefined): string | null {
  return markerIn(body, CROSS_TEAM_MARKER_NAME);
}

export function conflictTitle(topic: string): string {
  const flat = topic.replace(/\s+/g, ' ').trim();
  const clipped = flat.length > 110 ? `${flat.slice(0, 107)}…` : flat;
  return `Cross-team conflict: ${clipped}`;
}

const recent = createRecentMemo();

export function recallRecentConflict(
  positions: readonly ConflictPosition[],
  now: number = Date.now(),
): { url: string; number: number } | null {
  return recent.recall(conflictKey(positions), now);
}

export function rememberConflict(
  positions: readonly ConflictPosition[],
  issue: { url: string; number: number },
  now: number = Date.now(),
): void {
  recent.remember(conflictKey(positions), issue, now);
}

/** Test-only reset. */
export function __resetRecentConflicts(): void {
  recent.reset();
}

/** Table cells cannot contain pipes or newlines. */
function inline(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

export function renderConflictBody(input: {
  topic: string;
  positions: readonly ConflictPosition[];
  impact?: string;
  question?: string;
  note?: string;
  /** The team whose knowledge base this is filed against. */
  owningTeam: string;
  /** The team the reporter was working in, when it is a different one. */
  reportingTeam?: string;
  reportedBy: string | null;
  followers: readonly string[];
}): string {
  const crossTeam = input.reportingTeam !== undefined && input.reportingTeam !== input.owningTeam;

  const lines = [
    conflictMarker(input.positions),
    '',
    input.reportedBy === null
      ? 'A cross-team contradiction was found in AI Spec Explorer.'
      : `**${input.reportedBy}** found a cross-team contradiction in AI Spec Explorer.`,
    '',
  ];

  if (crossTeam) {
    lines.push(
      // No "the … team" wrapper: several team names already end in "Team",
      // which produced "the HW Team team against …".
      `> Raised by **${input.reportingTeam}** against the **${input.owningTeam}** knowledge base.`,
      '> Filing a report needs no write access to this team\'s spec — nothing here has been changed.',
      '',
    );
  }

  lines.push(
    '## What the two knowledge bases disagree about',
    '',
    input.topic.trim(),
    '',
    '| Team | Rule | What it requires |',
    '| --- | --- | --- |',
    ...input.positions.map((p) => `| ${inline(p.team)} | \`${inline(p.ruleId)}\` | ${inline(p.says)} |`),
    '',
  );

  if (input.impact !== undefined && input.impact.trim() !== '') {
    lines.push('## Why it matters', '', input.impact.trim(), '');
  }

  if (input.question !== undefined && input.question.trim() !== '') {
    lines.push('## The question that surfaced it', '', `> ${input.question.trim().replace(/\n/g, '\n> ')}`, '');
  }

  if (input.note !== undefined && input.note.trim() !== '') {
    lines.push('## Notes from the reporter', '', input.note.trim(), '');
  }

  lines.push(
    '## What to do with this',
    '',
    '- Decide which rule is right. Nothing was merged and no rule was changed —',
    '  the tool reports the disagreement and stops, because which knowledge base',
    '  is correct is a product decision for the owners.',
    '- If this team\'s rule is the one that should change, update it through the',
    '  normal pull-request flow.',
    '- If both are right in their own context, say so in the rules themselves —',
    '  an answer that depends on context should not read as a flat contradiction.',
    '',
  );

  if (input.followers.length > 0) {
    lines.push(
      `${input.followers.map((f) => `@${f}`).join(' ')} — you follow the **${input.owningTeam}** knowledge base.`,
      '',
    );
  }

  lines.push('🤖 Logged by [AI Spec Explorer](https://claude.com/claude-code)');
  return lines.join('\n');
}
