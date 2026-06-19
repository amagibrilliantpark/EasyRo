const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { InstanceManager } = require('./instance-manager');
const { SessionManager } = require('./session-manager');

let mainWindow;
const instanceManager = new InstanceManager();
let sessionManager = null;

const PROJECT_ID = 'default';

/**
 * Walk up from the app directory to find default.project.json.
 * Falls back to three levels up from main.js.
 */
function getProjectPath() {
  const fs = require('fs');
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'default.project.json');
    if (fs.existsSync(candidate)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: two levels up from main.js (src/main -> desktop-app -> EasyRo project root)
  return path.resolve(__dirname, '..', '..', '..');
}

/** Read project config and return { id, name, path }. */
function getProject() {
  const fs = require('fs');
  const projectPath = getProjectPath();
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

  // Forward renderer logs to main process terminal for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const prefix = level === 0 ? '[Renderer]' : level === 1 ? '[Renderer WARN]' : '[Renderer ERR]';
    console.log(prefix, message);
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
    console.log('[EasyRo] Project path:', project.path);
    console.log('[EasyRo] Project name:', project.name);

    sessionManager = new SessionManager(project.path);
    sessionManager.init();

    const ports = instanceManager.allocatePorts(project.id);
    console.log('[EasyRo] Starting Rojo on port', ports.rojo, 'and OpenCode on port', ports.opencode);
    await instanceManager.startInstance(project, ports);
    setupSSEBridge(project.id, ports.opencode);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:ready', { projectId: project.id, name: project.name, ports });
    }
  } catch (error) {
    console.error('[EasyRo] Startup error:', error.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:error', { error: error.message });
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (sessionManager) sessionManager.cleanup();
  await instanceManager.killAll();
  cleanupAllSSEBridges();
  if (process.platform !== 'darwin') app.quit();
});

/** Register all IPC handlers for renderer ↔ main communication. */
function setupIpcHandlers() {
  const project = getProject();

  // Instance management
  ipcMain.handle('instance:start', async () => {
    const ports = instanceManager.allocatePorts(project.id);
    await instanceManager.startInstance(project, ports);
    setupSSEBridge(project.id, ports.opencode);
    return ports;
  });

  ipcMain.handle('instance:stop', async () => {
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
    const sessionId = typeof session === 'string' ? session : session.id;
    if (sessionManager && sessionId) {
      sessionManager.createSessionDir(sessionId);
    }
    return session;
  });

  ipcMain.handle('session:delete', async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.deleteSession(sessionId);
    if (sessionManager && sessionId) {
      sessionManager.deleteSessionDir(sessionId);
    }
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

  ipcMain.handle('session:switch', async (event, sessionId) => {
    if (!sessionManager) throw new Error('Session manager not initialized');
    sessionManager.switchToSession(sessionId);
    return true;
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
    return await client.sendMessage(sessionId, text, model);
  });

  ipcMain.handle('message:sendAsync', async (event, sessionId, text, model, agent) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
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
}

// SSE Bridge: forwards OpenCode server-sent events to the renderer process
const sseBridges = new Map();

/**
 * Connect to OpenCode's SSE endpoint and forward events to the renderer.
 * Auto-reconnects on disconnect.
 */
function setupSSEBridge(projectId, port) {
  cleanupSSEBridge(projectId);
  console.log('[SSE Bridge] Connecting to port', port);

  const bridge = { req: null, reconnectTimer: null, destroyed: false };
  sseBridges.set(projectId, bridge);

  function connectSSE() {
    if (bridge.destroyed) return;

    const http = require('http');
    const req = http.get(`http://127.0.0.1:${port}/event`, (res) => {
      console.log('[SSE Bridge] Connected, status:', res.statusCode);
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
        console.log('[SSE Bridge] Stream ended');
        bridge.reconnectTimer = setTimeout(connectSSE, 2000);
      });
    });

    req.on('error', (err) => {
      if (bridge.destroyed) return;
      console.error('[SSE Bridge] Connection error:', err.message);
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
