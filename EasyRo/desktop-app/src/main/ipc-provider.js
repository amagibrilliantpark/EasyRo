const { ipcMain } = require("electron");
const log = require("./logger");

/** Register config, provider, agent, and tools IPC handlers. */
function registerProviderHandlers(instanceManager, sessionManager, project) {
  ipcMain.handle("config:get", async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.getConfig();
  });

  ipcMain.handle("config:set", async (event, patch) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.patchConfig(patch);
  });

  ipcMain.handle("provider:list", async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.listProviders();
  });

  ipcMain.handle("provider:auth-methods", async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.getProviderAuth();
  });

  ipcMain.handle("provider:connect", async (event, providerId, credentials) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.setAuth(providerId, credentials);
  });

  ipcMain.handle(
    "provider:oauth-authorize",
    async (event, providerId, method, inputs) => {
      const client = instanceManager.getClient(project.id);
      if (!client) throw new Error("Instance not running");
      return await client.oauthAuthorize(providerId, method, inputs);
    },
  );

  ipcMain.handle(
    "provider:oauth-callback",
    async (event, providerId, method, code) => {
      const client = instanceManager.getClient(project.id);
      if (!client) throw new Error("Instance not running");
      return await client.oauthCallback(providerId, method, code);
    },
  );

  ipcMain.handle("provider:delete", async (event, providerId) => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.deleteAuth(providerId);
  });

  ipcMain.handle("agent:list", async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.listAgents();
  });

  ipcMain.handle("tools:list", async () => {
    const client = instanceManager.getClient(project.id);
    if (!client) throw new Error("Instance not running");
    return await client.listTools();
  });
}

module.exports = { registerProviderHandlers };
