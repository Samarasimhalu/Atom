const fs = require('fs-extra');
const path = require('path');

const DEFAULT_TEST_FOLDER = 'atom';
const ATOM_STATE_DIR = '.atom';
const TESTS_INDEX_FILE = 'tests-index.json';
const SPECS_DIR = 'specs';
const RUNS_DIR = 'runs';

/**
 * Normalizes a relative folder path and guarantees containment inside workspaceRoot.
 */
function normalizeRelativeFolder(rawFolder) {
  if (rawFolder === undefined || rawFolder === null) return '';
  let value = String(rawFolder).trim();
  if (!value) return '';
  if (value.includes('\0')) throw new Error('invalid_target_folder');

  value = value.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (!value || value === '.') return '';
  if (path.isAbsolute(value) || /^[a-zA-Z]:/.test(value) || value.startsWith('/')) {
    throw new Error('invalid_target_folder');
  }

  const segments = value.split('/').filter(Boolean);
  if (segments.some(seg => seg === '..' || seg === '.')) {
    throw new Error('invalid_target_folder');
  }
  return segments.join('/');
}

/**
 * Extracts an explicit folder name only when the prompt unmistakably specifies a folder/directory.
 */
function extractExplicitFolderFromPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return null;

  const patterns = [
    /(?:^|\s)(?:folder|directory|dir|outputDir)\s*[:=]\s*["'`]?([a-zA-Z0-9_./\\-]+)["'`]?/i,
    /(?:in|into|to|under|inside)\s+(?:the\s+)?(?:folder|directory|dir)\s+["'`]?([a-zA-Z0-9_./\\-]+)["'`]?/i,
    /(?:save|store|put|place|create|write)(?:\s+(?:it|this|the|tests?))*\s+(?:in|into|to|under|inside)\s+(?:the\s+)?["'`]?([a-zA-Z0-9_./\\-]+)["'`]?\s+(?:folder|directory|dir)\b/i,
    /(?:save|store|put|place)\s+(?:it|this|tests?)\s+(?:in|into|to|under)\s+["'`]?([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)["'`]?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].replace(/[.,;:!?]+$/, '');
      try {
        const normalized = normalizeRelativeFolder(candidate);
        if (normalized) return normalized;
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

/**
 * Resolves the target directory inside workspaceRoot. Defaults to `<workspaceRoot>/atom`.
 * Accepts pasted absolute paths when they resolve cleanly inside `workspaceRoot`.
 */
function resolveTargetFolder({ workspaceRoot, folder, prompt } = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  let candidateFolder = folder;

  if (candidateFolder && String(candidateFolder).trim()) {
    const rawTrimmed = String(candidateFolder).trim();
    if (path.isAbsolute(rawTrimmed)) {
      const resolvedAbs = path.resolve(rawTrimmed);
      const cmpAbs = process.platform === 'win32' ? resolvedAbs.toLowerCase() : resolvedAbs;
      const cmpRoot = process.platform === 'win32' ? root.toLowerCase() : root;
      const sep = path.sep;
      if (cmpAbs === cmpRoot) {
        candidateFolder = DEFAULT_TEST_FOLDER;
      } else if (cmpAbs.startsWith(`${cmpRoot}${sep}`)) {
        candidateFolder = path.relative(root, resolvedAbs);
      } else {
        throw new Error('invalid_target_folder');
      }
    }
  }

  const explicitArg = normalizeRelativeFolder(candidateFolder);
  const explicitPromptFolder = explicitArg ? null : extractExplicitFolderFromPrompt(prompt);
  const resolvedFolder = (explicitArg && explicitArg.toLowerCase() !== 'default')
    ? explicitArg
    : (explicitPromptFolder || DEFAULT_TEST_FOLDER);

  const targetDir = path.resolve(root, resolvedFolder);
  if (targetDir !== root && !targetDir.startsWith(`${root}${path.sep}`)) {
    throw new Error('invalid_target_folder');
  }

  return {
    workspaceRoot: root,
    folder: resolvedFolder,
    targetDir,
    usedDefault: resolvedFolder === DEFAULT_TEST_FOLDER && !explicitArg && !explicitPromptFolder
  };
}

function resolvePathInsideWorkspace(workspaceRoot, candidatePath) {
  const root = path.resolve(workspaceRoot || process.cwd());
  if (!candidatePath || String(candidatePath).includes('\0')) {
    throw new Error('invalid_workspace_path');
  }
  const resolved = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(root, candidatePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('invalid_workspace_path');
  }
  return resolved;
}

function slugifyTestName(prompt, testType = 'ui') {
  const cleaned = String(prompt || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  const base = cleaned || `${testType}-test`;
  return base.startsWith(testType) ? base : `${testType}-${base}`;
}

function sanitizeFilename(filename, prompt, testType) {
  if (filename && String(filename).trim()) {
    const base = path.basename(String(filename).trim()).replace(/[^a-zA-Z0-9._-]/g, '-');
    if (/\.(spec|test)\.(ts|js|mjs|cjs)$/i.test(base)) return base;
    if (/\.(ts|js|mjs|cjs)$/i.test(base)) return base;
    return `${base.replace(/\.+$/, '')}.spec.ts`;
  }
  return `${slugifyTestName(prompt, testType)}.spec.ts`;
}

function getStatePaths(workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const stateDir = path.join(root, ATOM_STATE_DIR);
  return {
    root,
    stateDir,
    indexFile: path.join(stateDir, TESTS_INDEX_FILE),
    specsDir: path.join(stateDir, SPECS_DIR),
    runsDir: path.join(stateDir, RUNS_DIR)
  };
}

async function readTestsIndex(workspaceRoot) {
  const { indexFile } = getStatePaths(workspaceRoot);
  if (!(await fs.pathExists(indexFile))) return { version: 1, tests: [] };
  try {
    const parsed = await fs.readJson(indexFile);
    return {
      version: 1,
      tests: Array.isArray(parsed?.tests) ? parsed.tests : []
    };
  } catch (_) {
    return { version: 1, tests: [] };
  }
}

async function writeTestsIndex(workspaceRoot, tests) {
  const { stateDir, indexFile } = getStatePaths(workspaceRoot);
  await fs.ensureDir(stateDir);
  await fs.writeJson(indexFile, { version: 1, updatedAt: new Date().toISOString(), tests }, { spaces: 2 });
}

async function pickUniqueFilePath(targetDir, desiredFilename, overwrite = false) {
  const initialPath = path.join(targetDir, desiredFilename);
  if (overwrite || !(await fs.pathExists(initialPath))) {
    return { filename: desiredFilename, filePath: initialPath };
  }
  const match = desiredFilename.match(/^(.*?)(\.(?:spec|test)\.(?:ts|js|mjs|cjs)|\.(?:ts|js|mjs|cjs))$/i);
  const stem = match ? match[1] : desiredFilename;
  const ext = match ? match[2] : '.spec.ts';
  for (let i = 2; i <= 200; i += 1) {
    const candidateName = `${stem}-${i}${ext}`;
    const candidatePath = path.join(targetDir, candidateName);
    if (!(await fs.pathExists(candidatePath))) {
      return { filename: candidateName, filePath: candidatePath };
    }
  }
  const fallbackName = `${stem}-${Date.now()}${ext}`;
  return { filename: fallbackName, filePath: path.join(targetDir, fallbackName) };
}

async function saveTestToWorkspace({
  workspaceRoot,
  testData,
  folder,
  filename,
  overwrite = false,
  agent = 'test-architect',
  task = 'generate_and_save',
  policy = null,
  specification = null
}) {
  const location = resolveTargetFolder({ workspaceRoot, folder, prompt: testData.prompt });
  await fs.ensureDir(location.targetDir);

  const desiredFilename = sanitizeFilename(filename, testData.prompt, testData.testType);
  const { filename: finalFilename, filePath } = await pickUniqueFilePath(location.targetDir, desiredFilename, overwrite);
  const relativePath = path.relative(location.workspaceRoot, filePath).replace(/\\/g, '/');

  await fs.writeFile(filePath, String(testData.code || ''), 'utf8');

  const now = new Date().toISOString();
  const { specsDir } = getStatePaths(location.workspaceRoot);
  await fs.ensureDir(specsDir);

  const index = await readTestsIndex(location.workspaceRoot);
  const existingIdx = index.tests.findIndex(item => item.id === testData.id || item.relativePath === relativePath);
  const existing = existingIdx >= 0 ? index.tests[existingIdx] : null;

  const record = {
    id: testData.id,
    name: finalFilename,
    prompt: testData.prompt,
    testType: testData.testType || 'ui',
    agent,
    task,
    folder: location.folder,
    relativePath,
    summary: testData.summary || '',
    tags: testData.mcpConfig?.tags || specification?.tags || [],
    browser: testData.mcpConfig?.browser || specification?.browser || 'chromium',
    policy: policy || testData.policy || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastRun: existing?.lastRun || null
  };

  if (existingIdx >= 0) {
    index.tests[existingIdx] = record;
  } else {
    index.tests.unshift(record);
  }
  await writeTestsIndex(location.workspaceRoot, index.tests);

  const fullSpecRecord = {
    ...record,
    filePath,
    testData: {
      ...testData,
      savedFile: relativePath,
      folder: location.folder
    },
    specification: specification || testData.specification || null
  };
  await fs.writeJson(path.join(specsDir, `${testData.id}.json`), fullSpecRecord, { spaces: 2 });

  return {
    record,
    filePath,
    relativePath,
    folder: location.folder,
    usedDefaultFolder: location.usedDefault
  };
}

async function scanTestFiles(dir, rootDir) {
  const results = [];
  if (!(await fs.pathExists(dir))) return results;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.atom') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await scanTestFiles(full, rootDir));
    } else if (/\.(spec|test)\.(ts|js|mjs|cjs)$/i.test(entry.name)) {
      results.push({
        filePath: full,
        relativePath: path.relative(rootDir, full).replace(/\\/g, '/'),
        folder: path.relative(rootDir, path.dirname(full)).replace(/\\/g, '/') || '.'
      });
    }
  }
  return results;
}

async function listWorkspaceTests({ workspaceRoot, folder, testType } = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const index = await readTestsIndex(root);
  const byRelativePath = new Map();

  for (const item of index.tests) {
    try {
      const abs = resolvePathInsideWorkspace(root, item.relativePath);
      if (await fs.pathExists(abs)) {
        byRelativePath.set(item.relativePath, { ...item, filePath: abs, exists: true });
      }
    } catch (_) {
      // ignore invalid paths
    }
  }

  // Discover any user-added test files inside default atom/ folder or requested folder
  const scanTargets = new Set([path.join(root, DEFAULT_TEST_FOLDER)]);
  if (folder) {
    try {
      const normalized = normalizeRelativeFolder(folder);
      if (normalized) scanTargets.add(path.join(root, normalized));
    } catch (_) {
      // ignore invalid filter folder
    }
  }
  for (const item of byRelativePath.values()) {
    if (item.folder && item.folder !== '.') {
      scanTargets.add(path.join(root, item.folder));
    }
  }

  for (const target of scanTargets) {
    const files = await scanTestFiles(target, root);
    for (const file of files) {
      if (!byRelativePath.has(file.relativePath)) {
        const stat = await fs.stat(file.filePath);
        byRelativePath.set(file.relativePath, {
          id: `file-${Buffer.from(file.relativePath).toString('hex').slice(0, 16)}`,
          name: path.basename(file.relativePath),
          prompt: `Workspace test file (${file.relativePath})`,
          testType: 'ui',
          agent: 'test-architect',
          task: 'execute_test',
          folder: file.folder,
          relativePath: file.relativePath,
          filePath: file.filePath,
          summary: `Discovered in ${file.folder}/`,
          tags: ['workspace'],
          browser: 'chromium',
          createdAt: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
          lastRun: null,
          exists: true
        });
      }
    }
  }

  let list = [...byRelativePath.values()];
  if (folder) {
    const normalized = normalizeRelativeFolder(folder);
    if (normalized) {
      list = list.filter(t => t.folder === normalized || t.folder.startsWith(`${normalized}/`));
    }
  }
  if (testType) {
    list = list.filter(t => t.testType === testType);
  }
  list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  return list;
}

async function getWorkspaceTest({ workspaceRoot, testId, filePath } = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const tests = await listWorkspaceTests({ workspaceRoot: root });
  let match = null;
  if (testId) {
    match = tests.find(item => item.id === testId);
  }
  if (!match && filePath) {
    const resolved = resolvePathInsideWorkspace(root, filePath);
    const rel = path.relative(root, resolved).replace(/\\/g, '/');
    match = tests.find(item => item.relativePath === rel || item.filePath === resolved);
    if (!match && (await fs.pathExists(resolved))) {
      match = {
        id: `file-${Buffer.from(rel).toString('hex').slice(0, 16)}`,
        name: path.basename(rel),
        prompt: `Workspace test file (${rel})`,
        testType: 'ui',
        folder: path.relative(root, path.dirname(resolved)).replace(/\\/g, '/') || '.',
        relativePath: rel,
        filePath: resolved,
        tags: ['workspace'],
        browser: 'chromium'
      };
    }
  }
  if (!match) return null;

  const { specsDir } = getStatePaths(root);
  const specFile = path.join(specsDir, `${match.id}.json`);
  let specRecord = null;
  if (await fs.pathExists(specFile)) {
    try {
      specRecord = await fs.readJson(specFile);
    } catch (_) {
      specRecord = null;
    }
  }

  const code = (await fs.pathExists(match.filePath))
    ? await fs.readFile(match.filePath, 'utf8')
    : (specRecord?.testData?.code || '');

  const testData = specRecord?.testData
    ? { ...specRecord.testData, code, savedFile: match.relativePath, folder: match.folder }
    : {
        id: match.id,
        prompt: match.prompt,
        testType: match.testType || 'ui',
        code,
        summary: match.summary || '',
        savedFile: match.relativePath,
        folder: match.folder,
        mcpConfig: {
          name: match.name,
          description: match.prompt,
          type: match.testType || 'ui',
          browser: match.browser || 'chromium',
          tags: match.tags || ['workspace'],
          timeout: 30000,
          retries: 1
        }
      };

  return {
    ...match,
    code,
    testData,
    specification: specRecord?.specification || null
  };
}

async function updateTestLastRun({ workspaceRoot, testId, relativePath, runSummary }) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const index = await readTestsIndex(root);
  const target = index.tests.find(t => (testId && t.id === testId) || (relativePath && t.relativePath === relativePath));
  if (target) {
    target.lastRun = runSummary;
    target.updatedAt = new Date().toISOString();
    await writeTestsIndex(root, index.tests);
  }
  if (testId) {
    const { specsDir } = getStatePaths(root);
    const specFile = path.join(specsDir, `${testId}.json`);
    if (await fs.pathExists(specFile)) {
      const existing = await fs.readJson(specFile);
      existing.lastRun = runSummary;
      existing.updatedAt = new Date().toISOString();
      await fs.writeJson(specFile, existing, { spaces: 2 });
    }
  }
}

async function deleteWorkspaceTest({ workspaceRoot, testId, filePath } = {}) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const found = await getWorkspaceTest({ workspaceRoot: root, testId, filePath });
  if (!found) throw new Error('test_not_found');

  if (await fs.pathExists(found.filePath)) {
    await fs.remove(found.filePath);
  }

  const index = await readTestsIndex(root);
  const filtered = index.tests.filter(t => t.id !== found.id && t.relativePath !== found.relativePath);
  await writeTestsIndex(root, filtered);

  const { specsDir } = getStatePaths(root);
  const specFile = path.join(specsDir, `${found.id}.json`);
  if (await fs.pathExists(specFile)) {
    await fs.remove(specFile);
  }
  return { deleted: true, id: found.id, relativePath: found.relativePath };
}

module.exports = {
  DEFAULT_TEST_FOLDER,
  ATOM_STATE_DIR,
  normalizeRelativeFolder,
  extractExplicitFolderFromPrompt,
  resolveTargetFolder,
  resolvePathInsideWorkspace,
  slugifyTestName,
  saveTestToWorkspace,
  listWorkspaceTests,
  getWorkspaceTest,
  updateTestLastRun,
  deleteWorkspaceTest,
  getStatePaths
};
