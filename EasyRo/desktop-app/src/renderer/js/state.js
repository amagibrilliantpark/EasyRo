/** Global application state shared across all renderer modules. */
window.App = {
  currentSession: null,
  isProcessing: false,
  sessions: [],
  providers: [],
  agents: [],
  currentAgent: 'build',
  currentModel: null,
  currentVariant: 'high',
  currentSessionTokens: null,
  debug: false
};
