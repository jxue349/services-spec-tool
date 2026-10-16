'use client';

import { SectionLabel } from './ui';
import type { TeamSummary } from '@/lib/schemas';

/**
 * Picks which team's specs are in view.
 *
 * Above the spec selector, because team is the coarser choice: each team owns
 * its own knowledge base, and a spec only means something inside one.
 */
export function TeamSelector({
  teams,
  value,
  disabled,
  onChange,
}: {
  teams: TeamSummary[];
  value: string;
  disabled: boolean;
  onChange: (slug: string) => void;
}) {
  if (teams.length <= 1) return null;

  const current = teams.find((t) => t.slug === value);

  return (
    <label className="block space-y-1">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Team</SectionLabel>
        {current ? (
          <span
            className="font-mono text-[10px] text-inkDim"
            title="Prefix for this team's rule IDs"
          >
            IDs: {current.code}-… · {current.specPaths.length} spec
            {current.specPaths.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60 disabled:opacity-50"
      >
        {teams.map((team) => (
          <option key={team.slug} value={team.slug}>
            {team.name}
          </option>
        ))}
      </select>
      {current?.description ? (
        <p className="text-[10px] leading-relaxed text-inkDim">{current.description}</p>
      ) : null}
    </label>
  );
}
