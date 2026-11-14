# Narrated Explainer Video Playbook

Drop this file into **any repository** and ask your AI coding agent:

> Follow `EXPLAINER_VIDEO_PLAYBOOK.md` and create the explainer video for this repo.

Optional extras you can add to that request: a length ("keep it under 3 minutes"), a voice ("use a British male voice"),
features that must be covered, or a music file to use.

The agent studies the repo, writes a friendly script, and records a real walkthrough of the product.
Every repository gets the same style of video with its own content.

---

## What the video looks like

| Aspect | Result |
|---|---|
| Format | 1920×1080 MP4, 30 fps, H.264 + AAC, plus a toggleable subtitle track and a separate `.srt` file |
| Length | At most 4 minutes by default (`maxSeconds`), covering every major feature briefly |
| Picture | A real browser tour of the repo's UI: a visible cursor glides to each thing the narrator mentions, clicks show a ripple, scrolling is smooth, and each page fades in |
| Voice | Warm, natural, offline AI voice (Kokoro "Heart" by default); falls back to macOS `say` if Kokoro isn't installed |
| Tone | Friendly explainer: a greeting, conversational questions ("Have you ever wished…? Well, good news!"), and a thank-you at the end |
| Music | A light bed about 16–20 dB under the voice that ducks further while the narrator speaks; uses your music file, or a built-in royalty-free soft pad |
| Repeatable | A single command regenerates the video after the product changes |

---

## Instructions for the AI agent

Work through these steps in order. Each step ends with a **Gate** that must be met before you move on.
Keep the user informed with short progress updates.

### Step 1: Check prerequisites

Needed: Node.js 18 or later, `ffmpeg` and `ffprobe`, and Python 3.9 or later (for the Kokoro voice).
macOS or Linux; on Windows, use WSL.

```bash
node --version && ffmpeg -version | head -1 && python3 --version
```

If `ffmpeg` is missing, ask the user to install it (`brew install ffmpeg` or `apt install ffmpeg`). Don't continue without it.

**Gate:** all three commands succeed.

### Step 2: Study the repository

Read the repo, not just the README. Work out:

