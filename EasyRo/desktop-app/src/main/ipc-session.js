const { ipcMain } = require("electron");
const log = require("./logger");

/** Register session IPC handlers + per-session file isolation handlers. */
function registerSessionHandlers(instanceManager, sessionManager, project) {
  ipcMain.handle("session:list", async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.listSessions();
  });

  ipcMain.handle("session:create", async (event, title) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    const session = await client.createSession(title);
    return session;
  });

  ipcMain.handle("session:delete", async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    await client.deleteSession(sessionId);
    return true;
  });

  ipcMain.handle("session:update", async (event, sessionId, data) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.updateSession(sessionId, data);
  });

  ipcMain.handle("session:todo", async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.getSessionTodo(sessionId);
  });

  ipcMain.handle("session:fork", async (event, sessionId, messageId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.forkSession(sessionId, messageId);
  });

  ipcMain.handle("session:abort", async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    await client.abortSession(sessionId);
    return true;
  });

  ipcMain.handle("session:revert", async (event, sessionId, messageId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    await client.revertSession(sessionId, messageId);
    return true;
  });

  ipcMain.handle("session:unrevert", async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    await client.unrevertSession(sessionId);
    return true;
  });

  ipcMain.handle("session:messages", async (event, sessionId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.getSessionMessages(sessionId);
  });

  // Session file isolation
  ipcMain.handle("session:save-current", async () => {
    try {
      const id = sessionManager.getActiveSession();
      if (id) sessionManager.saveCurrentTo(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("session:restore", async (event, sessionId) => {
    try {
      await sessionManager.restoreFrom(sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("session:delete-snapshot", async (event, sessionId) => {
    try {
      sessionManager.deleteSnapshot(sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("session:get-active", async () => {
    return sessionManager ? sessionManager.getActiveSession() : null;
  });
}

module.exports = { registerSessionHandlers };
