const http = require('http');
const log = require('./logger');
const { getMainWindow } = require('./window');

// SSE Bridge: forwards OpenCode server-sent events to the renderer process
const sseBridges = new Map();

/**
 * Connect to OpenCode's SSE endpoint and forward events to the renderer.
 * Auto-reconnects on disconnect.
 */
function setupSSEBridge(projectId, port) {
  cleanupSSEBridge(projectId);
  log.info('SSE', 'Connecting to port', port);

  const bridge = { req: null, reconnectTimer: null, destroyed: false };
  sseBridges.set(projectId, bridge);

  function connectSSE() {
    if (bridge.destroyed) return;

    const req = http.get(`http://127.0.0.1:${port}/event`, (res) => {
      log.info('SSE', 'Connected, status:', res.statusCode);
      let buffer = '';
      let dataBuffer = '';

      res.on('data', (chunk) => {
        if (bridge.destroyed) return;
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            dataBuffer += (dataBuffer ? '\n' : '') + line.slice(6);
          } else if (line.trim() === '' && dataBuffer) {
            try {
              const data = JSON.parse(dataBuffer);
              const mainWindow = getMainWindow();
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('sse:event', {
                  projectId,
                  type: data.type,
                  properties: data.properties
                });
              }
            } catch (e) {
              // ignore parse errors
            }
            dataBuffer = '';
          }
        }
      });

      res.on('end', () => {
        if (bridge.destroyed) return;
        log.info('SSE', 'Stream ended');
        bridge.reconnectTimer = setTimeout(connectSSE, 2000);
      });
    });

    req.on('error', (err) => {
      if (bridge.destroyed) return;
      log.error('SSE', 'Connection error:', err.message);
      bridge.reconnectTimer = setTimeout(connectSSE, 3000);
    });

    bridge.req = req;
  }

  connectSSE();
}

/** Tear down the SSE connection for a specific project. */
function cleanupSSEBridge(projectId) {
  const bridge = sseBridges.get(projectId);
  if (bridge) {
    bridge.destroyed = true;
    if (bridge.reconnectTimer) {
      clearTimeout(bridge.reconnectTimer);
      bridge.reconnectTimer = null;
    }
    if (bridge.req) {
      bridge.req.destroy();
      bridge.req = null;
    }
  }
  sseBridges.delete(projectId);
}

/** Tear down all active SSE connections. */
function cleanupAllSSEBridges() {
  for (const projectId of sseBridges.keys()) {
    cleanupSSEBridge(projectId);
  }
}

module.exports = { setupSSEBridge, cleanupSSEBridge, cleanupAllSSEBridges };
