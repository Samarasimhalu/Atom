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
