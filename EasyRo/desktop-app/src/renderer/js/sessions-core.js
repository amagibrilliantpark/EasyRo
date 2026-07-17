/** Fetch all sessions from the backend. */
async function loadSessions() {
  const t0 = performance.now();
  try {
    const response = await window.electronAPI.session.list();
    const rawSessions = response.value || response || [];
    // "attached" (pinned) is an EasyRo-only concept; the backend has no such field,
    // so we persist it inside the session's free-form `metadata` object instead.
    const allSessions = rawSessions.map((s) => ({
      ...s,
      attached: !!(s.metadata && s.metadata.attached),
    }));
    window.App.sessions = allSessions;
    window.App.sessionsCacheTime = Date.now();
    renderSessionList();
  } catch (error) {
    console.error(
      `[Session] loadSessions FAILED in ${(performance.now() - t0).toFixed(0)}ms:`,
      error.message,
    );
    if (window.App.debug) console.error("Failed to load sessions:", error);
  }
}
/** Get sessions from cache if recent, otherwise fetch from backend. */
async function getSessions(useCache = true) {
  const CACHE_TTL = 5000; // 5 seconds

  if (
    useCache &&
    window.App.sessionsCacheTime &&
    Date.now() - window.App.sessionsCacheTime < CACHE_TTL
  ) {
    return window.App.sessions || [];
  }

  await loadSessions();
  return window.App.sessions || [];
}
/** Switch to a session: save current files, load target files, load messages/todo. */
async function selectSession(sessionId) {
  if (_switchingSession) return;
  _switchingSession = true;

  try {
    // 0. Abort in-progress generation
    if (window.App.isProcessing && window.App.currentSession) {
      try {
        await window.electronAPI.session.abort(window.App.currentSession);
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {}
      window.App.isProcessing = false;
    }

    // 1. Save current session's files
    if (window.App.currentSession && window.App.currentSession !== sessionId) {
      const saveResult = await window.electronAPI.session.saveCurrent();
      if (!saveResult.success) {
        console.error("[Session] Failed to save session:", saveResult.error);
        return;
      }
    }

    // 2. Restore new session's files
    const restoreResult = await window.electronAPI.session.restore(sessionId);
    if (!restoreResult.success) {
      console.error(
        "[Session] Failed to restore session:",
        restoreResult.error,
      );
      return;
    }

    // 3. Update UI
    window.Chat.resetStreamingAccum();
    window.Chat.hideAllStatusIndicators();
    window.App.currentSession = sessionId;

    document.querySelectorAll(".session-card").forEach((c) => {
      c.classList.toggle("active", c.dataset.id === sessionId);
    });

    const session = window.App.sessions.find((s) => s.id === sessionId);
    if (session) {
      window.RightPanel.updateSessionName(session.title || "Untitled");
      window.RightPanel.updateContextStats(null);
    }

    // 4. Load todo and messages
    try {
      const todoResponse = await window.electronAPI.session.todo(sessionId);
      if (window.App.currentSession !== sessionId) return;
      const todos = todoResponse.value || todoResponse || [];
      window.RightPanel.updateTodoList(todos);
    } catch (error) {
      console.warn(`[Session] Todo load failed:`, error.message);
      if (window.App.currentSession === sessionId) {
        window.RightPanel.clearTodoList();
      }
    }

    try {
      const messages = await window.electronAPI.session.messages(sessionId);
      if (window.App.currentSession !== sessionId) return;
      window.Chat.renderMessages(messages);

      // Aggregate tokens from assistant messages
      const tokenData = window.RightPanel.aggregateTokensFromMessages(messages);
      if (window.App.currentSession === sessionId) {
        window.RightPanel.updateContextStats(tokenData);
      }
    } catch (error) {
      console.warn(`[Session] Messages load failed:`, error.message);
    }
  } finally {
    _switchingSession = false;
  }
}
/** Delete a session and clean up UI if it was the active one. */
async function deleteSession(sessionId) {
  const t0 = performance.now();
  try {
    if (window.App.isProcessing && window.App.currentSession === sessionId) {
      try {
        await window.electronAPI.session.abort(sessionId);
      } catch (e) {}
    }

    await window.electronAPI.session.delete(sessionId);
    try {
      await window.electronAPI.session.deleteSnapshot(sessionId);
    } catch (e) {}

    window.App.sessions = window.App.sessions.filter((s) => s.id !== sessionId);
    renderSessionList();

    if (window.App.currentSession === sessionId) {
      window.App.currentSession = null;
      window.Chat.resetStreamingAccum();
      window.Chat.hideAllStatusIndicators();
      Utils.$("emptyState").classList.add("active");
      const chatArea = Utils.$("chatArea");
      chatArea.querySelectorAll(".message, .streaming-cursor").forEach((m) => m.remove());
      window.RightPanel.updateSessionName("New Chat");
      window.RightPanel.clearTodoList();
      window.RightPanel.updateContextStats(null);
    }
  } catch (error) {
    console.error(
      `[Session] deleteSession FAILED in ${(performance.now() - t0).toFixed(0)}ms:`,
      error.message,
    );
    if (window.App.debug) console.error("Failed to delete session:", error);
  }
}
/** Update a session's title on the backend and refresh the sidebar. */
async function renameSession(sessionId, title) {
  try {
    await window.electronAPI.session.update(sessionId, { title });
    const session = window.App.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.title = title;
      if (sessionId === window.App.currentSession) {
        window.RightPanel.updateSessionName(title);
      }
    }
    renderSessionList();
  } catch (error) {
    console.error(`[Session] renameSession FAILED:`, error.message);
    if (window.App.debug) console.error("Failed to rename session:", error);
  }
}
// Guard against concurrent session creation
let _sessionCreatePromise = null;

// Guard against concurrent session switching
let _switchingSession = false;
/** Get the current session ID, or create a new one if none exists. */
async function ensureSession() {
  if (window.App.currentSession) {
    return window.App.currentSession;
  }
  if (_sessionCreatePromise) return _sessionCreatePromise;

  const t0 = performance.now();

  _sessionCreatePromise = (async () => {
    try {
      // Save old session if it exists in the session list
      const lastActive = await window.electronAPI.session.getActive();
      if (lastActive) {
        const exists = window.App.sessions.some((s) => s.id === lastActive);
        if (exists) {
          try {
            await window.electronAPI.session.saveCurrent();
          } catch (e) {}
        }
      }

      const session = await window.electronAPI.session.create();
      const newSession =
        typeof session === "string" ? { id: session, title: "" } : session;

      // Restore snapshot or create empty dirs for new session
      try {
        await window.electronAPI.session.restore(newSession.id);
      } catch (e) {}

      if (!newSession.title) newSession.title = "";
      window.App.currentSession = newSession.id;
      newSession.title = newSession.title || "";
      window.App.sessions.unshift(newSession);
      renderSessionList();

      window.RightPanel.updateSessionName("New Chat");

      document.querySelectorAll(".session-card").forEach((c) => {
        c.classList.toggle("active", c.dataset.id === newSession.id);
      });

      return newSession.id;
    } catch (error) {
      console.error(
        `[Session] ensureSession FAILED in ${(performance.now() - t0).toFixed(0)}ms:`,
        error.message,
      );
      if (window.App.debug) console.error("Failed to create session:", error);
      throw error;
    }
  })();

  try {
    return await _sessionCreatePromise;
  } finally {
    _sessionCreatePromise = null;
  }
}