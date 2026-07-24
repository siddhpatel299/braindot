// Measure the viewport position of the caret inside a textarea by
// mirroring its text into a hidden div and reading the offset of a
// sentinel span. Used to anchor the slash menu and wiki-link
// autocomplete at the caret instead of a fixed corner.

const MIRROR_PROPS = [
  'boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'lineHeight', 'letterSpacing', 'textTransform', 'textIndent',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
] as const;

export function getCaretCoordinates(
  ta: HTMLTextAreaElement,
  pos: number,
): { x: number; y: number } {
  const style = window.getComputedStyle(ta);
  const div = document.createElement('div');
  for (const prop of MIRROR_PROPS) {
    div.style[prop as unknown as number] = style.getPropertyValue(
      prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()),
    );
  }
  div.style.position = 'absolute';
  div.style.top = '0';
  div.style.left = '-9999px';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.overflow = 'hidden';

  div.textContent = ta.value.substring(0, pos);
  const span = document.createElement('span');
  span.textContent = ta.value.substring(pos, pos + 1) || '.';
  div.appendChild(span);
  document.body.appendChild(div);

  const rect = ta.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const x = rect.left + span.offsetLeft - ta.scrollLeft;
  const y = rect.top + span.offsetTop - ta.scrollTop + lineHeight;
  document.body.removeChild(div);
  return { x, y };
}

/** Clamp a menu anchor so a menu of the given size stays on screen. */
export function clampToViewport(
  pos: { x: number; y: number },
  menuWidth: number,
  menuHeight: number,
): { x: number; y: number } {
  const x = Math.min(Math.max(8, pos.x), window.innerWidth - menuWidth - 8);
  let y = pos.y;
  if (y + menuHeight > window.innerHeight - 8) {
    // Flip above the caret line
    y = Math.max(8, pos.y - menuHeight - 24);
  }
  return { x, y };
}
