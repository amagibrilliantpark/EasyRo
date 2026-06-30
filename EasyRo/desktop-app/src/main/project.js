const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('./logger');

const PROJECT_ID = 'default';

/**
 * Install the Rojo plugin into Roblox Studio's Plugins folder if missing.
 * Handles both dev mode (file next to project) and packaged mode (extraResource).
 */
function ensureRojoPlugin() {
  const pluginsDir = path.join(
    process.env.LOCALAPPDATA || '',
    'Roblox',
    'Plugins'
  );
  const dest = path.join(pluginsDir, 'Rojo.rbxm');
  if (fs.existsSync(dest)) return;

  // 1) Packaged: bundled as extraResource
  let src = process.resourcesPath
    ? path.join(process.resourcesPath, 'Rojo.rbxm')
    : '';
  // 2) Dev: file next to project root
  if (!fs.existsSync(src)) {
    src = path.resolve(__dirname, '..', '..', '..', 'Rojo.rbxm');
  }
  if (!fs.existsSync(src)) {
    log.warn('SYSTEM', 'Rojo.rbxm source not found – skipping plugin install');
    return;
  }

  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.copyFileSync(src, dest);
  log.info('SYSTEM', `Rojo plugin installed → ${dest}`);
}

/**
 * Ensure the user has a writable project directory with all required files.
 *
 * - Development: project files exist in the source tree → return directly.
 * - Packaged (portable / NSIS): copy project template from app resources
 *   to a writable user-data directory on first run.
 *
 * Returns the absolute path to the project directory.
 */
function ensureUserProject() {
  // ── Development mode: project files live next to desktop-app/ ──
  const devProjectPath = path.resolve(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(devProjectPath, 'default.project.json'))) {
    log.info('SYSTEM', 'Dev mode: using source-tree project path');
    return devProjectPath;
  }

  // ── Packaged mode ──
  const userProjectDir = path.join(app.getPath('userData'), 'project');
  const marker = path.join(userProjectDir, 'default.project.json');

  if (fs.existsSync(marker)) {
    try {
      JSON.parse(fs.readFileSync(marker, 'utf-8'));
      log.info('SYSTEM', 'User project already initialised at', userProjectDir);
    } catch {
      log.warn('SYSTEM', 'Corrupt project JSON detected at', marker, '- reinitialising from template');
      fs.rmSync(userProjectDir, { recursive: true, force: true });
      const templateDir = path.join(process.resourcesPath, 'project');
      if (fs.existsSync(templateDir)) {
        fs.cpSync(templateDir, userProjectDir, { recursive: true });
      }
    }
  } else {
    const templateDir = path.join(process.resourcesPath, 'project');
    if (!fs.existsSync(templateDir)) {
      throw new Error(
        `Project template not found at ${templateDir}. ` +
        'Ensure default.project.json, opencode.json, AGENTS.md and src/ are bundled as extraResources.'
      );
    }
    log.info('SYSTEM', 'Initialising user project from template →', userProjectDir);
    fs.cpSync(templateDir, userProjectDir, { recursive: true });
  }

  // Guarantee Rojo $path directories exist (electron-builder may skip empty dirs)
  for (const sub of ['server', 'client', 'shared']) {
    const dir = path.join(userProjectDir, 'src', sub);
    fs.mkdirSync(dir, { recursive: true });
  }

  return userProjectDir;
}

/** Read project config and return { id, name, path }. */
function getProject() {
  const projectPath = ensureUserProject();
  ensureRojoPlugin();
  const projectJson = path.join(projectPath, 'default.project.json');
  let name = 'EasyRo';
  try {
    const config = JSON.parse(fs.readFileSync(projectJson, 'utf-8'));
    name = config.name || name;
  } catch {}
  return { id: PROJECT_ID, name, path: projectPath };
}

module.exports = { ensureUserProject, getProject, PROJECT_ID };
