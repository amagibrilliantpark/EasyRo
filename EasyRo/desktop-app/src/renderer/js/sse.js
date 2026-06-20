// Tracks the active text part ID for streaming deltas
let activeTextPartID = null;
let isCompacting = false;

/** Subscribe to SSE events from the main process and route them to handlers. */
function initSSE() {
  window.electronAPI.onEvent((data) => {
    const props = data.properties || {};
    const sid = props.sessionID || props.id || '';
    const isCurrent = sid === window.App.currentSession;

    switch (data.type) {
      case 'message.part.updated':
        if (isCurrent) handlePartUpdate(data.properties);
        break;
      case 'message.part.delta':
        if (isCurrent) handlePartDelta(data.properties);
        break;
      case 'message.updated':
        if (isCurrent) handleMessageUpdated(data.properties);
        break;
      case 'session.status':
        handleSessionStatus(data.properties);
        break;
      case 'question.asked':
        window.Modals.showQuestionModal(data.properties);
        break;
      case 'permission.asked':
        handlePermissionAsked(data.properties);
        break;
      case 'todo.updated':
        handleTodoUpdated(data.properties);
        break;
      case 'session.updated':
        handleSessionUpdated(data.properties);
        break;
      case 'session.idle':
        handleSessionIdle(data.properties);
        break;
      case 'session.error':
        handleSessionError(data.properties);
        break;
    }
  });
}

/** Handle message part updates: show thinking indicators, track text parts, update todos. */
function handlePartUpdate(properties) {
  if (!properties || isCompacting) return;
  const { part, sessionID } = properties;
  if (!part || sessionID !== window.App.currentSession) return;

  if ((part.type === 'reasoning' || part.type === 'step-start' || part.type === 'text') && !window.App.isProcessing) {
    window.Chat.setStopMode(true);
  }

  if (part.type === 'reasoning') {
    window.Chat.showThinking('Reasoning...');
  } else if (part.type === 'step-start') {
    window.Chat.resetStreamingAccum();
    window.Chat.showThinking('Thinking...');
  } else if (part.type === 'text') {
    if (part.id !== activeTextPartID) {
      window.Chat.resetStreamingAccum();
    }
    activeTextPartID = part.id;
  } else if (part.type === 'step-finish') {
    activeTextPartID = null;
    window.Chat.removeStreamingCursor();
  } else if (part.type === 'tool') {
    const toolName = part.tool || 'tool';
    if (window.App.isProcessing) {
      window.Chat.showThinking('Using ' + toolName + '...');
    }
    if (part.tool === 'todowrite' && part.state && part.state.input) {
      const todos = part.state.input.todos;
      if (Array.isArray(todos)) {
        window.RightPanel.updateTodoList(todos);
      }
    }
  }
}

/** Handle streaming text deltas — append to the current message. */
function handlePartDelta(properties) {
  if (!properties || isCompacting) return;
  const { field, delta, sessionID, partID } = properties;
  if (sessionID !== window.App.currentSession) return;

  if (field === 'text' && delta && partID === activeTextPartID) {
    window.Chat.appendStreamingText(delta);
  }
}

/** Reset streaming when a completed message update arrives. */
function handleMessageUpdated(properties) {
  if (!properties) return;
  const info = properties.info || properties;
  // Only reset streaming for completed messages, not partial updates during streaming
  if (info.time && info.time.completed) {
    window.Chat.finalizeStreaming();
  }
}

/** Handle session status changes: busy, compacting, error, or idle. */
function handleSessionStatus(properties) {
  if (!properties) return;

  const eventSession = properties.sessionID || properties.id;
  if (eventSession && eventSession !== window.App.currentSession) return;

  const statusObj = properties.status;
  const status = typeof statusObj === 'string' ? statusObj : (statusObj && statusObj.type) || '';
  const statusEl = document.getElementById('sidebarStatus');
  if (!statusEl) return;

  if (status === 'busy' || status === 'active' || status === 'running') {
    isCompacting = false;
    if (statusEl.textContent === 'Ready' || statusEl.textContent.startsWith('Ready')) {
      statusEl.textContent = 'Processing...';
    }
  } else if (status === 'compacting' || status === 'compaction') {
    isCompacting = true;
    statusEl.textContent = 'Compacting...';
    window.Chat.showCompaction('Compacting context');
    if (!window.App.isProcessing) {
      window.Chat.setStopMode(true);
    }
  } else if (status === 'error') {
    statusEl.textContent = 'Error';
    window.Chat.setStopMode(false);
    isCompacting = false;
    const errorMsg = properties.error || properties.message || 'An error occurred';
    const errorStr = typeof errorMsg === 'string' ? errorMsg : (errorMsg.message || JSON.stringify(errorMsg));
    if (errorStr.toLowerCase().includes('rate limit') || errorStr.toLowerCase().includes('too many requests')) {
      window.Chat.showUsageExceed('Rate limit exceeded. Please wait and try again.');
    } else if (errorStr.toLowerCase().includes('usage') || errorStr.toLowerCase().includes('quota') || errorStr.toLowerCase().includes('exceeded')) {
      window.Chat.showUsageExceed('Usage limit exceeded.');
    } else {
      window.Chat.showError(errorStr);
    }
  } else if (status === 'retry') {
    const attempt = (statusObj && statusObj.attempt) || 0;
    const retryMsg = (statusObj && statusObj.message) || 'Retrying...';
    statusEl.textContent = `Retry ${attempt} — ${retryMsg}`;
    window.Chat.showThinking(`Retrying (${attempt})...`);
  } else {
    if (isCompacting) {
      isCompacting = false;
      window.Chat.showCompacted();
      const sessionToRefresh = window.App.currentSession;
      if (sessionToRefresh) {
        setTimeout(() => {
          if (window.App.currentSession !== sessionToRefresh) return;
          window.electronAPI.session.messages(sessionToRefresh).then(messages => {
            if (window.App.currentSession !== sessionToRefresh) return;
            window.Chat.renderMessages(messages);
          }).catch(() => {});
        }, 100);
      }
    }
    if (window.App.isProcessing) {
      handleSessionIdle(properties);
    }
  }
}

