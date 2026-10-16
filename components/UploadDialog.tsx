'use client';

import { useRef, useState } from 'react';
import { Button, ErrorNote, SectionLabel } from './ui';
import { uploadSpec } from '@/lib/client/api';
import { UPLOAD_MAX_BYTES, UploadRejected, looksRuleShaped, slugifySpecName, validateUpload } from '@/lib/spec-files';
import type { CommitResponse } from '@/lib/schemas';

/**
 * Uploads a new spec as version 1.
 *
 * Validates in the browser before anything is sent — a 90 KB PDF rejected
 * instantly beats one rejected after a round trip — and shows the path the
 * spec will occupy, because where a document lands in the repo is the part
 * people get wrong and only discover in review.
 */
export function UploadDialog({
  open,
  specRoot,
  onClose,
  onUploaded,
}: {
  open: boolean;
  specRoot: string;
  onClose: () => void;
  onUploaded: (specPath: string) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<{ filename: string; content: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(CommitResponse & { specPath: string }) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const reset = () => {
    setName('');
    setNote('');
    setFile(null);
    setError(null);
    setResult(null);
  };

  const pick = async (picked: File | undefined) => {
    setError(null);
    if (picked === undefined) return;

    try {
      const content = await picked.text();
      validateUpload(picked.name, content);
      setFile({ filename: picked.name, content });
      // Default the spec name to the filename, which is usually close enough.
      if (name.trim() === '') setName(picked.name.replace(/\.(md|markdown|txt)$/i, ''));
    } catch (err) {
      setFile(null);
      setError(err instanceof UploadRejected ? err : new Error('Could not read that file.'));
    }
  };

  const slug = slugifySpecName(name);
  const targetPath = slug === '' ? null : `${specRoot}/${slug}/behavior.md`;
  const ruleShaped = file === null ? null : looksRuleShaped(file.content);

  const submit = async () => {
    if (file === null || targetPath === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await uploadSpec({
        name: name.trim(),
        filename: file.filename,
        content: file.content,
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
      });
      setResult(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Upload a new spec</h3>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-inkDim hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {result ? (
          <div className="space-y-3 px-4 py-4 text-xs">
            <div className="rounded-md border border-accent/50 bg-accent/10 px-3 py-3 text-accent">
              <div className="font-medium">Uploaded as v1 — pull request opened.</div>
              <div className="mt-1 font-mono text-[10px] text-accent/80">{result.specPath}</div>
              {result.prUrl ? (
                <a
                  href={result.prUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-block underline underline-offset-2"
                >
                  Review it on GitHub →
                </a>
              ) : null}
              <p className="mt-2 text-[11px] text-accent/80">
                It becomes selectable here once the pull request merges.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  onUploaded(result.specPath);
                  reset();
                  onClose();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4">
            {error ? <ErrorNote error={error} onDismiss={() => setError(null)} /> : null}

            <div className="space-y-1">
              <SectionLabel>Spec file</SectionLabel>
              <input
                ref={inputRef}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={(e) => void pick(e.target.files?.[0])}
                className="w-full text-xs text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-panelAlt file:px-3 file:py-1.5 file:text-xs file:text-ink hover:file:border-accent/60"
              />
              <p className="font-mono text-[10px] text-inkDim">
                Markdown or plain text, up to {UPLOAD_MAX_BYTES / 1024} KB.
              </p>
            </div>

            {file ? (
              <>
                <label className="block space-y-1">
                  <SectionLabel>Spec name</SectionLabel>
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Pro AI add-on"
                    className="w-full rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
                  />
                  <p className="font-mono text-[10px] text-inkDim">
                    {targetPath ? `will be created at ${targetPath}` : 'needs at least one letter or digit'}
                  </p>
                </label>

                {ruleShaped === false ? (
                  <div className="rounded-md border border-secondary/50 bg-secondary/10 px-3 py-2 text-[11px] leading-relaxed text-ink">
                    This file does not look rule-shaped — the other tabs expect numbered rules like{' '}
                    <span className="font-mono">ADDON-001</span>. It will upload as-is, but distil it into rules before
                    expecting much from the other tabs.
                  </div>
                ) : null}

                <label className="block space-y-1">
                  <SectionLabel>Note for reviewers (optional)</SectionLabel>
                  <textarea
                    value={note}
                    rows={3}
                    maxLength={2000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Where this came from, and what still needs deciding."
                    className="scroll-thin w-full resize-none rounded-md border border-line bg-panelAlt px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/60"
                  />
                </label>

                <details className="rounded-md border border-line bg-panelAlt">
                  <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-inkDim hover:text-ink">
                    Preview ({(new TextEncoder().encode(file.content).length / 1024).toFixed(1)} KB)
                  </summary>
                  <pre className="scroll-thin max-h-48 overflow-auto border-t border-line px-3 py-2 font-mono text-[10px] leading-relaxed text-inkDim">
                    {file.content.slice(0, 2000)}
                    {file.content.length > 2000 ? '\n…' : ''}
                  </pre>
                </details>
              </>
            ) : null}

            <p className="font-mono text-[10px] text-inkDim">
              Uploads open a pull request, like every other spec change.
            </p>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={file === null || targetPath === null}
                onClick={() => void submit()}
              >
                Upload as v1
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
