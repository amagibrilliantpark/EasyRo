const { app, BrowserWindow } = require('electron');
const { InstanceManager } = require('./instance-manager');
const { SessionManager } = require('./session-manager');
const { SyncRoClient } = require('./syncro-client');
const log = require('./logger');
const { createWindow, getMainWindow } = require('./window');
const { getProject } = require('./project');
const { setupIpcHandlers } = require('./ipc-handlers');
const { setupSSEBridge, cleanupAllSSEBridges } = require('./sse-bridge');

const instanceManager = new InstanceManager();
let sessionManager;
let syncroClient;

// ── Event loop heartbeat ──
// Detects if the main process event loop is blocked (causes Windows "not responding")
let _heartbeatLastTick = Date.now();
let _heartbeatInterval = setInterval(() => {
  const now = Date.now();
  const gap = now - _heartbeatLastTick;
  if (gap > 3000) {
    log.warn('SYSTEM', `[Heartbeat] Event loop blocked for ${gap}ms! This causes "not responding"`);
  }
  _heartbeatLastTick = now;
}, 2000);

app.whenReady().then(async () => {
  // ── Ensure only one EasyRo instance runs ──
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  // ── Clean shutdown: kill child processes (SyncRo + OpenCode/Bun tree) on ANY
  //    quit path, then force-exit so the main process can never become a zombie. ──
  let _quitting = false;
  let _startupTimeout = null;
  let _startupProgressInterval = null;
  app.on('before-quit', (event) => {
    if (_quitting) return;
    _quitting = true;
    event.preventDefault();
    (async () => {
      try {
        // Clear startup timers
        if (_startupTimeout) clearTimeout(_startupTimeout);
        if (_startupProgressInterval) clearInterval(_startupProgressInterval);
        
        if (sessionManager) {
          const activeId = sessionManager.getActiveSession();
          if (activeId) { try { sessionManager.saveCurrentTo(activeId); } catch (e) {} }
        }
        if (syncroClient) {
          syncroClient.shutdown();
        }
        await instanceManager.killAll();
        cleanupAllSSEBridges();
        await log.shutdown(); // Flush logs before exit
      } catch (e) {
        log.warn('SYSTEM', 'Cleanup error during quit:', e && e.message);
      } finally {
        clearInterval(_heartbeatInterval);
        app.exit(0);
      }
    })();
  });

  const appStart = Date.now();
  log.info('SYSTEM', '=== Application starting ===');
  log.info('SYSTEM', `Platform: ${process.platform}, Arch: ${process.arch}, Electron: ${process.versions.electron}`);
  log.info('SYSTEM', `App path: ${app.getAppPath()}`);
  log.info('SYSTEM', `User data: ${app.getPath('userData')}`);

  log.info('SYSTEM', 'Creating main window...');
  createWindow();
  log.info('SYSTEM', `Main window created in ${Date.now() - appStart}ms`);

  log.info('SYSTEM', 'Getting project configuration...');
  const project = getProject();
  log.info('SYSTEM', `Project: ${project.name} (${project.id})`);
  log.info('SYSTEM', `Project path: ${project.path}`);

  log.info('SYSTEM', 'Initializing session manager...');
  sessionManager = new SessionManager(project.path, null); // SyncRoClient will be set after instance starts
  sessionManager.init();
  log.info('SYSTEM', `Session manager initialized in ${Date.now() - appStart}ms`);

  log.info('SYSTEM', 'Setting up IPC handlers...');
  setupIpcHandlers(instanceManager, sessionManager, project);
  log.info('SYSTEM', `IPC handlers configured in ${Date.now() - appStart}ms`);

  // Auto-start the project instance with timeout
  _startupTimeout = setTimeout(() => {
    log.error('SYSTEM', `=== STARTUP TIMEOUT after 60 seconds ===`);
    log.error('SYSTEM', 'Current instance status:', instanceManager.getStatus('default'));
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:error', { error: 'Startup timeout: Instance failed to start within 60 seconds. Check logs for details.' });
    }
  }, 60000);

  // Periodic startup progress monitor
  _startupProgressInterval = setInterval(() => {
    const elapsed = Date.now() - appStart;
    const status = instanceManager.getStatus(project.id);
    log.info('SYSTEM', `[Startup Monitor] ${elapsed}ms - Status: ${status.status}`);
    if (status.error) log.error('SYSTEM', `[Startup Monitor] Error: ${status.error}`);
    if (status.status === 'running' || status.status === 'error' || elapsed > 65000) {
      clearInterval(_startupProgressInterval);
    }
  }, 5000);

  try {
    const ports = instanceManager.allocatePorts(project.id);
    log.info('SYSTEM', `Allocated ports - SyncRo: ${ports.syncro}, OpenCode: ${ports.opencode}`);

    // Start instance in background to avoid blocking UI
    log.info('SYSTEM', 'Starting instance initialization in background...');
    setImmediate(async () => {
      try {
        const instanceStart = Date.now();
        log.info('SYSTEM', 'Beginning instance start process...');
        await instanceManager.startInstance(project, ports);
        log.info('SYSTEM', `Instance started in ${Date.now() - instanceStart}ms`);
        clearTimeout(_startupTimeout);

        // Create SyncRo client after instance starts
        log.info('SYSTEM', `Creating SyncRo client for port ${ports.syncro}...`);
        syncroClient = new SyncRoClient(ports.syncro);
        try {
          await syncroClient.connect();
          log.info('SYSTEM', 'SyncRo client connected');
          // Update SessionManager with SyncRo client
          sessionManager.syncroClient = syncroClient;
        } catch (error) {
          log.warn('SYSTEM', `SyncRo client connection failed: ${error.message} - continuing without SyncRo control`);
        }

        log.info('SYSTEM', `Setting up SSE bridge on port ${ports.opencode}...`);
        setupSSEBridge(project.id, ports.opencode);
        log.info('SYSTEM', `SSE bridge configured in ${Date.now() - appStart}ms`);

        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          log.info('SYSTEM', 'Sending project:ready event to renderer');
          mainWindow.webContents.send('project:ready', { projectId: project.id, name: project.name, ports });
          log.info('SYSTEM', `=== Startup completed in ${Date.now() - appStart}ms ===`);
        }
      } catch (error) {
        clearTimeout(_startupTimeout);
        log.error('SYSTEM', `Startup error after ${Date.now() - appStart}ms:`, error.message);
        log.error('SYSTEM', 'Error stack:', error.stack);
        log.error('SYSTEM', 'Current instance status:', instanceManager.getStatus(project.id));
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project:error', { error: error.message });
        }
      }
    });
  } catch (error) {
    clearTimeout(_startupTimeout);
    log.error('SYSTEM', `Startup initialization error after ${Date.now() - appStart}ms:`, error.message);
    log.error('SYSTEM', 'Error stack:', error.stack);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:error', { error: error.message });
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  log.info('SYSTEM', 'All windows closed, shutting down...');
  try {
    // Clear startup timers
    if (_startupTimeout) clearTimeout(_startupTimeout);
    if (_startupProgressInterval) clearInterval(_startupProgressInterval);
    
    if (sessionManager) {
      const activeId = sessionManager.getActiveSession();
      if (activeId) {
        try { sessionManager.saveCurrentTo(activeId); } catch (e) {}
      }
    }
    if (syncroClient) {
      syncroClient.shutdown();
    }
    await instanceManager.killAll();
    cleanupAllSSEBridges();
    await log.shutdown(); // Flush logs before exit
  } catch (e) {
    log.warn('SYSTEM', 'Cleanup error during window-all-closed:', e && e.message);
  } finally {
    clearInterval(_heartbeatInterval);
    app.exit(0);
  }
});
