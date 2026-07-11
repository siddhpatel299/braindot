# Second Brain — Light / Dark Mode Toggle (incremental prompt)

> For an EXISTING Second Brain app already built in dark mode.
> This adds a complete light mode + a toggle to switch between them.
> Paste as a follow-up to your vibe coding tool.

---

## What to build

Add a theme toggle (sun/moon icon button) to the existing topbar, right
side, before the "+ new note" CTA. Clicking it switches the entire app
between dark mode (already built) and light mode (defined below).
Persist the user's choice in localStorage. Respect `prefers-color-scheme`
on first load if no preference is saved yet.

---

## How to implement it

### 1. CSS variable swap — do NOT duplicate components

The entire theme switch happens by toggling a `data-theme` attribute on
`<html>` (or `<body>`) between `"dark"` and `"light"`. ALL colors are
defined as CSS variables. Swapping the attribute swaps the colors.
No component code changes. No conditional class names in JSX.

```css
/* dark mode (default, already exists — rename yours to match) */
[data-theme="dark"] {
  --bg:       #0c0c0e;
  --bg1:      #111113;
  --bg2:      #171719;
  --bg3:      #1e1e21;
  --bg4:      #26262a;
  --bd:       #252528;
  --bd2:      #333338;
  --t1:       #f0f0f2;
  --t2:       #888894;
  --t3:       #444450;
  --acc:      #7c6ef7;
  --acc2:     #b0a8fb;
  --acc-bg:   #1a1830;
  --acc-bd:   #3d378a;
  --grn:      #34d399;
  --grn-bg:   #0a1f16;
  --grn-bd:   #1a4a2a;
  --amb:      #fbbf24;
  --amb-bg:   #1c1608;
  --amb-bd:   #4a3010;
  --blu:      #60a5fa;
  --blu-bg:   #0c1f2e;
  --blu-bd:   #0f3a50;
  --red:      #f87171;
  --red-bg:   #2a0f0f;
  --coral:    #f0997b;
  --coral-bg: #2a160c;
  --coral-bd: #4a2515;
}

/* light mode — add this block */
[data-theme="light"] {
  --bg:       #f5f5f3;
  --bg1:      #ffffff;
  --bg2:      #f0efed;
  --bg3:      #e8e7e4;
  --bg4:      #dddcda;
  --bd:       #e0dedd;
  --bd2:      #cccbc8;
  --t1:       #1a1a18;
  --t2:       #5a5a56;
  --t3:       #9a9994;
  --acc:      #5b4fe8;
  --acc2:     #4338ca;
  --acc-bg:   #eeecfd;
  --acc-bd:   #c7c3f5;
  --grn:      #0f7a56;
  --grn-bg:   #e8f7f1;
  --grn-bd:   #6ee7b7;
  --amb:      #b45309;
  --amb-bg:   #fef3c7;
  --amb-bd:   #fcd34d;
  --blu:      #1d6fa4;
  --blu-bg:   #e8f2fb;
  --blu-bd:   #93c5fd;
  --red:      #b91c1c;
  --red-bg:   #fef2f2;
  --coral:    #c2410c;
  --coral-bg: #fff7ed;
  --coral-bd: #fed7aa;
}
```

Apply the default theme on `<html>` at load time:

```javascript
const saved = localStorage.getItem('sb-theme')
const system = window.matchMedia('(prefers-color-scheme: light)').matches
  ? 'light' : 'dark'
document.documentElement.setAttribute('data-theme', saved ?? system)
```

### 2. Toggle logic

```javascript
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme')
  const next = current === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  localStorage.setItem('sb-theme', next)
}
```

### 3. Toggle button (add to existing topbar)

Place between the streak chip and the "+ new note" button:

```tsx
<button
  onClick={toggleTheme}
  className="tb-btn"
  aria-label="Toggle theme"
  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
  <i className={`ti ti-${theme === 'dark' ? 'sun' : 'moon'}`} />
</button>
```

- Dark mode: shows sun icon (`ti-sun`)
- Light mode: shows moon icon (`ti-moon`)
- No label text — icon only, same style as other topbar icon buttons
- No animation needed — instant swap is fine

---

## Light mode design decisions

These are intentional — don't "improve" them:

**Background:** `#f5f5f3` not pure white. Pure white with JetBrains Mono
reads like a terminal receipt. The warm off-white keeps the "thinking
tool" feel.

**Accent purple darkened:** `#5b4fe8` in light (vs `#7c6ef7` in dark).
Same hue, darkened so it stays readable as text AND as a border on light
backgrounds. `--acc2` becomes `#4338ca` (even darker) for the same reason.

**Active rail icon background:** `--acc-bg` (`#eeecfd`) with border
`--acc-bd` (`#c7c3f5`) — purple tint on white, not the near-black
`#1a1830` used in dark mode.

**Tag chips same hue, lighter backgrounds:**
- `#strategy` tag: `#eeecfd` bg, `#4338ca` text, `#c7c3f5` border
- `#learning` tag: `#e8f7f1` bg, `#0f7a56` text, `#6ee7b7` border
- `#reading` tag: `#fef3c7` bg, `#b45309` text, `#fcd34d` border
- `#research` tag: `#e8f2fb` bg, `#1d6fa4` text, `#93c5fd` border

**Callout block:** `#eeecfd` bg, `#5b4fe8` left border, `#4338ca` text
(same purple family, inverted lightness from dark mode)

