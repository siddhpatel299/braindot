# Braindot for desktop

The desktop app is the same Braindot, in its own window, on Windows and macOS.
Not a browser pointed at a website — the whole Next.js app ships inside the
installer and runs locally. Convex still does sync and auth over the network, so
a note written on the desktop shows up on the web app and the other way round.

```
braindot.exe  ─┬─ Electron main process ── window, menu, native dialogs, lifecycle
               │
               └─ spawns ──▶ Next.js server (127.0.0.1:41573)
                                   │
                             renderer ──── wss ────▶ Convex (sync + auth)
                                       ──── https ──▶ OpenAI (AI features)
```

## Building it

### macOS, in one command

Copy [`build-mac.sh`](build-mac.sh) to the Mac and run it. It clones the repo if
you are not already in it, installs Bun and the dependencies, writes the one
environment variable the build needs, and produces the `.dmg`:

```bash
bash build-mac.sh
```

Safe to re-run — every step checks before it acts. It refuses to run anywhere but
macOS, and it tells you plainly if the checkout predates the desktop shell (which
means the work was never pushed). The rest of this section is what that script
does by hand.

### By hand

```bash
bun install
```

Then, with `NEXT_PUBLIC_CONVEX_URL` set in `.env.local` (the build refuses to run
without it — see [Configuration](#configuration)):

```bash
bun run desktop:dist
```

```bash
bun run desktop:dist:mac
```

That produces, in `dist-desktop/`:

| File | What it is |
|---|---|
| `braindot-0.2.0-x64.exe` | Windows installer. Per-user, no admin prompt, lets you pick the directory. |
| `braindot-0.2.0-portable.exe` | Windows, single file, runs without installing. |
| `braindot-0.2.0-arm64.dmg` | macOS on Apple silicon. |
| `braindot-0.2.0-x64.dmg` | macOS on Intel. |

The Windows artefacts are about 104 MB each.

> **Each platform has to be built on itself.** electron-builder cannot produce a
> `.app` or `.dmg` from Windows, and `desktop:build` traces platform-specific
> optional dependencies into the server bundle — so `desktop:dist:mac` has to run
> on a Mac, from a clean `bun install` there.

### The other scripts

| Script | What it does |
|---|---|
| `bun run desktop:dev` | `next dev` plus Electron pointed at it. Fast refresh works normally. |
| `bun run desktop:build` | Just the server bundle, no packaging. |
| `bun run desktop:pack` | Unpacked app for the current platform — much faster than a full installer when you are iterating on the shell. |
| `bun run desktop:icon` | Regenerates the app icon from `scripts/make-icon.mjs`. |

## How it fits together

```
electron/
  main.js             window, menu wiring, IPC, security policy, lifecycle
  next-server.js      spawns and supervises the bundled Next server
  preload.js          the window.braindot bridge (app window)
  preload-settings.js the narrower bridge for the Settings window
  menu.js             application menu
  config.js           %APPDATA%\braindot\config.json
  window-state.js     remembers size, position and maximised state
  log.js              %APPDATA%\braindot\logs\desktop.log
  splash.html         shown while the server boots
  settings.html       Settings window
scripts/
  build-desktop.mjs   next build + assemble desktop-build/server
  after-pack.js       copies that bundle into the packaged app
  dev-desktop.mjs     the dev loop
```

Three decisions are worth knowing about, because they are not obvious and
changing them will break things.

**The server runs on a fixed port (41573), remembered in
`%APPDATA%\braindot\port.json`.** Braindot keeps the whole vault in
localStorage, and localStorage is scoped to an origin — scheme, host *and* port.
A fresh ephemeral port each launch would mean a fresh empty vault each launch. If
41573 is ever taken the app moves to a free port and logs a warning; signed-in
users just re-sync from Convex.

**The server is spawned with `ELECTRON_RUN_AS_NODE`, not with `node`.** That runs
Electron's own bundled Node, so the app does not require Node to be installed. It
is also why the server bundle has to sit *outside* `app.asar`: in that mode
Electron is a plain Node process and cannot read from an asar archive.

**The server bundle is copied by `scripts/after-pack.js`, not by
`extraResources`.** electron-builder applies its own file matcher to extra
resources, and that matcher strips `node_modules` — which here is not clutter but
the server's entire traced dependency tree. Packaging succeeds and the app then
dies on launch. The hook copies the directory itself and asserts the result. It
asks electron-builder where resources live rather than assuming: Windows uses
`resources/`, macOS buries it at `braindot.app/Contents/Resources/`.

## Platform differences

Almost all of the shell is shared. What is not:

| | Windows | macOS |
|---|---|---|
| Title bar | `titleBarStyle: hidden` + `titleBarOverlay`; caption buttons on the right | `hiddenInset` + `trafficLightPosition`; traffic lights on the left |
| Menu | No menu bar is drawn for a hidden-title-bar window, so the ☰ button in the CommandBar pops it up | Real system menu bar; no ☰ button, and an app menu holding About/Settings/Quit |
| Window controls inset | 146px reserved on the right | 78px reserved on the left |
| Quit | Closing the last window quits | Stays in the dock, `activate` reopens the window |
| Undo/Redo in the menu | Shown with ⌘Z/⌘Y but not registered, so the editor keeps the keystroke | Shown without accelerators — see below |

The macOS Edit menu deliberately shows Undo and Redo **without** their
accelerators. `registerAccelerator: false` is a Windows/Linux feature; macOS
always registers a menu accelerator, and a registered ⌘Z would fire even when
focus is in the search box, bypassing the editor's own undo stack. The keystroke
still works everywhere it did before — it is just not advertised in the menu.
Menu clicks drive the app's stack over IPC on both platforms.

## Liquid glass (macOS)

The macOS window is backed by a real `NSVisualEffectView` (`vibrancy:
'under-window'`), so the blur is done by the compositor against the actual
desktop behind the window — not by CSS, and not against a screenshot.

For any of it to show, the page has to stop painting over it. That half is the
`.is-glass` layer at the end of `src/app/globals.css`, which the shell switches
on by setting a class on `<html>` when it reports a blur material. Because every
surface in Braindot reads its colour from a design token, making the app
translucent is a matter of restating those tokens — no component changes at all.

Two things worth knowing if you tune it:

- **`html`, `body` and the app's root container all paint `var(--bg)`.** Three
  translucent layers stack and cancel the effect, so the document background is
  dropped and the root container is left as the only pane.
- **Translucency costs contrast, and the alphas are set accordingly.** At 62%
  opacity, secondary text over a light desktop measured about **1.6:1** — 
  unreadable. The shipped values hold the same worst case near 3.7:1 and lift
  `--t2`/`--t3` a step to buy back what the glass costs. Body text stays at
  8.9:1 even over a white desktop.

macOS's system **Reduce Transparency** setting is honoured through
`prefers-reduced-transparency`: the palette falls back to fully opaque, which
leaves an ordinary solid window.

Windows is deliberately left opaque. Mica/Acrylic (`backgroundMaterial`) would be
the equivalent there, but it fights the opaque `titleBarOverlay` this design
relies on, so it is not enabled.

## Configuration

Runtime settings live in a JSON file the app owns:

| | |
|---|---|
| Windows | `%APPDATA%\braindot\config.json` |
| macOS | `~/Library/Application Support/braindot/config.json` |

Reachable from **File → Settings…** on Windows, **Braindot → Settings…** on
macOS — `Ctrl+,` / `⌘,` either way.

| Key | Notes |
|---|---|
| `OPENAI_API_KEY` | Powers Ask this note, Ask your vault and Study mode. Empty on a fresh install. Set it to `mock` to stream canned replies without spending tokens. |
| `OPENAI_MODEL` | Defaults to `gpt-4o-mini`. |
| `NEXT_PUBLIC_CONVEX_URL` | Shown read-only. |

A real environment variable wins over the file, so
`OPENAI_API_KEY=sk-... braindot.exe` works for a one-off.

**No secret is ever baked into the installer.** The build copies only
`NEXT_PUBLIC_CONVEX_URL` into the bundle, and both the build script and the
packaging hook delete any `.env` file that Next's standalone output drags along —
the hook fails the build rather than shipping one.

`NEXT_PUBLIC_CONVEX_URL` is the exception to "configure at runtime", and it has to
be: Next inlines `NEXT_PUBLIC_*` into the client bundle at build time, so the
renderer talks to whichever deployment was set when you built. Pointing the
desktop app at a different Convex deployment means rebuilding.

## What the desktop build adds

- **Frameless window.** The CommandBar *is* the title bar — it drags the window
  and leaves room for the caption buttons, which repaint when you switch themes.
- **Application menu.** On macOS it is the normal menu bar; on Windows it is
  reached with the ☰ button at the top left, because Windows draws no menu bar
  for a hidden-title-bar window.
- **Liquid glass on macOS** — a native vibrancy material behind a translucent
  app, honouring Reduce Transparency.
- **`Ctrl+1`–`Ctrl+7`** jump to Dashboard, Notes, Search, Graph, Kanban, Canvas
  and Reading. `Ctrl+Shift+L` toggles the theme.
- **Native file dialogs** for import and export instead of browser downloads.
- **No landing page.** The web app sends signed-out visitors to the marketing
  page; an app you already installed goes straight to sign-in.
- Window size, position and maximised state persist between launches.
- Single instance — launching again focuses the window you already have.
- External links open in your real browser.

Braindot's own shortcuts (`Ctrl+K`, `Ctrl+T`, `Ctrl+W`, `Ctrl+P`, `Ctrl+S`,
`Ctrl+J`, and the editor's `Ctrl+B/I/U/Z/Y`) are shown in the menu but
deliberately **not** registered as accelerators. A menu accelerator is handled
before the keystroke reaches the page, so registering them would break shortcuts
that work fine on the web. `registerAccelerator: false` in `electron/menu.js` is
what keeps them visible but out of the way.

## Startup

Measured on the machine this was built on:

| | Time to a usable window |
|---|---|
| Warm (the usual case) | ~1.5s — the server is ready in ~100ms |
| First launch after a build or install | ~20s |

The first launch is slow because Windows Defender scans the freshly written
files, and because Electron has to start a second copy of itself in Node mode and
load Next's server bundle with nothing cached. It is a one-off; subsequent
launches are the top row.

A splash screen covers the wait either way, so the app never shows an empty
window.

## When something goes wrong

The log holds both the shell's messages and the bundled server's stdout and
stderr. Reach it from **Help → Show Logs**, or from the Settings window.

| | |
|---|---|
| Windows | `%APPDATA%\braindot\logs\desktop.log` |
| macOS | `~/Library/Application Support/braindot/logs/desktop.log` |

If the server dies while the app is running, the app says so and **File → Restart
App Server** brings it back on the same port, so nothing local is lost.

Uninstalling deliberately leaves the application-support directory in place. Your
notes are there, and an uninstall should never be the thing that loses them.

## Not done here

- **The builds are unsigned.** On Windows, SmartScreen warns on first run —
  "More info" then "Run anyway". On macOS, Gatekeeper refuses a double-click;
  right-click ▸ Open, once, gets past it. Signing macOS properly also means
  notarising: remove `mac.identity: null` from `electron-builder.yml`, set
  `CSC_LINK`/`CSC_KEY_PASSWORD`, and add `hardenedRuntime` plus a notarize block.
- **No auto-update.** electron-builder can publish updates, but that needs a
  release host and signed builds to be worth wiring up.
- **No Linux target.** Nothing in the shell is Windows- or macOS-specific beyond
  the window chrome, so adding AppImage/deb is mostly configuration.

### What has actually been run

The Windows build has been built, launched and exercised end to end: server boot,
Convex sync, the menu, window state, clean shutdown.

**The macOS build has not been run** — it cannot be, from Windows. The
platform-specific code follows Electron's documented APIs and the shared shell
was re-verified on Windows after the split, but the mac-only paths (vibrancy,
`hiddenInset` traffic-light placement, the app menu, `.dmg` packaging) are
unverified on real hardware. The glass palette was checked numerically for
contrast rather than visually. Expect the traffic-light offsets and the exact
alphas to want a nudge the first time you build it on a Mac.
