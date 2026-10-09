/**
 * Retrieval over a spec document.
 *
 * The parent knowledge base is already 74 KB and grows every time a child
 * spec is distilled into it. Sending the whole document with every question
 * stops being viable well before it stops fitting, so Ask selects the rules
 * that bear on the question and sends only those.
 *
 * Deliberately lexical rather than embedding-based: rule text is dense with
 * exact identifiers (`cam-plus-monthly`, `GW_WBDC`, `ADDON-011`) that a
 * support question tends to quote verbatim, and an exact-term match on those
 * beats semantic similarity. It also needs no index to build or keep fresh.
 */

export type RuleBlock = {
  /** Rule id, when the block declares one. */
  id: string | null;
  /** Nearest preceding heading, for context. */
  section: string;
  /** The rule's own text, as written. */
  text: string;
  /** Status marker the spec carries, e.g. "Confirmed", "Unverified". */
  status: RuleStatus | null;
  line: number;
};

export type RuleStatus = 'confirmed' | 'unverified' | 'open' | 'superseded';

const ID_CORE = String.raw`[A-Z][A-Z0-9]{0,15}-(?:R-)?\d{1,4}`;

/** Status vocabulary used by the knowledge base, matched case-insensitively. */
function statusOf(text: string): RuleStatus | null {
  if (/⛔|\bsuperseded\b/i.test(text)) return 'superseded';
  if (/🔴|\bopen\b(?!\s*source)/i.test(text)) return 'open';
  if (/⚠️|\bunverified\b/i.test(text)) return 'unverified';
  if (/✅|\bconfirmed\b/i.test(text)) return 'confirmed';
  return null;
}

/**
 * Splits a spec into rule blocks: one per table row or list item that declares
 * a rule id, plus the heading it sits under.
 */
export function parseRuleBlocks(spec: string): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  const lines = spec.split('\n');

  let section = '';
  const tableRow = new RegExp(`^\\s*\\|\\s*(?:\\*\\*|__)?(${ID_CORE})(?:\\*\\*|__)?\\s*\\|(.*)$`);
  const listItem = new RegExp(`^\\s*[-*+]\\s+(?:\\*\\*|__)?(${ID_CORE})(?:\\*\\*|__)?\\b(.*)$`);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      section = (heading[2] ?? '').trim();
      continue;
    }

    const row = tableRow.exec(line);
    if (row) {
      blocks.push({
        id: row[1] ?? null,
        section,
        text: line.trim(),
        status: statusOf(row[2] ?? ''),
        line: i,
      });
      continue;
    }

    const item = listItem.exec(line);
    if (item) {
      // A list rule can wrap onto indented continuation lines.
      let text = line.trim();
      let j = i + 1;
      while (j < lines.length && /^\s{2,}\S/.test(lines[j] ?? '') && !/^\s*[-*+]\s/.test(lines[j] ?? '')) {
        text += ` ${(lines[j] ?? '').trim()}`;
        j += 1;
      }
      blocks.push({ id: item[1] ?? null, section, text, status: statusOf(text), line: i });
      i = j - 1;
    }
  }

  return blocks;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'and', 'or', 'but', 'if', 'then', 'than', 'that',
  'this', 'these', 'those', 'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'it', 'its', 'can',
  'does', 'do', 'did', 'what', 'when', 'where', 'who', 'why', 'how', 'will', 'would', 'should', 'could', 'i',
  'you', 'we', 'they', 'my', 'our', 'their', 'there', 'has', 'have', 'had', 'not', 'no', 'any', 'all', 'about',
]);

/**
 * Light stemming, so a question's wording does not have to match the spec's.
 *
 * "what cameras are supported" must reach "Supported camera types" — without
 * this, support/supported and model/models are different terms and the rule
 * that answers the question ranks below rules that merely share a noun.
 *
 * Deliberately conservative: only plain alphabetic words longer than four
 * characters are stemmed, so identifiers like `feature-cloud-60`, `GW_WBDC`
 * and `cam-plus-monthly` survive untouched — matching those exactly is the
 * whole reason this is lexical.
 */
