const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');

const { packageExtension } = require('../scripts/package-ide-extension');

const EXT_DIR = path.resolve(__dirname, '..', 'ide', 'atom-vscode-extension');

test('ATOM VS Code right-sidebar extension manifest contributes secondarySidebar view, commands, keybinding, and settings', () => {
  const manifest = fs.readJsonSync(path.join(EXT_DIR, 'package.json'));

  assert.equal(manifest.name, 'atom-test-workspace');
  assert.equal(manifest.displayName, 'ATOM World');
  assert.equal(manifest.main, './extension.js');
  assert.ok(Array.isArray(manifest.contributes.viewsContainers.secondarySidebar));
  assert.equal(manifest.contributes.viewsContainers.secondarySidebar[0].id, 'atom-sidebar');
  assert.equal(manifest.contributes.viewsContainers.secondarySidebar[0].title, 'ATOM World');

  const views = manifest.contributes.views['atom-sidebar'];
  assert.ok(Array.isArray(views));
  assert.equal(views[0].id, 'atom.testWorkspaceView');
  assert.equal(views[0].name, 'ATOM World');
  assert.equal(views[0].type, 'webview');

  const commandIds = manifest.contributes.commands.map(c => c.command);
  for (const id of [
    'atom.openNewWindow',
    'atom.openRightPanel',
    'atom.openBesideEditor',
    'atom.refreshTests',
    'atom.configureMcp',
    'atom.showGuide'
  ]) {
    assert.ok(commandIds.includes(id), `Missing command ${id}`);
  }
  assert.ok(
    manifest.contributes.menus['view/title'].some(item => item.command === 'atom.openNewWindow'),
    'Missing top-right + button menu contribution for atom.openNewWindow'
  );

  assert.ok(manifest.contributes.keybindings.some(kb => kb.command === 'atom.openRightPanel' && kb.key === 'ctrl+alt+a'));

  const props = manifest.contributes.configuration.properties;
  assert.equal(props['atom.defaultFolder'].default, 'atom');
  assert.equal(props['atom.defaultAgent'].default, 'ui-agent');
  assert.deepEqual(
    props['atom.defaultAgent'].enum,
    ['ui-agent', 'mobile-agent', 'api-agent', 'visual-agent', 'mixed-agent', 'atom-qa']
  );
  assert.ok(props['atom.executionMode']);
  assert.ok(props['atom.apiBaseUrl']);
  assert.ok(props['atom.mcpServerPath']);
});

test('Webview HTML enforces strict nonce CSP and exposes minimal Copilot-style UI controls and results dashboard', () => {
  const html = fs.readFileSync(path.join(EXT_DIR, 'webview', 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(EXT_DIR, 'webview', 'main.js'), 'utf8');
  const styles = fs.readFileSync(path.join(EXT_DIR, 'webview', 'styles.css'), 'utf8');

  assert.match(html, /script-src 'nonce-\{\{nonce\}\}'/);
  assert.match(html, /href="\{\{cssUri\}\}"/);
  assert.match(html, /src="\{\{jsUri\}\}"/);
  assert.match(html, /src="\{\{heroUri\}\}"/);
  assert.match(html, /placeholder="Ask Atom"/);
  assert.match(html, /Governed AI testing/);
  assert.match(html, /for web, API and mobile\./);
  assert.match(html, /Replayable runs\. Real-user coverage with Atom Pulse/);

  for (const requiredId of [
    'btn-new-window',
    'hero-stage',
    'atom-hero-img',
    'input-prompt',
    'btn-agent',
    'btn-model-key',
    'btn-test-dir',
    'btn-send',
    'popover-agent',
    'popover-model-key',
    'popover-test-dir',
    'input-api-key',
    'select-llm-provider',
    'select-llm-model',
    'select-mobile-platform',
    'input-test-dir',
    'results-modal',
    'kpi-total',
    'kpi-passed',
    'kpi-failed',
    'kpi-skipped',
    'results-details',
    'results-logs-section',
    'results-logs-pre',
    'results-logs-count'
  ]) {
    assert.ok(html.includes(`id="${requiredId}"`), `Missing DOM element #${requiredId}`);
  }

  for (const removedId of ['tab-logs', 'tab-media', 'select-exec-mode', 'select-task']) {
    assert.equal(html.includes(`id="${removedId}"`), false, `Legacy crowded element #${removedId} should not exist`);
  }

  assert.ok(mainJs.includes('acquireVsCodeApi'));
  assert.ok(mainJs.includes('generateTest'));
  assert.ok(mainJs.includes('executeTest'));
  assert.ok(mainJs.includes('stopExecution'));
  assert.ok(mainJs.includes('mcpExecutionLog'));
  assert.ok(mainJs.includes('newWindow'));
  assert.ok(mainJs.includes('showResultsModal'));
  assert.ok(styles.includes('.composer-card'));
  assert.ok(styles.includes('.atom-topbar'));
  assert.ok(styles.includes('.btn-stop'));
  assert.ok(styles.includes('.exec-logs-panel'));
  assert.ok(styles.includes('.results-modal'));
});

test('packageExtension builds a valid VSIX ZIP archive containing manifest, hero image, and webview assets', t => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atom-vsix-out-'));
  t.after(() => fs.removeSync(outDir));

  const outFile = path.join(outDir, 'atom-test-workspace.vsix');
  const res = packageExtension({ sourceDir: EXT_DIR, outputPath: outFile });

  assert.equal(fs.existsSync(res.outputPath), true);
  assert.equal(res.entriesCount, 10);

  const raw = fs.readFileSync(outFile);
  assert.equal(raw.subarray(0, 4).toString('binary'), 'PK\x03\x04');
  const zipText = raw.toString('latin1');
  for (const entryName of [
    '[Content_Types].xml',
    'extension.vsixmanifest',
    'extension/package.json',
    'extension/extension.js',
    'extension/media/atom-logo.png',
    'extension/media/atom-hero.jpg',
    'extension/webview/index.html',
    'extension/webview/main.js',
    'extension/webview/styles.css'
  ]) {
    assert.ok(zipText.includes(entryName), `Missing VSIX entry ${entryName}`);
  }
});
