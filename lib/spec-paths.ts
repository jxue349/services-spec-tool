/**
 * Validation for spec paths that arrive from the client.
 *
 * The selector sends a repo path, and that path goes straight into a GitHub
 * Contents call. Without a check, a crafted value reads (or writes) any file
 * in the repo, so this is a security boundary, not a tidiness helper: the path
 * must stay inside the configured spec root, must be a markdown file, and must
 * not contain traversal or absolute segments.
 *
 * Pure string work — no network, no env — so it is cheap to test exhaustively.
 */

export class InvalidSpecPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSpecPathError';
  }
}

const MAX_PATH_LENGTH = 400;

/**
 * Returns the normalised path, or throws InvalidSpecPathError.
 *
 * `root` is trusted (it comes from the environment); `candidate` is not.
 */
export function assertSpecPath(candidate: string, root: string): string {
  const raw = candidate.trim();

  if (raw === '') throw new InvalidSpecPathError('Spec path is empty');
  if (raw.length > MAX_PATH_LENGTH) throw new InvalidSpecPathError('Spec path is too long');

  // Reject before normalising: a backslash or NUL means the caller is not
  // sending a plain repo path, and URL-encoded traversal should not be decoded
  // into something that passes.
  if (raw.includes('\\')) throw new InvalidSpecPathError('Spec path must use forward slashes');
  if (/[\u0000-\u001f]/.test(raw)) throw new InvalidSpecPathError('Spec path contains control characters');
  if (raw.includes('%')) throw new InvalidSpecPathError('Spec path must not be URL-encoded');
  if (raw.startsWith('/')) throw new InvalidSpecPathError('Spec path must be relative to the repo root');

  const segments = raw.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new InvalidSpecPathError('Spec path must not contain empty or traversal segments');
  }

  if (!/\.md$/i.test(raw)) throw new InvalidSpecPathError('Spec path must name a .md file');

  // Confine to the spec root. Compared segment-wise so "specials/x.md" cannot
  // pass as being inside "spec".
  const rootSegments = root.split('/').filter((segment) => segment !== '');
  if (rootSegments.length > 0) {
    const insideRoot =
      segments.length > rootSegments.length && rootSegments.every((segment, i) => segments[i] === segment);
    if (!insideRoot) throw new InvalidSpecPathError(`Spec path must be inside ${root}/`);
  }

  return raw;
}

/** True when `candidate` is acceptable, for places that want a boolean. */
export function isSpecPath(candidate: string, root: string): boolean {
  try {
    assertSpecPath(candidate, root);
    return true;
  } catch {
    return false;
  }
}

/**
 * Display label for a spec: the directory the spec itself lives in.
 *
 * Takes the *last* directory rather than the first under the root, because
 * with teams the first is the team — `specs/services/cam-plus/behavior.md`
 * must read "cam-plus", not "services", or every spec in a team shares one
 * label. A file with no directory of its own falls back to its stem.
 */
export function specLabel(path: string, root: string, parentPath: string): string {
  // "All rules", not "Parent spec": the option already sits under a
  // "Knowledge base" group, and "parent" is internal vocabulary that told a
  // reader nothing about what the document contains.
  if (path === parentPath) return 'All rules';

  const rootSegments = root.split('/').filter((s) => s !== '');
  const segments = path.split('/').slice(rootSegments.length).filter((s) => s !== '');
  const stem = (segments[segments.length - 1] ?? path).replace(/\.md$/i, '');
  const dir = segments[segments.length - 2];

  // In the folder layout the enclosing directory is the same word for every
  // file — sixteen rule files would all read "rules". The filename is what
  // distinguishes them, so it wins there.
  if (dir === 'rules' || dir === 'golden-qa') return stem;

  if (segments.length >= 2) return dir ?? path;
  return stem;
}
