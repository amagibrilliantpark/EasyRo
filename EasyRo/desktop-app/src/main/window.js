const { BrowserWindow } = require('electron');
const path = require('path');
const log = require('./logger');

let mainWindow;

/** Create the main BrowserWindow with frameless title bar. */
function createWindow() {
  const windowStart = Date.now();
  log.info('WINDOW', 'Creating main window...');

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
      color: '#d4e7fb',
      symbolColor: '#18283a',
      height: 22
    },
    backgroundColor: '#f5f7fa',
    show: false
  });

  log.info('WINDOW', `BrowserWindow created in ${Date.now() - windowStart}ms`);

  mainWindow.maximize();
  mainWindow.show();
  log.info('WINDOW', `Window maximized and shown in ${Date.now() - windowStart}ms`);

  mainWindow.on('unmaximize', () => {
    mainWindow.setSize(1000, 700);
    mainWindow.center();
  });

  log.info('WINDOW', 'Loading index.html...');
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('WINDOW', `index.html loaded in ${Date.now() - windowStart}ms`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log.error('WINDOW', `Failed to load index.html: ${errorCode} - ${errorDescription}`);
  });

  // Forward renderer logs to main process logger (only in dev mode)
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const lvl = level === 0 ? 'info' : level === 1 ? 'warn' : 'error';
      log[lvl]('RENDERER', message);
    });
  }

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
    log.info('WINDOW', 'DevTools opened');
  }

  log.info('WINDOW', `Window setup complete in ${Date.now() - windowStart}ms`);
}

function getMainWindow() {
  return mainWindow;
}

module.exports = { createWindow, getMainWindow };