export function stem(token: string): string {
  if (token.length <= 4 || !/^[a-z]+$/.test(token)) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses') || token.endsWith('shes') || token.endsWith('ches')) return token.slice(0, -2);
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** Lowercased, lightly stemmed content terms; identifier tokens kept intact. */
export function terms(input: string): string[] {
  return (input.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [])
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
}

export type ScoredBlock = RuleBlock & { score: number };

/**
 * Ranks rule blocks against a question.
 *
 * An explicit rule id in the question is decisive — someone asking about
 * ADDON-011 wants ADDON-011 — so it outranks any amount of term overlap.
 */
export function rankBlocks(blocks: readonly RuleBlock[], question: string): ScoredBlock[] {
  const qTerms = terms(question);
  const qSet = new Set(qTerms);
  const askedIds = new Set(
    (question.toUpperCase().match(new RegExp(ID_CORE, 'g')) ?? []).map((id) => id.toUpperCase()),
  );

  // Rarer terms carry more signal than ones every rule happens to contain.
  const docFreq = new Map<string, number>();
  for (const block of blocks) {
    for (const t of new Set(terms(block.text))) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const total = Math.max(1, blocks.length);

  return blocks
    .map((block) => {
      let score = 0;

      if (block.id !== null && askedIds.has(block.id.toUpperCase())) score += 1_000;

      for (const t of new Set(terms(block.text))) {
        if (!qSet.has(t)) continue;
        const idf = Math.log(total / (1 + (docFreq.get(t) ?? 0)));
        score += Math.max(0.1, idf);
      }

      // A section heading that matches the question is weak but real evidence.
      for (const t of new Set(terms(block.section))) if (qSet.has(t)) score += 0.3;

      // Superseded rules are history; never let one outrank a live rule.
      if (block.status === 'superseded') score *= 0.25;

      return { ...block, score };
    })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score || a.line - b.line);
}

export type RetrievedContext = {
  /** Rule blocks to send, highest scoring first. */
  blocks: ScoredBlock[];
  /** Characters of spec text selected. */
  chars: number;
  /** True when the whole spec was small enough to send as-is. */
  wholeDocument: boolean;
};

/** Below this, retrieval is pointless — send the whole document. */
export const WHOLE_DOCUMENT_LIMIT = 12_000;
/** Budget for selected rules; comfortably inside a single prompt. */
export const CONTEXT_BUDGET = 24_000;

export function retrieveContext(
  spec: string,
  question: string,
  budget: number = CONTEXT_BUDGET,
): RetrievedContext {
  if (spec.length <= WHOLE_DOCUMENT_LIMIT) {
    return { blocks: [], chars: spec.length, wholeDocument: true };
  }

  const ranked = rankBlocks(parseRuleBlocks(spec), question);

  const chosen: ScoredBlock[] = [];
  let chars = 0;
  for (const block of ranked) {
    if (chars + block.text.length > budget) break;
    chosen.push(block);
    chars += block.text.length;
  }

  return { blocks: chosen, chars, wholeDocument: false };
}

/** Renders selected rules for the prompt, grouped under their sections. */
export function renderContext(context: RetrievedContext, spec: string): string {
  if (context.wholeDocument) return spec;

  const bySection = new Map<string, ScoredBlock[]>();
  for (const block of context.blocks) {
    const list = bySection.get(block.section) ?? [];
    list.push(block);
    bySection.set(block.section, list);
  }

  const parts: string[] = [];
  for (const [section, blocks] of bySection) {
    parts.push(section === '' ? '## (no section)' : `## ${section}`);
    // Restore document order inside a section so rules read naturally.
    for (const block of [...blocks].sort((a, b) => a.line - b.line)) parts.push(block.text);
    parts.push('');
  }
  return parts.join('\n').trim();
}
