const { ipcMain } = require("electron");
const log = require("./logger");

/** Register instance lifecycle IPC handlers (start/stop/status). */
function registerInstanceHandlers(instanceManager, sessionManager, project) {
  ipcMain.handle("instance:start", async () => {
    log.info("IPC", "instance:start");
    const ports = instanceManager.allocatePorts(project.id);
    await instanceManager.startInstance(project, ports);
    const { setupSSEBridge } = require("./sse-bridge");
    setupSSEBridge(project.id, ports.opencode);
    return ports;
  });

  ipcMain.handle("instance:stop", async () => {
    log.info("IPC", "instance:stop");
    await instanceManager.stopInstance(project.id);
    const { cleanupSSEBridge } = require("./sse-bridge");
    cleanupSSEBridge(project.id);
  });

  ipcMain.handle("instance:status", () => {
    return instanceManager.getStatus(project.id);
  });
}

module.exports = { registerInstanceHandlers };
