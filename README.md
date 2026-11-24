# Stealth Teleprompter

A teleprompter for Windows that **you can see but your screen recording can't**.

Paste your (AI-written) script, put the window at the top of your screen right under the webcam, and hit record. OBS, Zoom, Teams, Google Meet, Loom, the Xbox Game Bar and the Snipping Tool capture whatever is *behind* the window, so your audience never sees the script, even when you share your whole screen.

## How it works

The app calls the Windows API `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` through Electron's `win.setContentProtection(true)`. Windows composites the window for your physical monitor only and leaves it out of every capture path: screen capture, window capture and remote desktop.

| Windows version | Result in recordings |
| --- | --- |
| Windows 10 version 2004 (build 19041) and later, Windows 11 | **Fully invisible** |
| Older Windows 10 | Shown as a black box (the app warns you) |

> Always do a 5-second test recording first. The **Hide from capture** checkbox turns the protection off so you can compare.

## Features

- Paste a script or open a `.txt` / `.md` file. Markdown (`#`, `**bold**`, bullets) is cleaned up automatically.
- `[Bracketed cues]` such as `[pause]` or `[smile]` are highlighted in yellow.
- Smooth auto-scroll with a reading line, a 3-2-1 countdown and a progress bar.
- Adjustable speed and font size, a window opacity slider and mirror mode (for beam-splitter glass).
- Always on top, frameless, resizable. It opens at the top-centre of the screen, near your webcam.
- **Global hotkeys** work while OBS or Zoom has focus.
- **Click-through mode** lets clicks pass through the window to the app underneath.
- The script and settings are saved automatically.
- Shows the word count and an estimated read time (about 140 words per minute).

## Shortcuts

**Global** (work from any app):

| Keys | Action |
| --- | --- |
| `Ctrl+Alt+Space` | Play / pause (also switches to prompt mode) |
| `Ctrl+Alt+↑` / `↓` | Faster / slower |
| `Ctrl+Alt+←` / `→` | Jump back / forward 3 lines |
| `Ctrl+Alt+R` | Back to the top |
| `Ctrl+Alt+T` | Toggle click-through |
| `Ctrl+Alt+H` | Hide / show the window |

**In the window:** `Space` play/pause · `↑`/`↓` speed · `←`/`→` or `PgUp`/`PgDn` jump · `Home` restart · `M` mirror · `Ctrl +`/`Ctrl −` font size · `Ctrl+Enter` or `Esc` switch between edit and prompt mode · `Ctrl+O` open a file · mouse wheel scrolls by hand · click the text to pause.

## Run it

Requires [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
npm start
```

## Build a Windows `.exe`

```bash
npm run dist
```

This creates an installer and a portable `.exe` in `dist/`.

You can also skip the local build: every push to `main` runs the **Build Windows app** GitHub Action. Open the run under the repository's *Actions* tab and download `StealthTeleprompter-windows` from its artifacts.

> The `.exe` is not code-signed, so Windows SmartScreen may warn on first launch. Click *More info → Run anyway*.

## Limitations

- **Phone or external camera pointed at the screen:** OS-level hiding can't help when a camera films the monitor itself.
- **macOS:** the same code hides the window from most recorders. Some ScreenCaptureKit-based apps on macOS 15+ ignore it, so test first.
- **Linux:** the OS provides no capture-exclusion API, so the window will be visible in recordings.
