const { ipcMain, shell } = require("electron");
const log = require("./logger");

/** Register logging, external-open, and theme IPC handlers. */
function registerMiscHandlers(instanceManager, sessionManager, project) {
  // Renderer-side logging
  ipcMain.handle("log:write", (event, level, category, message) => {
    const lvl = ["info", "warn", "error"].includes(level) ? level : "info";
    log[lvl](category, message);
  });

  ipcMain.handle("open:external", async (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle("window:set-theme", (event, theme) => {
    const mainWindow = require("./window").getMainWindow();
    if (mainWindow) {
      mainWindow.setBackgroundColor(theme === "dark" ? "#0f1923" : "#f5f7fa");
      if (mainWindow.setTitleBarOverlay) {
        if (theme === "dark") {
          mainWindow.setTitleBarOverlay({
            color: "#0f1923",
            symbolColor: "#ffffff",
            height: 22,
          });
        } else {
          mainWindow.setTitleBarOverlay({
            color: "#d4e7fb",
            symbolColor: "#18283a",
            height: 22,
          });
        }
      }
    }
  });
}

module.exports = { registerMiscHandlers };