**Editor active tab:** slightly off-white (`--bg`) with a top+side 1px
`--bd` border and a 2px `--acc` bottom border — same structure as dark,
but the visual weight is lighter.

**Backlinks box:** `--bg1` (white) background, `--bd` border — clean
white card sitting on the warm-gray canvas.

**Status bar and topbar:** `--bg1` (white) background, `--bd` bottom border.
Reads as a clean chrome strip above/below the warm canvas.

---

## What changes in light mode automatically

Because EVERYTHING uses CSS variables, all of these flip without any code
changes to components:

- Rail background, dividers, hover states
- File tree background, section labels, active item highlight
- Editor canvas background, text colors, headings
- Tab bar background, active tab styling
- Callout block background and border
- Context panel background, suggestion card backgrounds
- Mini graph node colors (use CSS variables for fills where possible)
- Status bar text and background
- All tag chips (if they use --acc-bg, --grn-bg, --amb-bg etc.)

---

## What needs a manual light-mode CSS rule (exceptions)

A few things use hardcoded hex values that won't auto-flip. Find these
and replace with variables:

### SVG graph nodes
If your knowledge graph SVG uses hardcoded fills like `fill="#7c6ef7"`,
they won't respond to the theme toggle. Either:
- Replace with `fill="var(--acc)"` (SVG CSS variables work in modern browsers)
- Or re-render the SVG when theme changes (simpler: just re-call your
  draw function when `data-theme` changes)

```javascript
// add this after toggleTheme()
window.dispatchEvent(new CustomEvent('theme-changed'))
// in your graph component:
window.addEventListener('theme-changed', () => redrawGraph())
```

### Canvas dotted grid background
If using `radial-gradient` with hardcoded colors for the canvas dots:
```css
/* dark */
[data-theme="dark"] .canvas-area {
  background: radial-gradient(circle, #18181b 0.6px, transparent 0.6px) 0 0/22px 22px;
}
/* light */
[data-theme="light"] .canvas-area {
  background: radial-gradient(circle, #d8d7d4 0.6px, transparent 0.6px) 0 0/22px 22px;
}
```

### epub.js / pdf.js reader
The reader body styles injected into the epub/pdf renderer need separate
theme handling:

```javascript
function applyReaderTheme(rendition, theme) {
  if (theme === 'dark') {
    rendition.themes.select('dark')
  } else {
    rendition.themes.register('light', {
      body: {
        background: '#f5f5f3',
        color: '#5a5a56',
        fontFamily: 'JetBrains Mono',
        fontSize: '13px',
        lineHeight: '1.9'
      }
    })
    rendition.themes.select('light')
  }
}
```

### Highlight colors in reader
Dark mode highlights use dark-tinted backgrounds. Light mode uses
lighter tints — update these too:

```css
[data-theme="light"] .hl-yellow {
  background: #fef9c3;
  border-bottom: 1px solid #fbbf24;
  color: #1a1a18;
}
[data-theme="light"] .hl-purple {
  background: #eeecfd;
  border-bottom: 1px solid #5b4fe8;
  color: #1a1a18;
}
[data-theme="light"] .hl-green {
  background: #e8f7f1;
  border-bottom: 1px solid #34d399;
  color: #1a1a18;
}
```

---

## Transition

Add a smooth transition so the swap doesn't flash:

```css
*, *::before, *::after {
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 100ms ease;
}
```

Put this in your global CSS. 180ms is fast enough to feel instant,
slow enough to avoid a jarring flash. SVG fill colors don't transition
via CSS — that's fine, the nodes just snap to new colors.

---

## React hook (if using React)

```typescript
function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('sb-theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('sb-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return { theme, toggle }
}
```

Use it once in `App.tsx` and pass `toggle` down to the topbar button.

---

## What NOT to do

- Don't create two separate component trees — one for light, one for dark.
  Everything must be one codebase with CSS variable swaps.
- Don't hardcode `#ffffff` or `#0c0c0e` anywhere in components — always
  use `var(--bg)`, `var(--bg1)` etc.
- Don't add a light/dark mode switch to every individual component —
  the global `data-theme` attribute handles it all at once.
- Don't use `filter: invert()` as a shortcut — it breaks images, graphs,
  and colored elements.
- Don't make the toggle a large prominent button — it's a quiet utility
  action, icon-only in the topbar is the right weight.
- Don't forget to test the graph view, canvas dots, and reader highlights —
  those are the three places most likely to have hardcoded colors.

---

## Checklist before shipping

- [ ] `data-theme="dark"` set on `<html>` by default
- [ ] `data-theme="light"` swaps all CSS variables correctly
- [ ] `localStorage` persists the choice across sessions
- [ ] `prefers-color-scheme` respected on first visit
- [ ] Sun/moon icon toggles correctly in the topbar
- [ ] Graph SVG nodes re-render on theme change
- [ ] Canvas dotted background updates on theme change
- [ ] epub/pdf reader theme updated on theme change
- [ ] Highlight colors updated for light mode
- [ ] 180ms transition on background-color and border-color
- [ ] All tag chips readable in both modes
- [ ] Callout blocks readable in both modes
- [ ] Status bar, topbar, tabbar readable in both modes

---

*Scope: CSS variable theme system · data-theme attribute toggle ·
localStorage persistence · prefers-color-scheme on first load ·
sun/moon icon in topbar · SVG graph re-render hook ·
canvas dots override · reader theme injection.*
