import { describe, expect, it } from 'vitest';
import {
  UPLOAD_MAX_BYTES,
  UploadRejected,
  downloadFilename,
  looksRuleShaped,
  slugifySpecName,
  uploadPathFor,
  validateUpload,
} from '@/lib/spec-files';

/**
 * Download names end up pasted into tickets and email, so the version in them
 * has to be right or absent — never confidently wrong.
 */
describe('downloadFilename', () => {
  it('carries the version', () => {
    expect(downloadFilename('spec/parent.md', 12)).toBe('parent-v12.md');
  });

  it('uses the directory when the file is generically named', () => {
    // A repo of behavior.md files would otherwise all download as one name.
    expect(downloadFilename('spec/cam-plus/behavior.md', 3)).toBe('cam-plus-v3.md');
    expect(downloadFilename('spec/upsell/index.md', 1)).toBe('upsell-v1.md');
  });

  it('keeps a distinctive filename over its directory', () => {
    expect(downloadFilename('spec/misc/pricing-rules.md', 2)).toBe('pricing-rules-v2.md');
  });

  it('marks an inexact version with a plus rather than claiming precision', () => {
    expect(downloadFilename('spec/parent.md', 100, false)).toBe('parent-v100+.md');
  });

  it('handles a spec with no commits yet', () => {
    expect(downloadFilename('spec/parent.md', 0)).toBe('parent-v0.md');
  });

  it('strips characters that do not belong in a filename', () => {
    expect(downloadFilename('spec/cam plus & pro/behavior.md', 1)).toBe('cam-plus-pro-v1.md');
  });
});

describe('slugifySpecName', () => {
  it('turns a typed name into a directory segment', () => {
    expect(slugifySpecName('Cam Plus / Pro AI')).toBe('cam-plus-pro-ai');
    expect(slugifySpecName('  Upsell  Surfaces  ')).toBe('upsell-surfaces');
  });

  it('is empty when there is nothing usable', () => {
    expect(slugifySpecName('???')).toBe('');
  });

  it('bounds the length', () => {
    expect(slugifySpecName('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('uploadPathFor', () => {
  it('places a new spec in its own directory under the root', () => {
    expect(uploadPathFor('spec', 'Pro AI add-on')).toBe('spec/pro-ai-add-on/behavior.md');
  });

  it('refuses a name with nothing usable in it', () => {
    expect(() => uploadPathFor('spec', '///')).toThrow(/at least one letter or digit/);
  });

  it('cannot escape the spec root', () => {
    // Slugification strips the separators, so traversal cannot survive it.
    expect(uploadPathFor('spec', '../../etc/passwd')).toBe('spec/etc-passwd/behavior.md');
  });
});

describe('validateUpload', () => {
  it('accepts markdown and text', () => {
    for (const name of ['a.md', 'a.markdown', 'a.txt', 'A.MD']) {
      expect(() => validateUpload(name, '# spec')).not.toThrow();
    }
  });

  it('rejects other formats with advice', () => {
    expect(() => validateUpload('spec.pdf', 'x')).toThrow(/Export other formats to Markdown/);
    expect(() => validateUpload('spec.docx', 'x')).toThrow(UploadRejected);
  });

  it('rejects an empty file', () => {
    expect(() => validateUpload('a.md', '')).toThrow(/empty/);
  });

  it('rejects a file over the limit, naming the sizes', () => {
    const big = 'x'.repeat(UPLOAD_MAX_BYTES + 1);
    expect(() => validateUpload('a.md', big)).toThrow(/the limit is 100 KB/);
  });

  it('rejects something that is not text despite its extension', () => {
    expect(() => validateUpload('a.md', 'PK\u0000\u0000binary')).toThrow(/does not look like text/);
  });
});

describe('looksRuleShaped', () => {
  it('recognises a table-based rule spec', () => {
    const spec = [
      '| TIER-001 | a |',
      '| TIER-002 | b |',
      '| ADDON-005 | c |',
    ].join('\n');
    expect(looksRuleShaped(spec)).toBe(true);
  });

  it('recognises a bullet-based rule spec', () => {
    expect(looksRuleShaped('- **R-101** — a\n- **R-102** — b\n- **R-103** — c')).toBe(true);
  });

  it('does not mistake prose for a spec', () => {
    expect(looksRuleShaped('# PRD\n\nWe should build a thing. It will be good.')).toBe(false);
  });

  it('needs more than a passing mention to count', () => {
    expect(looksRuleShaped('See ADDON-005 for details.')).toBe(false);
  });
});
