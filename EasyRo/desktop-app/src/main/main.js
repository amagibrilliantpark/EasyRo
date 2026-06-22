const { app, BrowserWindow } = require('electron');
const { InstanceManager } = require('./instance-manager');
const { SessionManager } = require('./session-manager');
const log = require('./logger');
const { createWindow, getMainWindow } = require('./window');
const { getProject } = require('./project');
const { setupIpcHandlers } = require('./ipc-handlers');
const { setupSSEBridge, cleanupAllSSEBridges } = require('./sse-bridge');

const instanceManager = new InstanceManager();
let sessionManager;

app.whenReady().then(async () => {
  log.info('SYSTEM', 'Application starting...');
  createWindow();
  log.info('SYSTEM', 'Main window created');
  
  const project = getProject();
  sessionManager = new SessionManager(project.path);
  sessionManager.init();
  
  setupIpcHandlers(instanceManager, sessionManager, project);
  log.info('SYSTEM', 'IPC handlers configured');

  // Auto-start the project instance with timeout
  const startupTimeout = setTimeout(() => {
    log.error('SYSTEM', 'Startup timeout after 60 seconds - instance failed to start');
    log.error('SYSTEM', 'Current instance status:', instanceManager.getStatus('default'));
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('project:error', { error: 'Startup timeout: Instance failed to start within 60 seconds. Check logs for details.' });
    }
  }, 60000);

  try {
    log.info('SYSTEM', 'Getting project configuration...');
    log.info('SYSTEM', 'Project path:', project.path);
    log.info('SYSTEM', 'Project name:', project.name);
    log.info('SYSTEM', 'Project ID:', project.id);

    const ports = instanceManager.allocatePorts(project.id);
    log.info('SYSTEM', 'Allocated ports - Rojo:', ports.rojo, 'OpenCode:', ports.opencode);
    
    // Start instance in background to avoid blocking UI
    log.info('SYSTEM', 'Starting instance initialization in background...');
    setImmediate(async () => {
      try {
        log.info('SYSTEM', 'Beginning instance start process...');
        await instanceManager.startInstance(project, ports);
        log.info('SYSTEM', 'Instance started successfully');
        clearTimeout(startupTimeout);
        
        log.info('SYSTEM', 'Setting up SSE bridge on port', ports.opencode);
        setupSSEBridge(project.id, ports.opencode);
        log.info('SYSTEM', 'SSE bridge configured');
        
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          log.info('SYSTEM', 'Sending project:ready event to renderer');
          mainWindow.webContents.send('project:ready', { projectId: project.id, name: project.name, ports });
          log.info('SYSTEM', 'Startup completed successfully');
        }
      } catch (error) {
        clearTimeout(startupTimeout);
        log.error('SYSTEM', 'Startup error:', error.message);
        log.error('SYSTEM', 'Error stack:', error.stack);
        log.error('SYSTEM', 'Current instance status:', instanceManager.getStatus(project.id));
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project:error', { error: error.message });
        }
      }
    });
  } catch (error) {
    clearTimeout(startupTimeout);
    log.error('SYSTEM', 'Startup initialization error:', error.message);
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
  if (sessionManager) {
    const activeId = sessionManager.getActiveSession();
    if (activeId) {
      try { sessionManager.saveCurrentTo(activeId); } catch (e) {}
    }
  }
  await instanceManager.killAll();
  cleanupAllSSEBridges();
  if (process.platform !== 'darwin') app.quit();
});
