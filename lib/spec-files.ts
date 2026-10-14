/**
 * Naming and shaping spec files for upload and download.
 *
 * Pure string work, kept out of the components because a download filename
 * is the thing people paste into tickets and email — getting the version into
 * it is the whole point, and a wrong one is worse than none.
 */

export const UPLOAD_MAX_BYTES = 100 * 1024;

/**
 * Download filename, carrying the version.
 *
 * `spec/cam-plus/behavior.md` at v3 -> `cam-plus-v3.md`
 * `spec/parent.md` at v12         -> `parent-v12.md`
 *
 * When the version is a floor rather than exact, it reads `v100+` so nobody
 * cites a precise version the tool could not actually confirm.
 */
export function downloadFilename(specPath: string, version: number, versionExact = true): string {
  const segments = specPath.split('/').filter((s) => s !== '');
  const file = segments[segments.length - 1] ?? 'spec.md';
  const stem = file.replace(/\.md$/i, '');
  const parent = segments.length >= 2 ? segments[segments.length - 2] : undefined;

  // A directory full of `behavior.md` files would all download as the same
  // name, so prefer the directory when the file itself is generically named.
  const base = /^(behavior|spec|index|readme)$/i.test(stem) && parent !== undefined ? parent : stem;

  const safe = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'spec';
  const label = version <= 0 ? 'v0' : versionExact ? `v${version}` : `v${version}+`;

  return `${safe}-${label}.md`;
}

/**
 * Turns a name a person typed into a directory segment.
 * "Cam Plus / Pro AI" -> "cam-plus-pro-ai"
 */
export function slugifySpecName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Repo path a newly uploaded spec will live at. */
export function uploadPathFor(specRoot: string, name: string): string {
  const slug = slugifySpecName(name);
  if (slug === '') throw new Error('Spec name must contain at least one letter or digit');
  return `${specRoot}/${slug}/behavior.md`;
}

export class UploadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejected';
  }
}

/**
 * Checks an uploaded file before it is allowed near the repo.
 *
 * Markdown only, bounded, and actually text: the spec pipeline treats this as
 * a document to be parsed and compiled, and a binary or an HTML export would
 * produce confident nonsense rather than an obvious failure.
 */
export function validateUpload(filename: string, content: string): void {
  if (!/\.(md|markdown|txt)$/i.test(filename)) {
    throw new UploadRejected('Upload a .md, .markdown or .txt file. Export other formats to Markdown first.');
  }

  const bytes = new TextEncoder().encode(content).length;
  if (bytes === 0) throw new UploadRejected('That file is empty.');
  if (bytes > UPLOAD_MAX_BYTES) {
    throw new UploadRejected(`That file is ${Math.round(bytes / 1024)} KB; the limit is ${UPLOAD_MAX_BYTES / 1024} KB.`);
  }

  // A NUL byte means this is not the text file its extension claims.
  if (content.includes('\u0000')) throw new UploadRejected('That file does not look like text.');
}

/**
 * Rough check for whether an upload already reads as a rule-based spec.
 *
 * Counts rule IDs in *definition* position — opening a table row or a list
 * item — so a PRD that merely cites a couple of rules in prose does not pass
 * as a spec. Both layouts count: real specs use tables, the seed uses bullets.
 */
export function looksRuleShaped(content: string): boolean {
  const ruleLike = content.match(
    /^[ \t]*(?:\|[ \t]*|[-*+][ \t]+)?(?:\*\*|__)?[A-Z][A-Z0-9]{0,15}-(?:R-)?\d{1,4}\b/gm,
  );
  return (ruleLike?.length ?? 0) >= 3;
}
