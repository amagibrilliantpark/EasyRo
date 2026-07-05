const { ipcMain, shell } = require('electron');
const log = require('./logger');

/** Register all IPC handlers for renderer ↔ main communication. */
function setupIpcHandlers(instanceManager, sessionManager, project) {
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
    const { setupSSEBridge } = require('./sse-bridge');
    setupSSEBridge(project.id, ports.opencode);
    return ports;
  });

  ipcMain.handle('instance:stop', async () => {
    log.info('IPC', 'instance:stop');
    await instanceManager.stopInstance(project.id);
    const { cleanupSSEBridge } = require('./sse-bridge');
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

  ipcMain.handle('session:revert', async (event, sessionId, messageId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error('Instance not running');
    await client.revertSession(sessionId, messageId);
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
    const t0 = Date.now();
    log.info('IPC', `[Perf] message:sendAsync START, session: ${sessionId}, agent: ${agent}`);
    await client.sendMessageAsync(sessionId, text, model, agent);
    log.info('IPC', `[Perf] message:sendAsync HTTP done in ${Date.now() - t0}ms`);
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

  ipcMain.handle('open:external', async (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('window:set-theme', (event, theme) => {
    const mainWindow = require('./window').getMainWindow();
    if (mainWindow) {
      mainWindow.setBackgroundColor(theme === 'dark' ? '#0f1923' : '#f5f7fa');
      if (mainWindow.setTitleBarOverlay) {
        if (theme === 'dark') {
          mainWindow.setTitleBarOverlay({
            color: '#0f1923',
            symbolColor: '#ffffff',
            height: 22
          });
        } else {
          mainWindow.setTitleBarOverlay({
            color: '#d4e7fb',
            symbolColor: '#18283a',
            height: 22
          });
        }
      }
    }
  });
}

module.exports = { setupIpcHandlers };
