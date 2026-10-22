import { describe, expect, it } from 'vitest';
import { Lexer } from 'marked';
import type { Tokens } from 'marked';
import { testsToMarkdown } from '@/lib/client/export';
import { renderConflictBody } from '@/lib/cross-team';
import { markdownTableCode, markdownTableText } from '@/lib/markdown-table';
import type { TestCase } from '@/lib/schemas';

/**
 * Parses Markdown with a GFM renderer and returns each table's body rows as
 * the text a reader would see in every cell — so these tests check rendered
 * cell boundaries, not the shape of the escaping.
 */
function renderedTables(markdown: string): string[][][] {
  const tables = Lexer.lex(markdown, { gfm: true }).filter((t): t is Tokens.Table => t.type === 'table');
  return tables.map((table) => table.rows.map((row) => row.map((cell) => visibleText(cell.tokens))));
}

type InlineToken = { type: string; text?: string; tokens?: InlineToken[] };

function visibleText(tokens: readonly InlineToken[]): string {
  return tokens
    .map((t) => {
      // Raw HTML would be markup, not text: surface it so a test can fail on it.
      if (t.type === 'html') return `[html:${t.text ?? ''}]`;
      if (t.tokens !== undefined && t.type !== 'text') return visibleText(t.tokens);
      return t.text ?? '';
    })
    .join('');
}

/** One row of the given cells through the encoder, as a table. */
function table(cells: readonly string[], encode: (value: string) => string = markdownTableText): string[] {
  const header = `| ${cells.map((_, i) => `c${i}`).join(' | ')} |`;
  const divider = `| ${cells.map(() => '---').join(' | ')} |`;
  const row = `| ${cells.map(encode).join(' | ')} |`;
  const rendered = renderedTables([header, divider, row].join('\n'));
  expect(rendered).toHaveLength(1);
  expect(rendered[0]).toHaveLength(1);
  return rendered[0]![0]!;
}

describe('markdownTableText', () => {
  it.each([
    ['a pipe', 'Renewal fails on iOS | mid-term'],
    ['several pipes', 'a|b||c |'],
    ['a backslash already before a pipe', 'path\\|rest'],
    ['repeated backslashes before a pipe', 'a\\\\|b\\\\\\|c'],
    ['a trailing backslash', 'ends with \\'],
    ['Markdown escapes', 'literal \\* and \\_ stay literal'],
    ['HTML-like text', 'User enters <script>alert(1)</script> | <img src=x onerror=alert(1)>'],
    ['backticks around a pipe', 'run `a\\|b` then `c | d`'],
  ])('keeps %s inside one cell, rendered as written', (_, value) => {
    expect(table([value, 'next'])).toEqual([value, 'next']);
  });

  it.each([
    ['LF', 'first\nsecond'],
    ['CRLF', 'first\r\nsecond'],
    ['a lone CR', 'first\rsecond'],
    ['blank lines and indentation', 'first\n\n   second'],
  ])('flattens %s to one line without ending the row', (_, value) => {
    expect(table([value, 'next'])).toEqual(['first second', 'next']);
  });

  it('trims surrounding whitespace', () => {
    expect(markdownTableText('  \n padded \r\n ')).toBe('padded');
  });
});

describe('markdownTableCode', () => {
  it('writes an ordinary identifier as a code span', () => {
    expect(markdownTableCode('SVC-ENT-007')).toBe('`SVC-ENT-007`');
    expect(table(['SVC-ENT-007'], markdownTableCode)).toEqual(['SVC-ENT-007']);
  });

  it.each([
    ['a pipe', 'R-1 | R-2'],
    ['a backslash before a pipe', 'R-1\\|R-2'],
    ['a backtick', 'R-1` | `R-2'],
  ])('falls back to escaped text for %s, keeping one cell', (_, value) => {
    expect(table([value, 'next'], markdownTableCode)).toEqual([value, 'next']);
  });
});

describe('Markdown tables built from user and model text', () => {
  const hostile = 'a\\|b | c\r\nd <b>e</b>';

  it('keeps the QA matrix export to six cells per row', () => {
    const tests: TestCase[] = [
      { id: 'T-01', scenario: hostile, expected: hostile, priority: 'P1', rules: ['R-302'], inPrototype: false },
    ];
    const [rows] = renderedTables(testsToMarkdown(tests));
    expect(rows).toEqual([['T-01', 'P1', 'a\\|b | c d <b>e</b>', 'a\\|b | c d <b>e</b>', 'R-302', 'no']]);
  });

  it('keeps the cross-team conflict table to three cells per row', () => {
    const body = renderConflictBody({
      topic: 'x',
      positions: [
        { team: hostile, ruleId: 'SVC-ENT-007', says: hostile },
        { team: 'HW Team', ruleId: 'HW-004\\|x', says: 'Treated as cancelled.' },
      ],
      owningTeam: 'HW Team',
      reportedBy: null,
      followers: [],
    });
    const [rows] = renderedTables(body);
    expect(rows).toEqual([
      ['a\\|b | c d <b>e</b>', 'SVC-ENT-007', 'a\\|b | c d <b>e</b>'],
      ['HW Team', 'HW-004\\|x', 'Treated as cancelled.'],
    ]);
  });
});
