const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { InstanceManager } = require('./instance-manager');
const { SessionManager } = require('./session-manager');
const log = require('./logger');

let mainWindow;
const instanceManager = new InstanceManager();
let sessionManager;

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

/** Create the main BrowserWindow with frameless title bar. */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 400,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f5f7fa',
      symbolColor: '#18283a',
      height: 22
    },
    backgroundColor: '#f5f7fa',
    show: false
  });

  mainWindow.maximize();
  mainWindow.show();

  mainWindow.on('unmaximize', () => {
    mainWindow.setSize(1000, 700);
    mainWindow.center();
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Forward renderer logs to main process logger
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const lvl = level === 0 ? 'info' : level === 1 ? 'warn' : 'error';
    log[lvl]('RENDERER', message);
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  createWindow();
  setupIpcHandlers();

  // Auto-start the project instance
  try {
    const project = getProject();
    log.info('SYSTEM', 'Project path:', project.path);
    log.info('SYSTEM', 'Project name:', project.name);

    const ports = instanceManager.allocatePorts(project.id);
    log.info('SYSTEM', 'Starting Rojo on port', ports.rojo, 'and OpenCode on port', ports.opencode);
    await instanceManager.startInstance(project, ports);
    setupSSEBridge(project.id, ports.opencode);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:ready', { projectId: project.id, name: project.name, ports });
    }
  } catch (error) {
    log.error('SYSTEM', 'Startup error:', error.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:error', { error: error.message });
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (sessionManager) {
    const activeId = sessionManager.getActiveSession();
    if (activeId) {
      try { sessionManager.saveCurrentTo(activeId); } catch (e) {}
    }
  }
  await instanceManager.killAll();
  cleanupAllSSEBridges();
  if (process.platform !== 'darwin') app.quit();
});

/** Register all IPC handlers for renderer ↔ main communication. */
function setupIpcHandlers() {
  const project = getProject();
  sessionManager = new SessionManager(project.path);
  sessionManager.init();

  // Renderer-side logging
  ipcMain.handle('log:write', (event, level, category, message) => {
    const lvl = ['info', 'warn', 'error'].includes(level) ? level : 'info';
    log[lvl](category, message);
  });

  // Instance management
  ipcMain.handle('instance:start', async () => {
    log.info('IPC', 'instance:start');
    const ports = instanceManager.allocatePorts(project.id);
    await instanceManager.startInstance(project, ports);
    setupSSEBridge(project.id, ports.opencode);
    return ports;
  });

  ipcMain.handle('instance:stop', async () => {
    log.info('IPC', 'instance:stop');
    await instanceManager.stopInstance(project.id);
    cleanupSSEBridge(project.id);
  });

  ipcMain.handle('instance:status', () => {
    return instanceManager.getStatus(project.id);
  });

  // Session management
  ipcMain.handle('session:list', async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.listSessions();
  });

  ipcMain.handle('session:create', async (event, title) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    const session = await client.createSession(title);
    return session;
  });

  ipcMain.handle('session:delete', async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.deleteSession(sessionId);
    return true;
  });

  ipcMain.handle('session:update', async (event, sessionId, data) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.updateSession(sessionId, data);
  });

  ipcMain.handle('session:todo', async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.getSessionTodo(sessionId);
  });

  ipcMain.handle('session:fork', async (event, sessionId, messageId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.forkSession(sessionId, messageId);
  });

  ipcMain.handle('session:abort', async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.abortSession(sessionId);
    return true;
  });

  ipcMain.handle('session:revert', async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.revertSession(sessionId);
    return true;
  });

  ipcMain.handle('session:unrevert', async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.unrevertSession(sessionId);
    return true;
  });

  ipcMain.handle('session:messages', async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.getSessionMessages(sessionId);
  });

  // Message sending
  ipcMain.handle('message:send', async (event, sessionId, text, model) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    log.info('IPC', 'message:send', { sessionId });
    return await client.sendMessage(sessionId, text, model);
  });

  ipcMain.handle('message:sendAsync', async (event, sessionId, text, model, agent) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    log.info('IPC', 'message:sendAsync', { sessionId, agent });
    await client.sendMessageAsync(sessionId, text, model, agent);
    return true;
  });

  // Permission & Question responses
  ipcMain.handle('permission:respond', async (event, sessionId, permissionId, response, remember) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.respondPermission(sessionId, permissionId, response, remember);
    return true;
  });

  ipcMain.handle('question:respond', async (event, requestID, answers) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.respondQuestion(requestID, answers);
    return true;
  });

  ipcMain.handle('question:reject', async (event, requestID) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.rejectQuestion(requestID);
    return true;
  });

  // Config & Provider
  ipcMain.handle('config:get', async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.getConfig();
  });

  ipcMain.handle('config:set', async (event, patch) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.patchConfig(patch);
  });

  ipcMain.handle('provider:list', async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.listProviders();
  });

  ipcMain.handle('agent:list', async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.listAgents();
  });

  ipcMain.handle('tools:list', async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.listTools();
  });

  // File operations
  ipcMain.handle('file:read', async (event, filePath) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.readFile(filePath);
  });

  ipcMain.handle('file:search', async (event, pattern) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.searchFiles(pattern);
  });

  ipcMain.handle('file:find', async (event, query) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    return await client.findFiles(query);
  });

  // Health check
  ipcMain.handle('health:check', async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) return { healthy: false };
    try {
      return await client.health();
    } catch {
      return { healthy: false };
    }
  });

  // Session file isolation
  ipcMain.handle('session:save-current', async () => {
    try {
      const id = sessionManager.getActiveSession();
      if (id) sessionManager.saveCurrentTo(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('session:restore', async (event, sessionId) => {
    try {
      sessionManager.restoreFrom(sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('session:delete-snapshot', async (event, sessionId) => {
    try {
      sessionManager.deleteSnapshot(sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('session:get-active', async () => {
    return sessionManager ? sessionManager.getActiveSession() : null;
  });
}

// SSE Bridge: forwards OpenCode server-sent events to the renderer process
const sseBridges = new Map();

/**
 * Connect to OpenCode's SSE endpoint and forward events to the renderer.
 * Auto-reconnects on disconnect.
 */
function setupSSEBridge(projectId, port) {
  cleanupSSEBridge(projectId);
  log.info('SSE', 'Connecting to port', port);

  const bridge = { req: null, reconnectTimer: null, destroyed: false };
  sseBridges.set(projectId, bridge);

  function connectSSE() {
    if (bridge.destroyed) return;

    const http = require('http');
    const req = http.get(`http://127.0.0.1:${port}/event`, (res) => {
      log.info('SSE', 'Connected, status:', res.statusCode);
      let buffer = '';
      let dataBuffer = '';

      res.on('data', (chunk) => {
        if (bridge.destroyed) return;
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            dataBuffer += (dataBuffer ? '\n' : '') + line.slice(6);
          } else if (line.trim() === '' && dataBuffer) {
            try {
              const data = JSON.parse(dataBuffer);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('sse:event', {
                  projectId,
                  type: data.type,
                  properties: data.properties
                });
              }
            } catch (e) {
              // ignore parse errors
            }
            dataBuffer = '';
          }
        }
      });

      res.on('end', () => {
        if (bridge.destroyed) return;
        log.info('SSE', 'Stream ended');
        bridge.reconnectTimer = setTimeout(connectSSE, 2000);
      });
    });

    req.on('error', (err) => {
      if (bridge.destroyed) return;
      log.error('SSE', 'Connection error:', err.message);
      bridge.reconnectTimer = setTimeout(connectSSE, 3000);
    });

    bridge.req = req;
  }

  connectSSE();
}

/** Tear down the SSE connection for a specific project. */
function cleanupSSEBridge(projectId) {
  const bridge = sseBridges.get(projectId);
  if (bridge) {
    bridge.destroyed = true;
    if (bridge.reconnectTimer) {
      clearTimeout(bridge.reconnectTimer);
      bridge.reconnectTimer = null;
    }
    if (bridge.req) {
      bridge.req.destroy();
      bridge.req = null;
    }
  }
  sseBridges.delete(projectId);
}

/** Tear down all active SSE connections. */
function cleanupAllSSEBridges() {
  for (const projectId of sseBridges.keys()) {
    cleanupSSEBridge(projectId);
  }
}
