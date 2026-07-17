const { ipcMain } = require("electron");
const log = require("./logger");

/** Register file operation + health-check IPC handlers. */
function registerFileHandlers(instanceManager, sessionManager, project) {
  ipcMain.handle("file:read", async (event, filePath) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.readFile(filePath);
  });

  ipcMain.handle("file:search", async (event, pattern) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.searchFiles(pattern);
  });

  ipcMain.handle("file:find", async (event, query) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.findFiles(query);
  });

  ipcMain.handle("health:check", async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) return { healthy: false };
    try {
      return await client.health();
    } catch {
      return { healthy: false };
    }
  });
}

module.exports = { registerFileHandlers };