1. **What it is**: one sentence on what the project does and who it's for.
2. **Every major feature**, using the names the product itself uses. Sources: README, docs, the marketing site, routes and pages, navigation menus, CLI commands, API endpoints, tests.
3. **What can be shown on screen.** Choose one or more *targets*:
   - **Static site**: a folder with `index.html`, such as a marketing site, docs build or `site/`. Served automatically.
   - **Running web app**: a dev server (`npm run dev`, `vite`, `next dev`, `rails s`, `python manage.py runserver`, …). Note its URL, a health URL if there's a backend, and the start command. The engine reuses it if it's already running, otherwise starts it and stops it afterwards.
   - **No UI at all** (a library, CLI, backend or infrastructure repo): create a slides page from the template in [Appendix D](#appendix-d-slides-template-for-repos-without-a-ui), filled with the repo's real content and code examples.
4. **The hands-on moment**: the most compelling thing a viewer can watch happen in the real app, such as creating something, running something, or seeing a result. Always include it when a runnable app exists.
5. **Getting started**: the real install and run commands.

Rules:

- Use only local or development targets. Never record production URLs, real customer data, secrets, `.env` files, or admin pages that show credentials.
- Use sample data only. Don't trigger destructive or external actions: deleting things, sending email, payments, or deploys.

**Gate:** you can list the targets, 6–12 features, the hands-on flow, and the getting-started commands.

### Step 3: Plan the story

Use this structure, and adapt it to the repo:

| # | Scene | Length | Purpose |
|---|---|---|---|
| 1 | `intro` | 12–18 s | Greeting, and what the product is in one breath. |
| 2 | `overview` | 8–20 s | The home page or hub, and how the product is organized. |
| 3… | one scene per feature | 8–20 s each | What it is, why it matters, shown on screen. |
| … | hands-on demo (2–3 scenes) | 30–50 s total | Do the real thing in the app. Introduce it as the highlight: "And now, my favorite part…" |
| n-1 | `start` | 10–15 s | How to get started. |
| n | `outro` | 6–10 s | Recap in one line, thank the viewer, sign off. |

**Length budget:** about 2.5 spoken words per second, including pauses. For the default 4-minute limit, write **520–580 words in total**
(one measured example: 610 words with many on-screen actions came to 3 min 54 s). Use `maxSeconds` to change the limit.

**Tone rules (friendly explainer):**

- Open with a greeting: *"Hi there, and welcome! I'm really glad you're here. In the next few minutes, I'll show you …"*
- Talk to one person, using "you", contractions and short sentences. Sound like a helpful colleague, not a press release.
- For two or three standout features, set up a question and then reveal the answer:
  *"Okay, quick question. Have you ever wished you had a voice bot you could simply ask: how well are my customers covered? Well, good news! Pulse is ready for you."*
  *"Got a mobile app? No problem!"* · *"Now, you might be wondering: is all this actually safe? Absolutely."*
- Use short transitions between scenes: *"Now, here's how…"*, *"Want to see it in action?"*, *"Under the hood…"*
- Complement the screen; don't read it word for word. Mention things in the same order the cursor visits them.
- Only make claims the repo supports. Avoid jargon and empty marketing phrases ("streamline your workflow", "next-generation").
- Close warmly: *"And that's <Product>! … Thanks so much for watching, and happy testing!"* (change "testing" to suit the product)
- If the voice is likely to mispronounce a term, add it to `pronunciations` (for example, `[/\bnpm\b/g, 'N P M']`). Captions keep the original spelling.

**Gate:** a scene list with narration text whose total word count fits the budget.

### Step 4: Create the files

Create this folder at the repo root:

```
explainer-video/
├── record.mjs          # engine: copy VERBATIM from Appendix A, do not edit
├── package.json        # Appendix B
├── video.config.mjs    # repo-specific: targets, scenes, narration, steps (Appendix C shows an example)
└── slides/index.html   # only for repos without a UI (Appendix D)
```

Then:

1. Copy [Appendix A](#appendix-a-recordmjs-engine) into `explainer-video/record.mjs` **exactly as it is**. Everything repo-specific goes in the config;
   for unusual interactions, use a `{ run: async (page) => { … } }` step instead of editing the engine.
2. Copy [Appendix B](#appendix-b-packagejson) into `explainer-video/package.json`. If the repo already uses Playwright, pin the same version so its installed browser is reused.
3. Write `explainer-video/video.config.mjs` using the [config reference](#config-reference). Rules for steps:
   - **Start every scene with a `goto`** (or a click that navigates) so scenes can be previewed on their own and a failed scene doesn't break the next one. Scenes that deliberately continue a flow, such as an in-app demo, may skip this.
   - Use 2–6 steps per scene, ordered to match the narration. Use `weight` to give a step more or less of the scene's time.
   - Use stable selectors: ids, `data-*` attributes, ARIA roles, or `text=Visible label` / `button:has-text("Run")`. Avoid generated class names and long `nth-child` chains.
4. Add these to the repo's `.gitignore`:
   ```
   explainer-video/node_modules/
   explainer-video/.venv/
   explainer-video/output/
   ```
5. Optional, if the repo has a root `package.json`: add the script `"video:explainer": "npm --prefix explainer-video run video --"`.
6. Install:
   ```bash
   cd explainer-video
   npm install
   npm run setup     # Kokoro voice in a local .venv + Playwright Chromium (one-time)
   ```
   The first narration run downloads the voice model (~350 MB, cached in `~/.cache/hyperframes`). Corporate npm and pip mirrors work.
   If `npm run setup` can't reach the registries, the engine still works with the macOS `say` voice.

**Gate:** `node --check record.mjs` passes and the installs succeed.

### Step 5: Dry run until clean

```bash
cd explainer-video && npm run video -- --dry-run
```

This walks every scene at high speed without audio or recording, starts and stops any app targets, and prints an
estimated length. Fix any `not visible:` or `step failed` warnings (usually a wrong selector, a missing `waitFor`, or a
missing `goto`) and repeat. Shorten the narration if the estimate is over the limit.

**Gate:** "All steps found their targets." and the estimated length is under `maxSeconds`.

### Step 6: Preview a few scenes and look at them

Render the intro, the hands-on demo and one feature scene:

```bash
npm run video -- --only=intro,<demo-scene>,<feature-scene>
```

Then check the frames by building a contact sheet and viewing the image:

```bash
ffmpeg -y -loglevel error -i output/<name>-preview.mp4 \
  -vf "fps=1/4,scale=640:-1,tile=3x3" -frames:v 1 output/contact-sheet.png
```

Check that the right screen is shown for each line, the cursor lands on what's being described, nothing is cut off or
covered by a dialog, and the app actually responded (for example, the result appeared). If the engine reports
`scene "x" ran Ns past its narration`, add a sentence to that scene or remove steps.

**Gate:** the preview looks right with no warnings.

### Step 7: Full render

```bash
npm run video
```

This takes about as long as the video plus a minute or two. Confirm:

- `output/<name>.mp4` and `output/<name>.srt` exist.
- No warnings were printed, and the length is under `maxSeconds`. If it's over, trim the narration; don't speed up the voice past `SPEED=1.1`.
- Voice and music are balanced. Optional check: the music in a pause should measure around 15–25 dB below the speech.
  ```bash
  ffmpeg -i output/<name>.mp4 -vn -af "atrim=START:END,volumedetect" -f null - 2>&1 | grep mean_volume
  ```

Delete `output/contact-sheet.png` and any other scratch files.

**Gate:** a clean, full-length MP4 that fits the limit.

### Step 8: Deliver

Tell the user:

- where the video and captions are, and how long the video is
- the scene list (one line each), so they can request changes
- how to regenerate it: `cd explainer-video && npm run video`
- how to change the voice, speed or music (see [Customizing](#customizing))
- the music credit to include, if a licensed track was used
- any side effects, such as demo data the recording created in local dev stores

---

## Config reference

`explainer-video/video.config.mjs` exports a default object:

| Field | Required | Description |
|---|---|---|
| `name` | no | Output file name (default `explainer`). |
| `targets` | yes | Named places to record. `{ static: 'path/from/repo/root' }` serves a folder. `{ url, health?, start?, cwd?, env?, timeoutSeconds? }` is a running app; `health` may be a URL or a list of URLs; `start` is a shell command run from `cwd` (relative to the repo root) when the URLs aren't reachable. |
| `start` | no | First URL loaded before recording starts (default: the first scene's first `goto`). |
| `scenes` | yes | Ordered list of `{ id, text, steps }`. `text` is the narration and sets the scene's length. |
| `maxSeconds` | no | Length limit to warn about (default `240`). |
| `voice` / `speed` | no | Kokoro voice ID (default `af_heart`) and speed multiplier (default `1`). |
| `music` / `musicCredit` / `musicVolume` | no | Music file path relative to the repo root, its credit line, and its level (default `0.17` for a file, `0.25` for the built-in pad). Without `music`, the built-in soft pad is used. |
| `pronunciations` | no | `[[RegExp, 'spoken form'], …]` applied to the voice only. |
| `headerHeight` | no | Height in pixels of any fixed header to keep targets below (default `110`; use `0` for slides). |
| `colorScheme`, `width`, `height` | no | `'light'` or `'dark'`, and the viewport size (default 1920×1080). |

URLs in steps use a target name as a prefix, such as `'site:/#pricing'` or `'app:/dashboard'`. Plain paths use the first target, and absolute `http(s)://` URLs are used as they are.

**Steps.** Each step may also have a `weight` (default `1`), which is its share of the scene's time.

| Step | What it does |
|---|---|
| `'selector'` or `{ point: 'selector' }` | Scroll the element into view and glide the cursor to it. |
| `{ click: 'selector' }` | Glide to the element and click it, with a ripple. |
| `{ type: 'selector', value: 'text', delay?: 40 }` | Click a field and type into it like a person. |
| `{ select: 'selector', value: 'option' }` | Choose an option in a `<select>`. |
| `{ press: 'Enter' }` | Press a key. |
| `{ text: 'snippet', in: 'selector' }` | Point at a text snippet inside a block, such as a line of code. |
| `{ goto: 'target:/path' }` | Navigate, with a fade-in. |
| `{ scroll: 'top' \| 'bottom' \| 400 \| 'selector' }` | Smooth scroll (a number scrolls by that many pixels). |
| `{ moveTo: [0.5, 0.4] }` | Move the cursor to a fraction of the screen. |
| `{ waitFor: 'selector', timeout? }` / `{ waitForUrl: 'part-of-url' }` | Wait for the app, usually with `weight: 0`. |
| `{ hold: true }` | Just let the current view breathe. |
| `{ eval: () => … }` / `{ run: async (page) => … }` | Escape hatches: run code in the page, or arbitrary Playwright code. |

Links that open a new tab, and `window.open`, are kept in the same tab automatically so they stay on camera.

## Customizing

| Change | How |
|---|---|
| Voice | `VOICE=af_nova npm run video` or `voice` in the config. Kokoro English voices: `af_heart` (warm, default), `af_nova`, `af_sky`, `am_adam`, `am_michael`, `bf_emma`, `bf_isabella` (British), `bm_george` (British). |
| Speed | `SPEED=1.05 npm run video` (a range of 0.9–1.1 sounds natural). |
| Use the macOS voice instead | `TTS=say VOICE=Samantha npm run video` |
| Music | Set `music` to a royalty-free track you're licensed to use (for example, the YouTube Audio Library or CC BY tracks; add `musicCredit`). Use `--no-music` to turn music off. |
| Length | Edit the narration; the video follows it. Use `--only=a,b` for fast previews. |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Executable doesn't exist … chromium` | `cd explainer-video && npx playwright install chromium` |
| Another project's Playwright tests suddenly can't find their browser | Installing browsers for a different Playwright version can clean up other versions' cached browsers. Run `npx playwright install` in that project. To avoid it, pin `explainer-video` to the Playwright version the repo already uses (Step 4). |
| `kokoro-onnx package is not installed` | `npm run setup`, or point `HYPERFRAMES_PYTHON` at a Python that has `kokoro-onnx` and `soundfile` installed. |
| `Target "app" is only partly running` | Stop the half-running dev server, or start it fully, then re-run. |
| `not visible: …` | Wrong selector, the element is on another page (add a `goto`), or the app is slow (add `{ waitFor, weight: 0 }`). |
| `scene "x" ran Ns past its narration` | That scene's actions take longer than its text: add a sentence or drop steps. |
| Video over the limit | Cut words (about 2.5 words per second); don't cut features. |
| Blank or frozen frames after moving between sites | Already handled (the screencast re-arms when the origin changes). Add `{ waitFor }` for slow apps. |

---

## Appendix A: `record.mjs` (engine)

Copy verbatim.

```js
#!/usr/bin/env node
// Explainer video engine: records a friendly, narrated, cursor-driven tour of this
// repository's UI, then mixes it with captions and light background music.
// Everything repo-specific (targets, scenes, narration, cursor steps) lives in video.config.mjs.
//
//   npm run video                        full render -> output/<name>.mp4 (+ .srt captions)
//   npm run video -- --dry-run           fast check that every step finds its target
//   npm run video -- --only=intro,demo   preview selected scenes
//   npm run video -- --no-music          narration only
//   VOICE=af_nova SPEED=1.05 npm run video

import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const config = (await import(pathToFileURL(path.join(HERE, 'video.config.mjs')).href)).default;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY = flag('dry-run');
const only = option('only')?.split(',').filter(Boolean);
const scenes = only ? config.scenes.filter((s) => only.includes(s.id)) : config.scenes;

const NAME = (config.name || 'explainer') + (only ? '-preview' : '');
const OUT_DIR = path.join(HERE, 'output');
const WORK_DIR = path.join(OUT_DIR, 'work');
const WIDTH = config.width || 1920;
const HEIGHT = config.height || 1080;
const FPS = 30;
const TIME_SCALE = DRY ? 0.15 : 1;
const SCENE_GAP_MS = 600;
const TAIL_MS = 2500;
const MAX_SECONDS = config.maxSeconds ?? 240;
const WORDS_PER_SECOND = 2.6;
const KOKORO_PYTHON = process.env.HYPERFRAMES_PYTHON || path.join(HERE, '.venv/bin/python');
const TTS = process.env.TTS || (existsSync(KOKORO_PYTHON) ? 'kokoro' : 'say');
const VOICE = process.env.VOICE || (TTS === 'kokoro' ? config.voice || 'af_heart' : 'Samantha');
const SPEED = Number(process.env.SPEED || config.speed || 1);
const musicFile = config.music ? path.resolve(ROOT, config.music) : null;
const MUSIC = flag('no-music') ? 'none' : musicFile && existsSync(musicFile) ? 'file' : 'pad';
const MUSIC_VOLUME = config.musicVolume ?? (MUSIC === 'pad' ? 0.25 : 0.17);

const warnings = [];
function warn(message) {
  warnings.push(message);
  console.warn(`  warn   ${message}`);
}

// ---------------------------------------------------------------- targets (static dirs and running apps)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(dir) {
  const root = path.resolve(ROOT, dir);
  const server = createServer(async (req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      await stat(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const isUp = (url) => fetch(url, { signal: AbortSignal.timeout(2500) }).then((r) => r.status < 500, () => false);
const targetUrls = {};

// Serves static targets, reuses running apps, or starts them and stops them afterwards.
async function startTargets() {
  const cleanup = [];
  try {
    for (const [key, target] of Object.entries(config.targets)) {
      if (target.static) {
        const server = await serveStatic(target.static);
        targetUrls[key] = `http://127.0.0.1:${server.address().port}`;
        cleanup.push(() => server.close());
        continue;
      }
      targetUrls[key] = target.url.replace(/\/$/, '');
      const checks = [target.url, ...[].concat(target.health || [])];
      const up = await Promise.all(checks.map(isUp));
      if (up.every(Boolean)) continue;
      if (!target.start) throw new Error(`Target "${key}" is not reachable (${checks.join(', ')}) and has no start command.`);
      if (up.some(Boolean)) throw new Error(`Target "${key}" is only partly running (${checks.join(', ')}). Stop it or start it fully.`);
      console.log(`  start  ${key}: ${target.start}`);
      const child = spawn(target.start, {
        shell: true, detached: true, stdio: 'ignore', cwd: path.resolve(ROOT, target.cwd || '.'), env: { ...process.env, ...target.env },
      });
      cleanup.push(() => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ } });
      const deadline = Date.now() + (target.timeoutSeconds || 120) * 1000;
      while (!(await Promise.all(checks.map(isUp))).every(Boolean)) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for target "${key}" (${checks.join(', ')}).`);
        await sleep(1000);
      }
    }
  } catch (error) {
    cleanup.reverse().forEach((fn) => fn());
    throw error;
  }
  return () => cleanup.reverse().forEach((fn) => fn());
}

// "site:/#features" -> served site URL + "/#features"; absolute URLs pass through.
function resolveUrl(spec) {
  if (/^https?:\/\//.test(spec)) return spec;
  const match = /^([\w-]+):(.*)$/.exec(spec);
  const [key, rest] = match && targetUrls[match[1]] ? [match[1], match[2]] : [Object.keys(targetUrls)[0], spec];
  if (!targetUrls[key]) throw new Error(`Unknown target in "${spec}".`);
  return targetUrls[key] + (rest.startsWith('/') ? rest : `/${rest}`);
}

// ---------------------------------------------------------------- narration

function spoken(text) {
  return (config.pronunciations || []).reduce((t, [pattern, replacement]) => t.replace(pattern, replacement), text);
}

async function audioDuration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim());
}

async function synthesize() {
  if (TTS === 'say' && process.platform !== 'darwin') throw new Error('No voice available: run `npm run setup` to install Kokoro.');
  const clips = {};
  for (const scene of scenes) {
    const textFile = path.join(WORK_DIR, `${scene.id}.txt`);
    const audioFile = path.join(WORK_DIR, `${scene.id}.${TTS === 'kokoro' ? 'wav' : 'aiff'}`);
    await writeFile(textFile, spoken(scene.text));
    if (TTS === 'kokoro') {
      await run('npx', ['--yes', 'hyperframes@0.9.17', 'tts', textFile, '--voice', VOICE, '--speed', String(SPEED), '--output', audioFile], {
        cwd: WORK_DIR, env: { ...process.env, HYPERFRAMES_PYTHON: KOKORO_PYTHON }, maxBuffer: 1024 * 1024 * 16,
      });
    } else {
      await run('say', ['-v', VOICE, '-r', String(Math.round(175 * SPEED)), '-o', audioFile, '-f', textFile]);
    }
    clips[scene.id] = { file: audioFile, seconds: await audioDuration(audioFile) };
    console.log(`  voice  ${scene.id.padEnd(20)} ${clips[scene.id].seconds.toFixed(1)}s`);
  }
  return clips;
}

// ---------------------------------------------------------------- page helpers (run inside the browser)

function pageHelpers() {
  // The element that actually scrolls: the document, or an app's full-height scroll panel.
  window.__xvScroller = () => {
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollHeight > window.innerHeight + 2) return doc;
    const panel = [...document.querySelectorAll('main, [class*="overflow-y-auto"], [class*="overflow-auto"]')].find((el) => (
      el.scrollHeight > el.clientHeight + 2 && el.clientHeight > window.innerHeight * 0.6
      && /auto|scroll/.test(getComputedStyle(el).overflowY)
    ));
    return panel || doc;
  };
  // Keep everything in one tab so it stays on camera.
  window.open = (url) => { if (url) window.location.href = String(url); return null; };
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[target]');
    if (link) link.target = '_self';
  }, true);

  const install = () => {
    if (document.getElementById('__xv-cursor')) return;
    document.documentElement.style.scrollBehavior = 'auto';
    document.documentElement.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
    const cursor = document.createElement('div');
    cursor.id = '__xv-cursor';
    cursor.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5l15.5 9.2-6.8 1.6-3.5 6.7z" fill="#12112e" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none',
      transform: `translate(${window.__xvMouse?.x ?? -200}px,${window.__xvMouse?.y ?? -200}px)`,
      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))',
    });
    document.documentElement.appendChild(cursor);
    addEventListener('mousemove', (e) => { cursor.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 3}px)`; }, true);
    addEventListener('mousedown', (e) => {
      const ring = document.createElement('div');
      Object.assign(ring.style, {
        position: 'fixed', left: `${e.clientX - 22}px`, top: `${e.clientY - 22}px`, width: '44px', height: '44px',
        borderRadius: '50%', border: '3px solid rgba(99,102,241,.9)', zIndex: '2147483646', pointerEvents: 'none',
      });
      document.documentElement.appendChild(ring);
      ring.animate([{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 500 }).onfinish = () => ring.remove();
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}

// ---------------------------------------------------------------- cursor and scrolling

const mouse = { x: WIDTH * 0.62, y: HEIGHT * 0.55 };

async function glide(page, x, y, ms = 700) {
  const from = { ...mouse };
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i += 1) {
    const p = i / steps;
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    mouse.x = from.x + (x - from.x) * e;
    mouse.y = from.y + (y - from.y) * e;
    await page.mouse.move(mouse.x, mouse.y);
    await sleep(ms / steps);
  }
}

const scrollTop = (page) => page.evaluate(() => window.__xvScroller().scrollTop);

async function smoothScrollTo(page, top, ms = 800) {
  await page.evaluate(([to, duration]) => new Promise((resolve) => {
    const el = window.__xvScroller();
    el.style.scrollBehavior = 'auto';
    const from = el.scrollTop;
    const target = Math.max(0, Math.min(to, el.scrollHeight - el.clientHeight));
    if (Math.abs(target - from) < 2) { resolve(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      el.scrollTop = from + (target - from) * (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  }), [top, ms]);
}

async function bringIntoView(page, getBox) {
  let box = await getBox();
  const top = config.headerHeight ?? 110;
  if (box && (box.y < top || box.y + Math.min(box.height, HEIGHT * 0.6) > HEIGHT - 60)) {
    // Large blocks (sections, slides) align to the top; smaller items get some breathing room above.
    const margin = box.height > (HEIGHT - top) * 0.7 ? 0 : (HEIGHT - top) * 0.18;
    await smoothScrollTo(page, (await scrollTop(page)) + box.y - top - margin, 900);
    box = await getBox();
  }
  return box;
}

// Scrolls a target into a comfortable reading position, glides the cursor to it, and optionally clicks.
async function focus(page, selector, { click = false } = {}) {
  const locator = page.locator(selector).first();
  try {
    await locator.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    warn(`not visible: ${selector}`);
    return false;
  }
  const box = await bringIntoView(page, () => locator.boundingBox());
  if (!box) return false;
  await glide(page, click ? box.x + box.width / 2 : box.x + Math.min(box.width / 2, 150),
    click ? box.y + box.height / 2 : box.y + Math.min(box.height / 2, 28));
  if (click) {
    await sleep(200);
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
  return true;
}

// Points at a text snippet inside a block, e.g. one line of a code sample.
async function focusText(page, scope, needle) {
  const locate = () => page.evaluate(([sel, text]) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.data.indexOf(text);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const r = range.getBoundingClientRect();
      if (r.width && r.height) return { x: r.left, y: r.top, width: r.width, height: r.height };
    }
    return null;
  }, [scope, needle]);
  const box = await bringIntoView(page, locate);
  if (!box) {
    warn(`text not found: "${needle}" in ${scope}`);
    return false;
  }
  await glide(page, box.x + Math.min(box.width / 2, 150), box.y + box.height / 2);
  return true;
}

// ---------------------------------------------------------------- steps

async function goto(page, spec) {
  await page.goto(resolveUrl(spec), { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await page.mouse.move(mouse.x, mouse.y);
}

async function runStep(page, step) {
  if (step.goto) return goto(page, step.goto);
  if (step.click) return focus(page, step.click, { click: true });
  if (step.point) return focus(page, step.point);
  if (step.text) return focusText(page, step.in || 'body', step.text);
  if (step.type) {
    if (await focus(page, step.type, { click: true })) {
      await page.locator(step.type).first().fill('');
      await page.keyboard.type(step.value, { delay: step.delay ?? 40 });
    }
    return undefined;
  }
  if (step.select) {
    if (await focus(page, step.select)) await page.locator(step.select).first().selectOption(step.value);
    return undefined;
  }
  if (step.press) return page.keyboard.press(step.press);
  if (step.scroll !== undefined) {
    if (step.scroll === 'top') return smoothScrollTo(page, 0);
    if (step.scroll === 'bottom') return smoothScrollTo(page, 1e9, 1400);
    if (typeof step.scroll === 'number') return smoothScrollTo(page, (await scrollTop(page)) + step.scroll);
    return bringIntoView(page, () => page.locator(step.scroll).first().boundingBox());
  }
  if (step.moveTo) return glide(page, WIDTH * step.moveTo[0], HEIGHT * step.moveTo[1]);
  if (step.waitFor) return page.locator(step.waitFor).first().waitFor({ state: 'visible', timeout: step.timeout || 15000 });
  if (step.waitForUrl) return page.waitForURL((u) => u.href.includes(step.waitForUrl), { timeout: step.timeout || 15000 });
  if (step.eval) return page.evaluate(step.eval);
  if (step.run) return step.run(page);
  if (step.hold) return undefined;
  throw new Error(`Unknown step ${JSON.stringify(step)}`);
}

const describe = (step) => JSON.stringify(step, (k, v) => (typeof v === 'function' ? 'fn' : v));

// Spreads a scene's steps across its narration time. A string step is shorthand for { point }.
async function tour(page, ms, steps = []) {
  const items = steps.map((s) => (typeof s === 'string' ? { point: s } : s));
  const total = items.reduce((sum, s) => sum + (s.weight ?? 1), 0) || 1;
  const start = Date.now();
  let planned = 0;
  for (const item of items) {
    try {
      await runStep(page, item);
    } catch (error) {
      warn(`step failed ${describe(item)}: ${String(error.message).split('\n')[0]}`);
    }
    planned += (ms * (item.weight ?? 1)) / total;
    await sleep(planned - (Date.now() - start));
  }
}

// ---------------------------------------------------------------- recording

const SCREENCAST = { format: 'jpeg', quality: 92, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 };

// Captures Chrome screencast frames and lays them on a constant-frame-rate timeline.
class ScreencastRecorder {
  constructor(page, file) {
    Object.assign(this, { page, file, written: 0, last: null, t0: null });
  }

  async start() {
    this.ffmpeg = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'faster', '-crf', '16', '-pix_fmt', 'yuv420p', this.file,
    ], { stdio: ['pipe', 'ignore', 'inherit'] });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const now = Date.now();
      const stamped = metadata?.timestamp ? metadata.timestamp * 1000 : now;
      if (this.t0 !== null) this.fill(Math.abs(stamped - now) < 2000 ? stamped : now);
      this.last = Buffer.from(data, 'base64');
    });
    await this.cdp.send('Page.startScreencast', SCREENCAST);
  }

  begin() { this.t0 = Date.now(); }

  // Cross-origin navigations can swap the renderer, so re-arm the screencast after them.
  resume() { return this.cdp.send('Page.startScreencast', SCREENCAST).catch(() => {}); }

  fill(untilMs) {
    const target = Math.floor(((untilMs - this.t0) / 1000) * FPS);
    while (this.last && this.written < target) {
      this.ffmpeg.stdin.write(this.last);
      this.written += 1;
    }
  }

  async stop() {
    this.fill(Date.now());
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    this.ffmpeg.stdin.end();
    const [code] = await once(this.ffmpeg, 'close');
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code} while encoding the screen capture`);
  }
}

async function record(clips) {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new Error(`${error.message.split('\n')[0]}\nRun: npx playwright install chromium`);
  }
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, colorScheme: config.colorScheme || 'light' });
  await context.addInitScript(pageHelpers);
  const page = await context.newPage();
  context.on('page', (other) => { if (other !== page) other.close().catch(() => {}); });
  await goto(page, config.start || scenes[0].steps?.find((s) => s.goto)?.goto || '/');

  let recorder = null;
  if (!DRY) {
    recorder = new ScreencastRecorder(page, path.join(WORK_DIR, 'screen.mp4'));
    await recorder.start();
    let origin = new URL(page.url()).origin;
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const next = new URL(frame.url()).origin;
      if (next !== origin) { origin = next; recorder.resume(); }
    });
    await sleep(1200);
    recorder.begin();
  }

  const startedAt = Date.now();
  const offsets = {};
  for (const scene of scenes) {
    const ms = clips[scene.id].seconds * 1000 * TIME_SCALE;
    const begin = Date.now();
    offsets[scene.id] = (begin - startedAt) / 1000;
    console.log(`  scene  ${scene.id.padEnd(20)} @ ${offsets[scene.id].toFixed(1)}s`);
    await tour(page, ms, scene.steps);
    const over = (Date.now() - begin - ms) / 1000;
    if (!DRY && over > 1.5) warn(`scene "${scene.id}" ran ${over.toFixed(1)}s past its narration; add a sentence or drop steps`);
    await sleep(ms + SCENE_GAP_MS * TIME_SCALE - (Date.now() - begin));
  }
  await sleep(TAIL_MS * TIME_SCALE);
  const totalSeconds = (Date.now() - startedAt) / 1000;
  if (recorder) await recorder.stop();
  await browser.close();
  return { videoFile: recorder?.file, offsets, totalSeconds };
}

// ---------------------------------------------------------------- captions

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

function captionChunks(sentence, max = 90) {
  if (sentence.length <= max) return [sentence];
  const chunks = [];
  for (const clause of sentence.match(/[^,:;]+[,:;]?/g).map((c) => c.trim())) {
    const prev = chunks[chunks.length - 1];
    if (prev && prev.length + clause.length + 1 <= max) chunks[chunks.length - 1] = `${prev} ${clause}`;
    else chunks.push(clause);
  }
  return chunks;
}

function wrapCaption(text, max = 48) {
  if (text.length <= max) return text;
  const mid = text.length / 2;
  let split = -1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === ' ' && (split < 0 || Math.abs(i - mid) < Math.abs(split - mid))) split = i;
  }
  return split < 0 ? text : `${text.slice(0, split)}\n${text.slice(split + 1)}`;
}

function buildCaptions(clips, offsets) {
  const cues = [];
  for (const scene of scenes) {
    const parts = scene.text.match(/[^.!?]+[.!?]+["”’]?|[^.!?]+$/g).map((s) => s.trim()).filter(Boolean).flatMap((s) => captionChunks(s));
    const chars = parts.reduce((sum, s) => sum + s.length, 0);
    let t = offsets[scene.id];
    for (const part of parts) {
      const d = (clips[scene.id].seconds * part.length) / chars;
      cues.push({ start: t, end: t + d, text: wrapCaption(part) });
      t += d;
    }
  }
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

// ---------------------------------------------------------------- music

// Royalty-free fallback: a soft chord pad with a gentle arpeggio (Cmaj7, Am7, Fmaj7, G6).
async function synthPad(seconds, file) {
  const rate = 44100;
  const frames = Math.ceil(seconds * rate);
  const wav = Buffer.alloc(44 + frames * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + frames * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(frames * 4, 40);
  const chords = [[130.81, 164.81, 196.0, 246.94], [110.0, 130.81, 164.81, 196.0], [87.31, 110.0, 130.81, 164.81], [98.0, 123.47, 146.83, 196.0]];
  const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
  const TAU = Math.PI * 2;
  const mod = (a, b) => ((a % b) + b) % b;
  for (let i = 0; i < frames; i += 1) {
    const t = i / rate;
    let pad = 0;
    for (let c = 0; c < 4; c += 1) {
      const x = mod(t - c * 4, 16);
      if (x >= 8) continue;
      const env = Math.sin((Math.PI * x) / 8) ** 2;
      for (const f of chords[c]) pad += env * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t));
    }
    const step = Math.floor(t / 0.5);
    const local = t - step * 0.5;
    const note = chords[Math.floor(mod(t - 2, 16) / 4)][pattern[step % 8]] * 2;
    const arp = Math.min(1, local * 400) * Math.exp(-5 * local) * Math.sin(TAU * note * local);
    const pan = step % 2 ? 0.35 : 0.65;
    const left = 0.045 * pad + 0.12 * arp * (1 - pan);
    const right = 0.045 * pad + 0.12 * arp * pan;
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left)) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right)) * 32767), 46 + i * 4);
  }
  await writeFile(file, wav);
}

// ---------------------------------------------------------------- mix

async function mux({ videoFile, offsets, totalSeconds }, clips, srtFile, outFile) {
  const T = totalSeconds.toFixed(3);
  const inputs = ['-i', videoFile];
  const filters = [];
  const labels = [];
  scenes.forEach((scene, i) => {
    inputs.push('-i', clips[scene.id].file);
    filters.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(offsets[scene.id] * 1000)}:all=1[n${i}]`);
    labels.push(`[n${i}]`);
  });
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad,atrim=0:${T},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[voice]`);
  let audioOut = '[voice]';
  let next = scenes.length + 1;
  if (MUSIC !== 'none') {
    if (MUSIC === 'file') {
      inputs.push('-stream_loop', '-1', '-i', musicFile);
    } else {
      const padFile = path.join(WORK_DIR, 'pad.wav');
      await synthPad(totalSeconds + 1, padFile);
      inputs.push('-i', padFile);
    }
    filters.push(
      '[voice]asplit=2[vmix][vkey]',
      `[${next}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${T},loudnorm=I=-16:TP=-2,aresample=48000,`
        + `volume=${MUSIC_VOLUME},lowpass=f=7000,equalizer=f=2500:t=q:w=1.2:g=-5,`
        + `afade=t=in:d=3,afade=t=out:st=${Math.max(0, totalSeconds - 5).toFixed(3)}:d=5[bg]`,
      // Light bed: the speech band is carved out and the music ducks further whenever the voice speaks.
      '[bg][vkey]sidechaincompress=threshold=0.01:ratio=6:attack=40:release=900[ducked]',
      '[vmix][ducked]amix=inputs=2:normalize=0:duration=first[mix]',
    );
    audioOut = '[mix]';
    next += 1;
  }
  inputs.push('-i', srtFile);
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', audioOut, '-map', `${next}:s`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-t', T, '-movflags', '+faststart', outFile,
  ], { maxBuffer: 1024 * 1024 * 16 });
}

// ---------------------------------------------------------------- main

async function main() {
  if (!config.targets || !Object.keys(config.targets).length) throw new Error('video.config.mjs needs at least one target.');
  if (!scenes.length) throw new Error(only ? `No scenes matched --only=${only.join(',')}.` : 'video.config.mjs has no scenes.');
  const ids = new Set();
  for (const scene of scenes) {
    if (!scene.id || !scene.text) throw new Error(`Every scene needs an id and text (${describe(scene)}).`);
    if (ids.has(scene.id)) throw new Error(`Duplicate scene id "${scene.id}".`);
    ids.add(scene.id);
  }
  if (musicFile && MUSIC === 'pad') console.warn(`  warn   music file not found (${config.music}); using the built-in soft pad`);
  await rm(WORK_DIR, { recursive: true, force: true });
  await mkdir(WORK_DIR, { recursive: true });

  let clips;
  if (DRY) {
    console.log('Dry run: checking every step at high speed (no audio, no recording)');
    clips = Object.fromEntries(scenes.map((s) => [s.id, { seconds: s.text.split(/\s+/).length / WORDS_PER_SECOND }]));
  } else {
    console.log(`1/4 Generating narration (${TTS} voice "${VOICE}")`);
    clips = await synthesize();
  }

  console.log(DRY ? 'Walking the tour' : '2/4 Recording the tour');
  const stopTargets = await startTargets();
  let recording;
  try {
    recording = await record(clips);
  } finally {
    stopTargets();
  }

  if (DRY) {
    await rm(WORK_DIR, { recursive: true, force: true });
    const estimate = Object.values(clips).reduce((s, c) => s + c.seconds, 0) + (scenes.length * SCENE_GAP_MS + TAIL_MS) / 1000;
    console.log(`\nEstimated length: ${Math.floor(estimate / 60)}m ${String(Math.round(estimate % 60)).padStart(2, '0')}s (limit ${MAX_SECONDS}s)`);
    if (warnings.length) {
      console.error(`${warnings.length} step problem(s) found; fix the selectors above.`);
      process.exitCode = 1;
    } else {
      console.log('All steps found their targets.');
    }
    return;
  }

  console.log('3/4 Writing captions');
  const srtFile = path.join(OUT_DIR, `${NAME}.srt`);
  await writeFile(srtFile, buildCaptions(clips, recording.offsets));

  console.log('4/4 Mixing narration, music and video');
  const outFile = path.join(OUT_DIR, `${NAME}.mp4`);
  await mux(recording, clips, srtFile, outFile);
  await rm(WORK_DIR, { recursive: true, force: true });

  const total = recording.totalSeconds;
  console.log(`\nDone: ${path.relative(ROOT, outFile)} (${Math.floor(total / 60)}m ${String(Math.round(total % 60)).padStart(2, '0')}s)`);
  console.log(`Captions: ${path.relative(ROOT, srtFile)}`);
  if (MUSIC === 'file' && config.musicCredit) console.log(`Music credit to include when publishing: ${config.musicCredit}`);
  if (warnings.length) console.warn(`${warnings.length} step problem(s) during recording; see warnings above.`);
  if (!only && total > MAX_SECONDS) console.warn(`Note: video is longer than ${MAX_SECONDS}s; shorten the narration.`);
}

main().catch((error) => {
  console.error(error.stderr || error.message || error);
  process.exit(1);
});
```

## Appendix B: `package.json`

```json
{
  "name": "explainer-video",
  "private": true,
  "type": "module",
  "scripts": {
    "setup": "python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile && npx playwright install chromium",
    "video": "node record.mjs"
  },
  "devDependencies": {
    "playwright": "^1.50.0"
  }
}
```

## Appendix C: example `video.config.mjs`

An example from a real project (a testing platform with a marketing site in `site/` and a Vite + Express app). Use it for
shape and tone only; write your own content from the repo you're in.

```js
export default {
  name: 'qualis-explainer',
  maxSeconds: 240,
  music: '.agents/skills/brag/assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3',
  musicCredit: 'Music: Sascha Ende, ende.app (CC BY 4.0)',
  targets: {
    site: { static: 'site' },
    app: { url: 'http://localhost:5173', health: 'http://localhost:3001/api/health', start: 'npm run dev' },
  },
  start: 'site:/',
  pronunciations: [
    [/\bnpm\b/g, 'N P M'],
    [/\bSOC 2\b/g, 'sock two'],
  ],
  scenes: [
    {
      id: 'intro',
      text: `Hi there, and welcome! I'm really glad you're here. In the next few minutes, I'll show you Qualis, a friendly, AI-powered way to test your web, API and mobile apps, quickly, safely, and with full control. So grab a coffee, and let's dive in!`,
      steps: [{ hold: true, weight: 0.6 }, '.welcome__title', { point: '.welcome__lead', weight: 1.4 }, '.welcome__stats li:nth-child(1)'],
    },
    {
      id: 'hub',
      text: `This is the feature hub. Every card here is one part of Qualis. Let's open them one by one, starting with the big picture.`,
      steps: [{ click: '.welcome [data-go="features"]', weight: 0.6 }, '.hub__title', '#featureHub .hub-card[data-feature="overview"]'],
    },
    {
      id: 'overview',
      text: `So, what is Qualis? Simply put, you describe a test in plain English, and Qualis builds it for you. Peek into the Capabilities menu, and you'll see everything neatly grouped.`,
      steps: [
        { click: '#featureHub .hub-card[data-feature="overview"]', weight: 0.6 },
        { waitFor: '#top .nbs_headline', weight: 0 },
        { point: '#top >> text=Qualis connects AI-assisted test generation', weight: 1.4 },
        '[data-mega-trigger="capabilities"]',
        '[data-mega-panel="capabilities"] >> text=Isolated Browser Worker',
      ],
    },
    {
      id: 'pulse',
      text: `Okay, quick question. Have you ever wished you had a voice bot you could simply ask: how well are my customers covered? Well, good news! Qualis Pulse is ready for you. It privately watches real user journeys, finds the ones with no tests, and drafts a test for each gap.`,
      steps: [{ goto: 'site:/#pulse' }, { point: '#pulse-title', weight: 1.4 }, '#pulse >> text=Privacy-first SDK', '#pulse >> text=Journeys, ranked by risk', '#pulse >> text=voice copilot'],
    },
    {
      id: 'api-workflow',
      text: `Testing APIs? Instead of messy scripts, you write a simple plan. One step creates an order and saves its ID, and the next step reuses it. Anything unsafe is caught before it runs.`,
      steps: [{ goto: 'site:/#api-workflow' }, '#api-title', { text: '"create-order"', in: '#api-workflow' }, { text: '{{chain.orderId}}', in: '#api-workflow' }, '#api-workflow >> text=Forward-only chaining.'],
    },
    {
      id: 'simulator',
      text: `Want to see it in action? Try the live simulator. Just press Run, and watch each step light up. It's completely safe, with no real requests, and you can even export the results.`,
      steps: [{ goto: 'site:/#simulator' }, { click: '#simulator [data-runner-start]', weight: 0.5 }, '#simulator >> text=Qualis Run Console', '#simulator >> text=Verify receipt', '#simulator >> text=Export JSON evidence'],
    },
    {
      id: 'start',
      text: `Getting started is easy. Clone the project, install the dependencies, and run npm run dev. That's it! You begin in a safe mode, so nothing runs until you're ready.`,
      steps: [{ goto: 'site:/#start' }, '#start >> text=Clone the project', '#start >> text=Starts Express backend', '#start >> text=Safe Development Profile'],
    },
    {
      id: 'workspace-launch',
      text: `And now, my favorite part: the Test Workspace! Click Test Workspace at the top, confirm, and you're in. Let's take a quick look around.`,
      steps: [
        { click: '#topHeader [data-launch-app]', weight: 0.8 },
        '.app-confirm-features .app-confirm-feature:nth-child(1)',
        { click: '#appConfirmGo', weight: 0.8 },
        { waitForUrl: 'localhost:5173', weight: 0 },
      ],
    },
    {
      id: 'workspace',
      text: `This is where the magic happens. Pick an example, or type your own idea in plain English. Choose the test type, hit Generate Test, and in seconds, your test code is ready to review. Once it's approved, you can run it, and follow the logs and results right here. It really is that simple!`,
      steps: [
        '.workspace-page-heading h1',
        { click: '.quick-example' },
        { point: '#test-type', weight: 0.6 },
        { click: 'button:has-text("Generate Test")' },
        'text=Generated Test Code',
        'button:has-text("Execute Test")',
      ],
    },
    {
      id: 'outro',
      text: `And that's Qualis! Smart, safe and friendly testing for web, API and mobile. Thanks so much for watching, and happy testing!`,
      steps: [{ goto: 'site:/' }, { point: '.welcome__title', weight: 1.4 }, '.welcome [data-go="start"]'],
    },
  ],
};
```

## Appendix D: slides template for repos without a UI

Save it as `explainer-video/slides/index.html` and replace every placeholder with the repo's real content: name, tagline,
features, a real code example, and real install commands. Add or remove sections and cards as needed; each `<section>` fills one screen.
Use `targets: { slides: { static: 'explainer-video/slides' } }`, `headerHeight: 0`, and steps such as `{ scroll: '#features' }`,
`'#feature-one'`, and `{ text: 'doSomething', in: '#how' }`.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PROJECT_NAME: overview</title>
<style>
  :root { --bg: #0f1029; --card: #181a3d; --line: #2c2f66; --text: #eef0ff; --muted: #a9adcf; --accent: #7c83ff; --accent2: #22d3ee; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 28px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text);
         background: radial-gradient(1200px 700px at 80% -10%, #2b2f7a 0, transparent 60%), var(--bg); }
  section { height: 100vh; max-width: 1560px; margin: 0 auto; padding: 0 80px; display: flex; flex-direction: column; justify-content: center; }
  .eyebrow { color: var(--accent2); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 22px; }
  h1 { font-size: 120px; line-height: 1.05; margin: .2em 0; }
  h2 { font-size: 76px; line-height: 1.1; margin: .25em 0 .4em; }
  .lead { color: var(--muted); font-size: 38px; max-width: 1200px; }
  .accent { background: linear-gradient(90deg, var(--accent), var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 28px; margin-top: 36px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 22px; padding: 34px 36px; }
  .card h3 { margin: 0 0 12px; font-size: 36px; }
  .card p { margin: 0; color: var(--muted); font-size: 26px; }
  pre { background: #0a0b1e; border: 1px solid var(--line); border-radius: 14px; padding: 32px 38px; font: 26px/1.6 ui-monospace, Menlo, monospace; color: #c9cdf7; overflow: auto; }
</style>
</head>
<body>
  <section id="intro">
    <span class="eyebrow">PROJECT_TAGLINE</span>
    <h1>PROJECT <span class="accent">NAME</span></h1>
    <p class="lead">One or two sentences, from the README, on what this project is and who it is for.</p>
  </section>

  <section id="features">
    <span class="eyebrow">Features</span>
    <h2>What it does</h2>
    <div class="grid">
      <div class="card" id="feature-one"><h3>Feature one</h3><p>Short, plain description taken from the code or docs.</p></div>
      <div class="card" id="feature-two"><h3>Feature two</h3><p>Short, plain description taken from the code or docs.</p></div>
      <div class="card" id="feature-three"><h3>Feature three</h3><p>Short, plain description taken from the code or docs.</p></div>
    </div>
  </section>

  <section id="how">
    <span class="eyebrow">How it works</span>
    <h2>A real example</h2>
<pre><code>// A short, real usage example copied from the README, docs or tests.
const result = project.doSomething({ input: 'example' });</code></pre>
  </section>

  <section id="start">
    <span class="eyebrow">Get started</span>
    <h2>Up and running in minutes</h2>
<pre><code># Real install and run commands from the README
npm install project-name</code></pre>
  </section>
</body>
</html>
```
