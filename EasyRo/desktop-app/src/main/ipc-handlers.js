/** Register all IPC handlers for renderer ↔ main communication.
 *  Handlers are split into focused submodules under ipc-*.js, each exporting a
 *  register* function; this file just wires them up. */
function setupIpcHandlers(instanceManager, sessionManager, project) {
  require("./ipc-instance").registerInstanceHandlers(
    instanceManager,
    sessionManager,
    project,
  );
  require("./ipc-session").registerSessionHandlers(
    instanceManager,
    sessionManager,
    project,
  );
  require("./ipc-message").registerMessageHandlers(
    instanceManager,
    sessionManager,
    project,
  );
  require("./ipc-provider").registerProviderHandlers(
    instanceManager,
    sessionManager,
    project,
  );
  require("./ipc-file").registerFileHandlers(
    instanceManager,
    sessionManager,
    project,
  );
  require("./ipc-misc").registerMiscHandlers(
    instanceManager,
    sessionManager,
    project,
  );
}

module.exports = { setupIpcHandlers };