/** Finalize streaming and reset UI when the session becomes idle. */
function handleSessionIdle(properties) {
  if (isCompacting) return;

  if (properties && window.App.currentSession) {
    const eventSession = properties.sessionID || properties.id;
    if (eventSession && eventSession !== window.App.currentSession) {
      return;
    }
  }

  const statusEl = document.getElementById('sidebarStatus');
  if (!statusEl) return;

  const currentText = statusEl.textContent;
  if (!currentText.includes('Ready') && !currentText.startsWith('Error')) {
    statusEl.textContent = 'Ready';
  }
  window.Chat.finalizeStreaming();
  window.Chat.setStopMode(false);
  window.Chat.hideAllStatusIndicators();
  activeTextPartID = null;

  refreshSessionStats();
}

/** Handle dedicated session.error events from the backend. */
function handleSessionError(properties) {
  if (!properties) return;
  const eventSession = properties.sessionID || properties.id;
  if (eventSession && eventSession !== window.App.currentSession) return;

  const statusEl = document.getElementById('sidebarStatus');
  if (statusEl) statusEl.textContent = 'Error';
  window.Chat.setStopMode(false);
  isCompacting = false;

  const errorObj = properties.error || properties.message || properties;
  const errorStr = typeof errorObj === 'string' ? errorObj : (errorObj.message || JSON.stringify(errorObj));
  window.Chat.showError(errorStr);
  window.Chat.hideThinking();
}

/** Handle permission requests (currently a no-op placeholder). */
function handlePermissionAsked(properties) {
  if (!properties) return;
  const sessionID = properties.sessionID || properties.id;
  if (sessionID && sessionID !== window.App.currentSession) return;
}

/** Re-fetch session list to update token counts and cost in the right panel. */
async function refreshSessionStats() {
  const sessionToRefresh = window.App.currentSession;
  if (!sessionToRefresh) return;
  try {
    const response = await window.electronAPI.session.list();
    if (window.App.currentSession !== sessionToRefresh) return;
    const allSessions = response.value || response || [];
    const session = allSessions.find(s => s.id === sessionToRefresh);
    if (session) {
      window.RightPanel.updateContextStats({
        input: session.tokens ? session.tokens.input : 0,
        output: session.tokens ? session.tokens.output : 0,
        reasoning: session.tokens ? session.tokens.reasoning : 0,
        cost: session.cost || 0
      });
      const localSession = window.App.sessions.find(s => s.id === session.id);
      if (localSession) {
        localSession.tokens = session.tokens;
        localSession.cost = session.cost;
      }
    }
  } catch (error) {
    // ignore
  }
}

/** Update the todo list in the right panel when the backend pushes changes. */
function handleTodoUpdated(properties) {
  if (!properties) return;
  const eventSession = properties.sessionID || properties.id;
  if (eventSession && eventSession !== window.App.currentSession) return;
  const todos = properties.todos || properties.items || properties;
  if (Array.isArray(todos)) {
    window.RightPanel.updateTodoList(todos);
  }
}

/** Update session title in the sidebar and right panel when renamed by the backend. */
function handleSessionUpdated(properties) {
  if (!properties) return;
  const sessionId = properties.id || properties.sessionID || properties.session_id;
  const title = properties.title 
    || (properties.info && properties.info.title)
    || (properties.session && properties.session.title);

  if (!title || !sessionId) return;
  if (title.startsWith('New Session-')) return;

  if (window.App.currentSession === sessionId) {
    window.RightPanel.updateSessionName(title);
  }
  const session = window.App.sessions.find(s => s.id === sessionId);
  if (session) {
    session.title = title;
    window.Sessions.renderSessionList();
  }
}

window.SSE = { initSSE, refreshSessionStats, lastSendMessageTime: 0 };
