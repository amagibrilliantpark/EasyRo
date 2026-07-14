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

/** Handle message part updates: show thinking indicators, track text parts, update todos. */
function handlePartUpdate(properties) {
  if (!properties || isCompacting) return;
  const { part, sessionID } = properties;
  if (!part || sessionID !== window.App.currentSession) return;

  if (
    (part.type === "reasoning" ||
      part.type === "step-start" ||
      part.type === "text") &&
    !window.App.isProcessing
  ) {
    window.Chat.setStopMode(true);
  }

  if (part.type === "reasoning") {
    window.Chat.showThinking("Reasoning...");
  } else if (part.type === "step-start") {
    window.Chat.resetStreamingAccum();
    window.Chat.showThinking("Thinking...");
  } else if (part.type === "text") {
    if (part.id !== activeTextPartID) {
      window.Chat.resetStreamingAccum();
    }
    activeTextPartID = part.id;
  } else if (part.type === "step-finish") {
    activeTextPartID = null;
    window.Chat.removeStreamingCursor();
  } else if (part.type === "tool") {
    const toolName = part.tool || "tool";
    if (window.App.isProcessing) {
      window.Chat.showThinking("Using " + toolName + "...");
    }
    if (part.tool === "todowrite" && part.state && part.state.input) {
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

  if (field === "text" && delta && partID === activeTextPartID) {
    window.Chat.appendStreamingText(delta);
  }
}

/** Reset streaming when a completed message update arrives. */
function handleMessageUpdated(properties) {
  if (!properties) return;
  const info = properties.info || properties;
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
  const status =
    typeof statusObj === "string"
      ? statusObj
      : (statusObj && statusObj.type) || "";

  const statusEl = Utils.$("sidebarStatus");
  if (!statusEl) return;

  // Real SessionStatus values are only "idle" | "busy" | "retry" (see opencode's
  // SessionStatus schema). There is no "error" status value — actual errors
  // arrive via the dedicated "session.error" event (handleSessionError below).
  // Compaction is signaled separately via the "session.compacted" event,
  // handled in handleSessionCompacted() below.
  if (status === "busy") {
    isCompacting = false;
    if (
      statusEl.textContent === "Ready" ||
      statusEl.textContent.startsWith("Ready")
    ) {
      statusEl.textContent = "Processing...";
    }
  } else if (status === "retry") {
    const attempt = (statusObj && statusObj.attempt) || 0;
    const retryMsg = (statusObj && statusObj.message) || "Retrying...";
    statusEl.textContent = `Retry ${attempt} — ${retryMsg}`;
    window.Chat.showThinking(`Retrying (${attempt})...`);
  }
  // status === "idle" needs no handling here; see handleSessionIdle().
}

/** Handle the real "session.compacted" event fired when compaction finishes. */
function handleSessionCompacted(properties) {
  const eventSession = properties && (properties.sessionID || properties.id);
  if (eventSession && eventSession !== window.App.currentSession) return;

  isCompacting = false;
  window.Chat.showCompacted();

  const sessionToRefresh = window.App.currentSession;
  if (sessionToRefresh) {
    setTimeout(() => {
      if (window.App.currentSession !== sessionToRefresh) return;
      window.electronAPI.session
        .messages(sessionToRefresh)
        .then((messages) => {
          if (window.App.currentSession !== sessionToRefresh) return;
          window.Chat.renderMessages(messages);
        })
        .catch(() => {});
    }, 100);
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

  const statusEl = Utils.$("sidebarStatus");
  if (!statusEl) return;

  const currentText = statusEl.textContent;
  if (!currentText.includes("Ready") && !currentText.startsWith("Error")) {
    statusEl.textContent = "Ready";
  }
  window.Chat.finalizeStreaming();
  window.Chat.setStopMode(false);
  window.Chat.hideAllStatusIndicators();
  activeTextPartID = null;

  const sessionToRefresh = window.App.currentSession;
  if (sessionToRefresh) {
    window.electronAPI.session
      .messages(sessionToRefresh)
      .then((messages) => {
        if (window.App.currentSession !== sessionToRefresh) return;
        const msgList = messages.value || messages;
        const existingMsgs = document.querySelectorAll("#chatArea .message");

        // Update existing user messages with their IDs (they were sent without IDs)
        const uiUserMsgs = Array.from(existingMsgs).filter((m) =>
          m.classList.contains("user-message"),
        );
        const apiUserMsgs = msgList.filter(
          (m) => m.info && m.info.role === "user",
        );
        for (
          let i = 0;
          i < Math.min(uiUserMsgs.length, apiUserMsgs.length);
          i++
        ) {
          const uiMsg = uiUserMsgs[i];
          const apiMsg = apiUserMsgs[i];
          if (!uiMsg.dataset.messageId && apiMsg.info && apiMsg.info.id) {
            uiMsg.dataset.messageId = apiMsg.info.id;
            if (!uiMsg.querySelector(".msg-revert-btn")) {
              const revertBtn = document.createElement("button");
              revertBtn.className = "msg-revert-btn";
              revertBtn.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><polyline points="7 14 3 10 7 6"/></svg>';
              revertBtn.title = "Revert to this point";
              const cardText =
                uiMsg.querySelector(".msg-card")?.textContent || "";
              revertBtn.addEventListener("click", () =>
                window.Modals.showRevertModal(apiMsg.info.id, cardText),
              );
              uiMsg.appendChild(revertBtn);
            }
          }
        }

        // Only count API messages that have actual text content (create UI divs)
        const textMsgList = msgList.filter(
          (msg) =>
            msg.parts && msg.parts.some((p) => p.type === "text" && p.text),
        );

        // Compare text-message count vs UI div count (includes streaming div)
        if (textMsgList.length > existingMsgs.length) {
          const startIndex = existingMsgs.length;
          const newMsgs = textMsgList.slice(startIndex);
          const chatArea = Utils.$("chatArea");
          const emptyState = Utils.$("emptyState");
          if (emptyState) emptyState.classList.remove("active");
          const frag = document.createDocumentFragment();
          for (const msg of newMsgs) {
            const role = msg.info ? msg.info.role : "assistant";
            const id = msg.info ? msg.info.id : null;
            for (const part of msg.parts) {
              if (part.type === "text" && part.text) {
                frag.appendChild(
                  window.Chat.Messages.createMessageElement(role, part.text, id),
                );
              }
            }
          }
          chatArea.appendChild(frag);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      })
      .catch((err) => {
        console.error(
          "[RevertDebug] Failed to re-fetch messages after idle:",
          err,
        );
      });
  }

  refreshSessionStats();
}

/** Handle dedicated session.error events from the backend. */
function handleSessionError(properties) {
  if (!properties) return;
  const eventSession = properties.sessionID || properties.id;
  if (eventSession && eventSession !== window.App.currentSession) return;

  const statusEl = Utils.$("sidebarStatus");
  if (statusEl) statusEl.textContent = "Error";
  window.Chat.setStopMode(false);
  isCompacting = false;

  const errorObj = properties.error || properties.message || properties;
  const errorStr =
    typeof errorObj === "string"
      ? errorObj
      : errorObj.message || JSON.stringify(errorObj);
  window.Chat.showError(errorStr);
  window.Chat.hideThinking();
}

/** Handle permission requests (currently a no-op placeholder). */
function handlePermissionAsked(properties) {
  if (!properties) return;
  const sessionID = properties.sessionID || properties.id;
  if (sessionID && sessionID !== window.App.currentSession) return;
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

/** Update the todo list in the right panel when the backend pushes changes. */
function handleTodoUpdated(properties) {
  if (!properties) return;
  const eventSession = properties.sessionID || properties.id;
  if (eventSession && eventSession !== window.App.currentSession) return;
  const todos = properties.todos || properties.items || properties;
  if (Array.isArray(todos)) {
    window.RightPanel.updateTodoList(todos);
    // Auto-open todo list when AI creates/updates todos
    const todoList = Utils.$("todoList");
    const todoHeader = Utils.$("todoHeader");
    if (
      todoList &&
      !todoList.classList.contains("active") &&
      todos.length > 0
    ) {
      todoList.classList.add("active");
      const arrow = todoHeader?.querySelector(".todo-arrow");
      if (arrow) arrow.textContent = "\u25BC";
    }
  }
}

/** Update session title in the sidebar and right panel when renamed by the backend. */
function handleSessionUpdated(properties) {
  if (!properties) return;
  const sessionId =
    properties.id || properties.sessionID || properties.session_id;
  const title =
    properties.title ||
    (properties.info && properties.info.title) ||
    (properties.session && properties.session.title);

  if (!title || !sessionId) return;
  if (title.startsWith("New Session-")) return;

  if (window.App.currentSession === sessionId) {
    window.RightPanel.updateSessionName(title);
  }
  const session = window.App.sessions.find((s) => s.id === sessionId);
  if (session) {
    session.title = title;
    window.Sessions.renderSessionList();
  }
}

window.SSE = { initSSE, refreshSessionStats, lastSendMessageTime: 0 };
