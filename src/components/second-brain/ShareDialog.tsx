'use client';

// The publish sheet.
//
// One decision, stated plainly: this becomes a page anyone with the link can
// read. Everything else on the panel is consequence — what the link is, how
// many pages went with it, how to take it back down.
//
// It deliberately does not resemble the app's other dialogs' quick in-and-out
// shape. Making something public is the one action here that reaches outside
// the vault, and it should take a beat.

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, Loader2, Lock, X } from 'lucide-react';
import type { PublicationSummary } from '@/hooks/usePublish';
import { publicUrl } from '@/utils/publish';

export interface ShareTarget {
  kind: 'note' | 'folder';
  id: string;
  title: string;
  /** How many notes go public if this is published. Counted by the caller,
   *  which is the side that has the folder tree. */
  noteCount: number;
  /** Device-local images that will be uploaded to make them visible. */
  imageCount: number;
}

interface Props {
  target: ShareTarget | null;
  publication: PublicationSummary | undefined;
  busy: boolean;
  onClose: () => void;
  onPublish: (indexable: boolean) => Promise<{ ok: boolean; error?: string }>;
  onUnpublish: () => Promise<{ ok: boolean; error?: string }>;
}

export function ShareDialog({
  target, publication, busy, onClose, onPublish, onUnpublish,
}: Props) {
  const [indexable, setIndexable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const published = publication !== undefined;
  const url = publication ? publicUrl(publication.slug) : '';
  const publishedIndexable = publication?.indexable;

  /* Keyed on the indexable *value*, not the publication object. Convex hands
     back a fresh object on every subscription update, and depending on that
     identity meant an update landing while the panel was open would reset the
     checkbox under the author's cursor. */
  useEffect(() => {
    if (!target) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setIndexable(publishedIndexable ?? false);
    setError(null);
    setCopied(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [target, publishedIndexable]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, busy, onClose]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  if (!target) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not reach the clipboard — select the link and copy it.');
    }
  };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', padding: 20,
      }}
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${target.title}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--bg1)',
          border: '1px solid var(--bd)',
          borderRadius: 8,
          boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px', borderBottom: '1px solid var(--bd)',
        }}>
          {published
            ? <Globe size={14} strokeWidth={2} style={{ color: 'var(--grn)', flexShrink: 0 }} />
            : <Lock size={14} strokeWidth={2} style={{ color: 'var(--t3)', flexShrink: 0 }} />}
          <span style={{ fontSize: 12, color: 'var(--t1)', letterSpacing: '0.02em' }}>
            {published ? 'published to the web' : 'share to the web'}
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              marginLeft: 'auto', width: 22, height: 22, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none',
              color: 'var(--t3)', cursor: busy ? 'default' : 'pointer',
            }}
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{
            fontSize: 14, color: 'var(--t1)', marginBottom: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {target.title || (target.kind === 'folder' ? 'Untitled folder' : 'Untitled')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.02em' }}>
            {target.kind === 'folder'
              ? `folder · ${plural(target.noteCount, 'note')} inside`
              : 'note'}
          </div>

          {published ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'stretch', gap: 0,
                marginTop: 16, border: '1px solid var(--bd)', borderRadius: 5,
                overflow: 'hidden', background: 'var(--bg2)',
              }}>
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    flex: 1, minWidth: 0, padding: '9px 10px',
                    background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--t2)', fontSize: 11.5,
                  }}
                />
                <button
                  onClick={copy}
                  title="Copy link"
                  style={{
                    width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg3)', border: 'none', borderLeft: '1px solid var(--bd)',
                    color: copied ? 'var(--grn)' : 'var(--t2)', cursor: 'pointer',
                  }}
                >
                  {copied
                    ? <Check size={13} strokeWidth={2.2} />
                    : <Copy size={13} strokeWidth={2} />}
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the published page"
                  style={{
                    width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--bg3)', border: 'none', borderLeft: '1px solid var(--bd)',
                    color: 'var(--t2)',
                  }}
                >
                  <ExternalLink size={13} strokeWidth={2} />
                </a>
              </div>

              {/* The point of a snapshot, said out loud. Nobody should have to
                  discover by accident that their edits are not on the page. */}
              <p style={hintStyle}>
                Published {plural(publication.pageCount, 'page')} on{' '}
                {new Date(publication.updatedAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
                . Edits since then are not on it — update the page to send them.
              </p>
            </>
          ) : (
            <p style={hintStyle}>
              Anyone with the link can read it. No account, no sign-in.
              {target.kind === 'folder' && ' Every note inside, and every subfolder, goes with it.'}
            </p>
          )}

          {!published && target.imageCount > 0 && (
            <p style={hintStyle}>
              {plural(target.imageCount, 'image')} {target.imageCount === 1 ? 'is' : 'are'} stored
              only on this device. Publishing uploads {target.imageCount === 1 ? 'it' : 'them'} so
              readers can see {target.imageCount === 1 ? 'it' : 'them'} — after which{' '}
              {target.imageCount === 1 ? 'it' : 'they'} will work on your other devices too.
            </p>
          )}

          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              marginTop: 14, cursor: busy ? 'default' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={indexable}
              disabled={busy}
              onChange={(e) => setIndexable(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--acc)' }}
            />
            <span style={{ fontSize: 11.5, color: 'var(--t2)', lineHeight: 1.5 }}>
              Let search engines index it
              <span style={{ color: 'var(--t3)' }}>
                {' '}— off means unlisted: reachable by link, not by searching.
              </span>
            </span>
          </label>

          {error && (
            <p style={{
              margin: '14px 0 0', padding: '8px 10px',
              background: 'var(--red-bg)',
              border: '1px solid var(--bd)', borderRadius: 5,
              fontSize: 11.5, lineHeight: 1.5, color: 'var(--red)',
            }}>
              {error}
            </p>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '11px 14px', borderTop: '1px solid var(--bd)', background: 'var(--bg2)',
        }}>
          {published && (
            <button
              onClick={() => run(onUnpublish)}
              disabled={busy}
              style={{
                ...buttonStyle,
                background: 'transparent',
                border: '1px solid var(--bd)',
                color: 'var(--red)',
              }}
            >
              Unpublish
            </button>
          )}
          <button
            onClick={() => run(() => onPublish(indexable))}
            disabled={busy}
            style={{
              ...buttonStyle,
              marginLeft: 'auto',
              background: 'var(--acc)',
              border: '1px solid var(--acc)',
              color: 'var(--on-acc)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {busy && <Loader2 size={12} strokeWidth={2.4} className="sb-spin" />}
            {published ? 'Update page' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 5,
  fontSize: 11.5,
  letterSpacing: '0.02em',
  cursor: 'pointer',
};

const hintStyle: React.CSSProperties = {
  margin: '14px 0 0',
  fontSize: 11.5,
  lineHeight: 1.55,
  color: 'var(--t3)',
};

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
