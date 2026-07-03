const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Project info (sent from main process on auto-start)
  onProjectReady: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('project:ready', handler);
    return () => ipcRenderer.removeListener('project:ready', handler);
  },
  onProjectError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('project:error', handler);
    return () => ipcRenderer.removeListener('project:error', handler);
  },

  // Instance management
  instance: {
    start: () => ipcRenderer.invoke('instance:start'),
    stop: () => ipcRenderer.invoke('instance:stop'),
    status: () => ipcRenderer.invoke('instance:status')
  },

  // Session management
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    create: (title) => ipcRenderer.invoke('session:create', title),
    delete: (sessionId) => ipcRenderer.invoke('session:delete', sessionId),
    update: (sessionId, data) => ipcRenderer.invoke('session:update', sessionId, data),
    todo: (sessionId) => ipcRenderer.invoke('session:todo', sessionId),
    fork: (sessionId, messageId) => ipcRenderer.invoke('session:fork', sessionId, messageId),
    abort: (sessionId) => ipcRenderer.invoke('session:abort', sessionId),
    revert: (sessionId, messageId) => ipcRenderer.invoke('session:revert', sessionId, messageId),
    unrevert: (sessionId) => ipcRenderer.invoke('session:unrevert', sessionId),
    messages: (sessionId) => ipcRenderer.invoke('session:messages', sessionId),
    saveCurrent: () => ipcRenderer.invoke('session:save-current'),
    restore: (sessionId) => ipcRenderer.invoke('session:restore', sessionId),
    deleteSnapshot: (sessionId) => ipcRenderer.invoke('session:delete-snapshot', sessionId),
    getActive: () => ipcRenderer.invoke('session:get-active')
  },

  // Message sending
  message: {
    send: (sessionId, text, model) => ipcRenderer.invoke('message:send', sessionId, text, model),
    sendAsync: (sessionId, text, model, agent) => ipcRenderer.invoke('message:sendAsync', sessionId, text, model, agent)
  },

  // Permission & Question responses
  permission: {
    respond: (sessionId, permissionId, response, remember) =>
      ipcRenderer.invoke('permission:respond', sessionId, permissionId, response, remember)
  },

  question: {
    respond: (requestID, answers) =>
      ipcRenderer.invoke('question:respond', requestID, answers),
    reject: (requestID) =>
      ipcRenderer.invoke('question:reject', requestID)
  },

  // Config & Provider
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (patch) => ipcRenderer.invoke('config:set', patch)
  },

  provider: {
    list: () => ipcRenderer.invoke('provider:list')
  },

  agent: {
    list: () => ipcRenderer.invoke('agent:list')
  },

  tools: {
    list: () => ipcRenderer.invoke('tools:list')
  },

  // File operations
  file: {
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    search: (pattern) => ipcRenderer.invoke('file:search', pattern),
    find: (query) => ipcRenderer.invoke('file:find', query)
  },

  // Health check
  health: {
    check: () => ipcRenderer.invoke('health:check')
  },

  // Open external URL
  openExternal: (url) => ipcRenderer.invoke('open:external', url),

  // Window controls
  window: {
    setTheme: (theme) => ipcRenderer.invoke('window:set-theme', theme)
  },

  // SSE Events (real-time updates from OpenCode)
  onEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('sse:event', handler);
    return () => ipcRenderer.removeListener('sse:event', handler);
  },

  // Logging (sends logs to main process file logger)
  log: (level, category, message) => {
    ipcRenderer.invoke('log:write', level, category, message);
  }
});
