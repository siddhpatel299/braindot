'use client';

import { useCallback, useEffect, useState } from 'react';
import { extractHeadings } from '@/utils/markdown';

interface SpineProps {
  /** The working body — ticks follow what is on screen, not what is saved. */
  body: string;
  /** The editor's scroll container, where the rendered headings live. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Re-measures when the view changes, since edit and preview lay out differently. */
  viewMode: string;
}

/**
 * The note's headings, as ticks down the left margin.
 *
 * A slip-box card keeps its branch numbers in the margin beside the text. So
 * does this: the document's shape lives in horizontal space, which a wide
 * screen has to spare, instead of another bar across the top, which costs the
 * writer the one dimension they are short of.
 */
export function Spine({ body, scrollRef, viewMode }: SpineProps) {
  const headings = extractHeadings(body);
  const [current, setCurrent] = useState(0);

  // Track which heading the reader is under: the last one that has crossed the
  // top of the viewport. Passive listener — this must never fight the scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || headings.length === 0) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const marks = el.querySelectorAll<HTMLElement>('[data-h]');
      if (!marks.length) return;
      const line = el.getBoundingClientRect().top + 56;
      let active = 0;
      marks.forEach((mark) => {
        if (mark.getBoundingClientRect().top <= line) {
          active = Number(mark.getAttribute('data-h')) || 0;
        }
      });
      setCurrent(active);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, headings.length, viewMode, body]);

  const jumpTo = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      const mark = el?.querySelector<HTMLElement>(`[data-h="${index}"]`);
      if (!el || !mark) return;
      // Scroll the container rather than the page: the editor is the scroller,
      // and scrollIntoView would move the app shell on some browsers.
      // scrollTop is assigned directly rather than going through scrollTo with
      // behavior: 'smooth' — that is silently ignored in some engines, which
      // turns the whole tick into a dead click. A jump that lands is the point.
      const delta = mark.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTop = el.scrollTop + delta - 24;
      setCurrent(index);
    },
    [scrollRef],
  );

  // A note with no headings still gets a margin — just an empty one.
  if (headings.length === 0) {
    return (
      <div className="sb-spine" aria-hidden="true">
        <span className="sb-spine-rule" />
      </div>
    );
  }

  return (
    <nav
      className="sb-spine sb-no-scrollbar"
      aria-label="Sections in this note"
      style={{ maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}
    >
      {headings.map((h, i) => (
        <span className="sb-tick-wrap" key={`${i}-${h.text}`}>
          <button
            className="sb-tick"
            data-level={h.level}
            data-current={i === current ? 'true' : undefined}
            onClick={() => jumpTo(i)}
            aria-label={`Go to ${h.text}`}
            aria-current={i === current ? 'location' : undefined}
          />
          <span className="sb-tick-label" aria-hidden="true">{h.text}</span>
        </span>
      ))}
    </nav>
  );
}
