const { ipcMain } = require("electron");
const log = require("./logger");

/** Register message sending + permission/question response handlers. */
function registerMessageHandlers(instanceManager, sessionManager, project) {
  ipcMain.handle("message:send", async (event, sessionId, text, model) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    log.info("IPC", "message:send", { sessionId });
    return await client.sendMessage(sessionId, text, model);
  });

  ipcMain.handle(
    "message:sendAsync",
    async (event, sessionId, text, model, agent) => {
      const client = instanceManager.getClient(project.id);
      if (!client) throw new Error("Instance not running");
      const t0 = Date.now();
      log.info(
        "IPC",
        `[Perf] message:sendAsync START, session: ${sessionId}, agent: ${agent}`,
      );
      await client.sendMessageAsync(sessionId, text, model, agent);
      log.info(
        "IPC",
        `[Perf] message:sendAsync HTTP done in ${Date.now() - t0}ms`,
      );
      return true;
    },
  );

  ipcMain.handle(
    "permission:respond",
    async (event, sessionId, permissionId, response, remember) => {
      const client = instanceManager.getClient(project.id);
      if (!client) throw new Error("Instance not running");
      await client.respondPermission(
        sessionId,
        permissionId,
        response,
        remember,
      );
      return true;
    },
  );

  ipcMain.handle("question:respond", async (event, requestID, answers) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    await client.respondQuestion(requestID, answers);
    return true;
  });

  ipcMain.handle("question:reject", async (event, requestID) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    await client.rejectQuestion(requestID);
    return true;
  });
}

module.exports = { registerMessageHandlers };
