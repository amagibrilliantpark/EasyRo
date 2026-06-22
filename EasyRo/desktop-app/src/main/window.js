const { BrowserWindow } = require('electron');
const path = require('path');
const log = require('./logger');

let mainWindow;

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

  // Forward renderer logs to main process logger (only in dev mode)
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const lvl = level === 0 ? 'info' : level === 1 ? 'warn' : 'error';
      log[lvl]('RENDERER', message);
    });
  }

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function getMainWindow() {
  return mainWindow;
}

module.exports = { createWindow, getMainWindow };
