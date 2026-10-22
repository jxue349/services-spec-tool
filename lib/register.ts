import type { RuleBlock, RuleStatus } from './spec-retrieval';

/**
 * The verification & conflict register.
 *
 * In the folder layout a rule does not carry its own status marker. It
 * carries `refs: V-25`, and the register says whether V-25 is still open.
 * README GOV-5: a rule referencing an open item must be caveated, and an
 * uncaveated rule may be asserted as fact. So status is a join between two
 * documents, not a property of one — which is why it is resolved here rather
 * than in the parser.
 *
 * The register's own severity markers carry over: 🔴 is a live contradiction
 * between spec and implementation, ⚠️ is unverified. They mean different
 * things to someone answering a customer, so they are kept apart.
 */

export type RegisterItem = {
  id: string;
  title: string;
  open: boolean;
  /** 🔴 → open (a real conflict), ⚠️ → unverified. */
  severity: RuleStatus;
  /** Rule ids the item names, when it lists any. */
  rules: string[];
};

const ITEM = /^#{1,6}\s+(V-\d{1,4})\s*(?:[—–-]\s*)?(.*)$/;
const SECTION = /^##\s+(.*)$/;
const RULES_FIELD = /^\s*[-*+]\s+rules\s*:\s*(.*)$/i;

/**
 * Parses `register.md` into its items.
 *
 * Openness comes from the `## Open` / `## Resolved` section the item sits
 * under, not from its marker: the markers describe severity, and a resolved
 * item keeps its original marker for history.
 */
export function parseRegister(markdown: string | null | undefined): Map<string, RegisterItem> {
  const items = new Map<string, RegisterItem>();
  if (markdown === null || markdown === undefined) return items;

  const lines = markdown.split('\n');
  let open = true;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    const section = SECTION.exec(line);
    if (section) {
      open = !/resolved|closed|history/i.test(section[1] ?? '');
      continue;
    }

    const match = ITEM.exec(line);
    if (match === null) continue;

    const id = (match[1] ?? '').toUpperCase();
    const title = (match[2] ?? '').trim();

    // Severity from the marker on the heading; a red item is a live conflict.
    const severity: RuleStatus = /🔴/.test(title) ? 'open' : 'unverified';

    // The item may name the rules it blocks on a `- rules:` line below.
    const rules: string[] = [];
    for (let j = i + 1; j < lines.length && !/^#{1,6}\s/.test(lines[j] ?? ''); j += 1) {
      const field = RULES_FIELD.exec(lines[j] ?? '');
      if (field === null) continue;
      for (const part of (field[1] ?? '').split(',')) {
        const ruleId = (/^\s*([A-Za-z][A-Za-z0-9-]*)/.exec(part)?.[1] ?? '').trim();
        if (ruleId !== '') rules.push(ruleId.toUpperCase());
      }
    }

    items.set(id, { id, title: title.replace(/[🔴⚠️✅]/g, '').trim(), open, severity, rules });
  }

  return items;
}

/**
 * The status a rule should actually be shown with.
 *
 * A rule whose refs are all resolved is assertable, so it reports
 * `confirmed` — the parser's fail-safe `unverified` is upgraded here. A rule
 * referencing an unknown item stays caveated: an id the register does not
 * mention is more likely a typo or a deleted item than a settled question,
 * and silently promoting it to fact is the one outcome worth avoiding.
 */
export function resolveStatus(block: RuleBlock, register: Map<string, RegisterItem>): RuleStatus | null {
  // A tombstone stays a tombstone whatever the register says.
  if (block.status === 'superseded') return 'superseded';

  const refs = block.fields?.refs ?? [];
  if (refs.length === 0) return block.status;

  let worst: RuleStatus | null = null;
  for (const ref of refs) {
    const item = register.get(ref.toUpperCase());
    // Unknown ref: keep the caveat rather than assume it was resolved.
    if (item === undefined) {
      worst = worst === 'open' ? worst : 'unverified';
      continue;
    }
    if (!item.open) continue;
    worst = item.severity === 'open' ? 'open' : worst ?? 'unverified';
  }

  // Every referenced item resolved — the rule may be asserted as fact.
  return worst ?? 'confirmed';
}

/** Open register items a rule is blocked by, for showing beside an answer. */
export function openRefsFor(
  block: RuleBlock,
  register: Map<string, RegisterItem>,
): RegisterItem[] {
  return (block.fields?.refs ?? [])
    .map((ref) => register.get(ref.toUpperCase()))
    .filter((item): item is RegisterItem => item !== undefined && item.open);
}
