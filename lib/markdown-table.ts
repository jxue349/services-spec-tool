/**
 * Cell encoders for GitHub-Flavored Markdown tables.
 *
 * A table row ends at a line break and a cell ends at an unescaped pipe, so
 * cell text is flattened to one line and both backslashes and pipes are
 * escaped. Escaping only the pipe is not enough: a backslash already before
 * a pipe turns `\|` into `\\|`, an escaped backslash followed by a real
 * cell boundary. `<` is escaped too, so HTML-like text (a QA scenario about
 * `<script>` input, say) shows as written instead of becoming markup that a
 * renderer strips or runs, and so are backticks, because a code span would
 * show the backslashes added inside it. Other inline Markdown, such as
 * emphasis, is kept.
 */

/** Collapses every line break (LF, CRLF, lone CR) and its surrounding space. */
function singleLine(value: string): string {
  return value.replace(/\s*(?:\r\n?|\n)\s*/g, ' ').trim();
}

/** A plain-text table cell. */
export function markdownTableText(value: string): string {
  return singleLine(value).replace(/[\\|<`]/g, '\\$&');
}

/**
 * A table cell holding a code span, for identifiers like rule IDs.
 *
 * Backslash escapes do not apply inside code spans, so a value with a
 * backtick, backslash or pipe cannot be written as one faithfully; it falls
 * back to an escaped plain-text cell instead.
 */
export function markdownTableCode(value: string): string {
  const text = singleLine(value);
  return /^[^`\\|]+$/.test(text) ? `\`${text}\`` : markdownTableText(text);
}
