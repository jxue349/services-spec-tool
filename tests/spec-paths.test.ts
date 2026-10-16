import { describe, expect, it } from 'vitest';
import { InvalidSpecPathError, assertSpecPath, isSpecPath, specLabel } from '@/lib/spec-paths';

/**
 * The spec path comes from the client and is handed to the GitHub Contents
 * API, so this is a security boundary. Covered exhaustively on purpose.
 */

const ROOT = 'spec';

describe('assertSpecPath — accepts', () => {
  it.each([
    'spec/parent.md',
    'spec/cam-plus/behavior.md',
    'spec/cam-plus/v2/behavior.md',
    'spec/Cam_Plus/BEHAVIOR.MD',
    'spec/a-b.c/d.md',
  ])('%s', (path) => {
    expect(assertSpecPath(path, ROOT)).toBe(path);
  });

  it('trims surrounding whitespace', () => {
    expect(assertSpecPath('  spec/parent.md  ', ROOT)).toBe('spec/parent.md');
  });
});

describe('assertSpecPath — rejects traversal and escapes', () => {
  it.each([
    ['parent directory', 'spec/../.env'],
    ['traversal mid-path', 'spec/cam-plus/../../package.json'],
    ['bare traversal', '../secrets.md'],
    ['dot segment', 'spec/./parent.md'],
    ['absolute path', '/spec/parent.md'],
    ['absolute outside', '/etc/passwd'],
    ['backslash', 'spec\\parent.md'],
    ['url-encoded traversal', 'spec/%2e%2e/.env'],
    ['double slash', 'spec//parent.md'],
    ['trailing slash', 'spec/parent.md/'],
  ])('%s', (_label, path) => {
    expect(() => assertSpecPath(path, ROOT)).toThrow(InvalidSpecPathError);
  });
});

describe('assertSpecPath — rejects outside the root', () => {
  it('a sibling directory that merely shares a prefix', () => {
    // The dangerous case: a naive startsWith('spec') check would allow this.
    expect(() => assertSpecPath('specials/secret.md', ROOT)).toThrow(/must be inside spec\//);
  });

  it('a file at the repo root', () => {
    expect(() => assertSpecPath('README.md', ROOT)).toThrow(/must be inside spec\//);
  });

  it('the root directory itself', () => {
    expect(() => assertSpecPath('spec', ROOT)).toThrow(InvalidSpecPathError);
  });

  it('honours a nested root', () => {
    expect(assertSpecPath('docs/spec/parent.md', 'docs/spec')).toBe('docs/spec/parent.md');
    expect(() => assertSpecPath('docs/other/parent.md', 'docs/spec')).toThrow(/must be inside docs\/spec\//);
  });
});

describe('assertSpecPath — rejects non-markdown', () => {
  it.each(['spec/.env', 'spec/config.json', 'spec/parent.md.txt', 'spec/parent'])('%s', (path) => {
    expect(() => assertSpecPath(path, ROOT)).toThrow(/must name a \.md file/);
  });
});

describe('assertSpecPath — rejects degenerate input', () => {
  it('empty', () => {
    expect(() => assertSpecPath('   ', ROOT)).toThrow(/is empty/);
  });

  it('over-long', () => {
    expect(() => assertSpecPath(`spec/${'a'.repeat(500)}.md`, ROOT)).toThrow(/too long/);
  });

  it('control characters', () => {
    expect(() => assertSpecPath('spec/par\u0000ent.md', ROOT)).toThrow(InvalidSpecPathError);
  });
});

describe('isSpecPath', () => {
  it('is the boolean form', () => {
    expect(isSpecPath('spec/parent.md', ROOT)).toBe(true);
    expect(isSpecPath('../x.md', ROOT)).toBe(false);
  });
});

describe('specLabel', () => {
  it('names the knowledge base in plain words, not as "parent"', () => {
    // "Parent" is internal vocabulary; the selector shows this to users.
    expect(specLabel('spec/parent.md', ROOT, 'spec/parent.md')).toBe('All rules');
  });

  it('uses the directory for a child spec', () => {
    expect(specLabel('spec/cam-plus/behavior.md', ROOT, 'spec/parent.md')).toBe('cam-plus');
  });

  it('uses the file stem for a loose file in the root', () => {
    expect(specLabel('spec/notes.md', ROOT, 'spec/parent.md')).toBe('notes');
  });
});

describe('specLabel with team folders', () => {
  const ROOT_T = 'specs';
  const PARENT = 'specs/services/parent.md';

  it('labels a spec by its own directory, not its team', () => {
    // The bug this fixes: every spec in a team showed the team's name.
    expect(specLabel('specs/services/cam-plus/behavior.md', ROOT_T, PARENT)).toBe('cam-plus');
    expect(specLabel('specs/services/upsell/behavior.md', ROOT_T, PARENT)).toBe('upsell');
  });

  it('distinguishes same-named specs in different teams', () => {
    expect(specLabel('specs/hardware/plugin-page/behavior.md', ROOT_T, PARENT)).toBe('plugin-page');
    expect(specLabel('specs/app-experience/plugin-page/behavior.md', ROOT_T, PARENT)).toBe('plugin-page');
  });

  it('still names the knowledge base', () => {
    expect(specLabel(PARENT, ROOT_T, PARENT)).toBe('All rules');
  });

  it('falls back to the stem for a file with no directory of its own', () => {
    expect(specLabel('specs/others/notes.md', ROOT_T, PARENT)).toBe('others');
    expect(specLabel('spec/notes.md', 'spec', PARENT)).toBe('notes');
  });
});
