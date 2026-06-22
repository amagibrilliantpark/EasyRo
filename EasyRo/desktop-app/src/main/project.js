const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('./logger');

const PROJECT_ID = 'default';

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
    log.info('SYSTEM', 'User project already initialised at', userProjectDir);
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
  const projectJson = path.join(projectPath, 'default.project.json');
  let name = 'EasyRo';
  try {
    const config = JSON.parse(fs.readFileSync(projectJson, 'utf-8'));
    name = config.name || name;
  } catch {}
  return { id: PROJECT_ID, name, path: projectPath };
}

module.exports = { ensureUserProject, getProject, PROJECT_ID };
