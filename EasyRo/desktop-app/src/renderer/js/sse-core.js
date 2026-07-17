// Tracks the active text part ID for streaming deltas
let activeTextPartID = null;
let isCompacting = false;

// Throttle cache for session stats refresh
let statsRefreshThrottle = null;
const STATS_REFRESH_DELAY = 2000; // 2 seconds
/** Subscribe to SSE events from the main process and route them to handlers. */
function initSSE() {
  window.electronAPI.onEvent((data) => {
    const props = data.properties || {};
    const sid = props.sessionID || props.id || "";
    const isCurrent = sid === window.App.currentSession;

    switch (data.type) {
      case "message.part.updated":
        if (isCurrent) handlePartUpdate(data.properties);
        break;
      case "message.part.delta":
        if (isCurrent) handlePartDelta(data.properties);
        break;
      case "message.updated":
        if (isCurrent) handleMessageUpdated(data.properties);
        break;
      case "session.status":
        handleSessionStatus(data.properties);
        break;
      case "question.asked":
        window.Modals.showQuestionModal(data.properties);
        break;
      case "permission.asked":
        handlePermissionAsked(data.properties);
        break;
      case "todo.updated":
        handleTodoUpdated(data.properties);
        break;
      case "session.updated":
        handleSessionUpdated(data.properties);
        break;
      case "session.idle":
        handleSessionIdle(data.properties);
        break;
      case "session.error":
        handleSessionError(data.properties);
        break;
      case "session.compacted":
        handleSessionCompacted(data.properties);
        break;
    }
  });
}
/** Re-fetch messages to update token counts and cost in the right panel. */
async function refreshSessionStats() {
  const sessionToRefresh = window.App.currentSession;
  if (!sessionToRefresh) return;

  // Throttle refresh to avoid excessive API calls
  if (statsRefreshThrottle) {
    clearTimeout(statsRefreshThrottle);
  }

  statsRefreshThrottle = setTimeout(async () => {
    statsRefreshThrottle = null;
    try {
      const messages =
        await window.electronAPI.session.messages(sessionToRefresh);
      if (window.App.currentSession !== sessionToRefresh) return;
      const tokenData = window.RightPanel.aggregateTokensFromMessages(messages);
      window.RightPanel.updateContextStats(tokenData);
    } catch (error) {
      console.error("[RENDERER] Session stats refresh error: " + error.message);
    }
  }, STATS_REFRESH_DELAY);
}
window.SSE = { initSSE, refreshSessionStats, lastSendMessageTime: 0 };