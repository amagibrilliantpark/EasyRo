/** Fetch all sessions from the backend. */
async function loadSessions() {
  try {
    const response = await window.electronAPI.session.list();
    const allSessions = response.value || response || [];
    window.App.sessions = allSessions;
    renderSessionList();
  } catch (error) {
    if(window.App.debug)console.error('Failed to load sessions:', error);
  }
}

/** Split sessions into attached/normal groups and render both lists. */
function renderSessionList() {
  const attachedContainer = document.getElementById('attachedSessions');
  const normalContainer = document.getElementById('normalSessions');
  const attachedLabel = document.getElementById('attachedLabel');

  attachedContainer.innerHTML = '';
  normalContainer.innerHTML = '';

  const attached = window.App.sessions.filter(s => s.attached);
  const normal = window.App.sessions.filter(s => !s.attached);

  attachedLabel.style.display = attached.length > 0 ? 'block' : 'none';

  attached.forEach(s => attachedContainer.appendChild(createSessionCard(s)));
  normal.forEach(s => normalContainer.appendChild(createSessionCard(s)));
}

/** Build a session card element with title, context menu, and click handler. */
function createSessionCard(session) {
  const card = document.createElement('div');
  card.className = 'session-card' + (session.id === window.App.currentSession ? ' active' : '');
  card.dataset.id = session.id;
  card.dataset.name = session.title || 'New Chat';

  const title = document.createElement('div');
  title.className = 'sc-title';
  title.textContent = session.title || 'New Chat';

  const moreBtn = document.createElement('button');
  moreBtn.className = 'session-more';
  moreBtn.innerHTML = '<svg viewBox="0 0 14 14"><circle cx="7" cy="3" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11" r="1.2"/></svg>';

  const menu = document.createElement('div');
  menu.className = 'session-menu';
  menu.innerHTML = `
    <button class="session-menu-item" data-action="rename"><svg viewBox="0 0 14 14"><path d="M10 2l2 2-7 7H3v-2l7-7z"/></svg>Rename</button>
    <button class="session-menu-item" data-action="attach"><svg viewBox="0 0 14 14"><path d="M1 7h5M3.5 4.5v5"/><rect x="7" y="2" width="6" height="10" rx="1.5"/></svg>Attach</button>
    <button class="session-menu-item danger" data-action="delete"><svg viewBox="0 0 14 14"><path d="M2 4h10M5 4V2h4v2M3 4v8a1 1 0 001 1h6a1 1 0 001-1V4"/></svg>Delete</button>
  `;

  card.appendChild(title);
  card.appendChild(moreBtn);
  card.appendChild(menu);

  card.addEventListener('click', function(e) {
    if (e.target.closest('.session-more') || e.target.closest('.session-menu')) return;
    selectSession(session.id);
  });

  moreBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('active');
    document.querySelectorAll('.session-menu').forEach(m => m.classList.remove('active'));
    if (!wasOpen) menu.classList.add('active');
  });

  menu.querySelectorAll('.session-menu-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      const action = this.dataset.action;
      if (action === 'delete') {
        deleteSession(session.id);
      } else if (action === 'rename') {
        document.querySelectorAll('.session-menu').forEach(m => m.classList.remove('active'));
        startRename(card, title, session);
      } else if (action === 'attach') {
        toggleAttach(session.id);
      }
      if (action !== 'rename') {
        document.querySelectorAll('.session-menu').forEach(m => m.classList.remove('active'));
      }
    });
  });

  return card;
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
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {}
      window.App.isProcessing = false;
    }

    // 1. Save current session's files
    if (window.App.currentSession && window.App.currentSession !== sessionId) {
      const saveResult = await window.electronAPI.session.saveCurrent();
      if (!saveResult.success) {
        console.error('Failed to save session:', saveResult.error);
        return;
      }
    }

    // 2. Restore new session's files
    const restoreResult = await window.electronAPI.session.restore(sessionId);
    if (!restoreResult.success) {
      console.error('Failed to restore session:', restoreResult.error);
      return;
    }

    // 3. Update UI
    window.Chat.resetStreamingAccum();
    window.Chat.hideAllStatusIndicators();
    window.App.currentSession = sessionId;

    document.querySelectorAll('.session-card').forEach(c => {
      c.classList.toggle('active', c.dataset.id === sessionId);
    });

    const session = window.App.sessions.find(s => s.id === sessionId);
    if (session) {
      window.RightPanel.updateSessionName(session.title || 'Untitled');
      window.App.currentSessionTokens = session.tokens || null;
      window.RightPanel.updateContextStats({
        input: session.tokens ? session.tokens.input : 0,
        output: session.tokens ? session.tokens.output : 0,
        reasoning: session.tokens ? session.tokens.reasoning : 0,
        cost: session.cost || 0
      });
    }

    // 4. Load todo and messages
    try {
      const todoResponse = await window.electronAPI.session.todo(sessionId);
      if (window.App.currentSession !== sessionId) return;
      const todos = todoResponse.value || todoResponse || [];
      window.RightPanel.updateTodoList(todos);
    } catch (error) {
      if (window.App.currentSession === sessionId) {
        window.RightPanel.clearTodoList();
      }
    }

    try {
      const messages = await window.electronAPI.session.messages(sessionId);
      if (window.App.currentSession !== sessionId) return;
      window.Chat.renderMessages(messages);
    } catch (error) {}
  } finally {
    _switchingSession = false;
  }
}

/** Delete a session and clean up UI if it was the active one. */
async function deleteSession(sessionId) {
  try {
    if (window.App.isProcessing && window.App.currentSession === sessionId) {
      try {
        await window.electronAPI.session.abort(sessionId);
      } catch (e) {}
    }

    await window.electronAPI.session.delete(sessionId);
    try { await window.electronAPI.session.deleteSnapshot(sessionId); } catch (e) {}

    window.App.sessions = window.App.sessions.filter(s => s.id !== sessionId);
    renderSessionList();

    if (window.App.currentSession === sessionId) {
      window.App.currentSession = null;
      window.Chat.resetStreamingAccum();
      window.Chat.hideAllStatusIndicators();
      document.getElementById('emptyState').classList.add('active');
      document.getElementById('chatArea').querySelectorAll('.message, .streaming-cursor').forEach(m => m.remove());
      window.RightPanel.updateSessionName('New Chat');
      window.RightPanel.clearTodoList();
      window.RightPanel.updateContextStats(null);
    }
  } catch (error) {
    if(window.App.debug)console.error('Failed to delete session:', error);
  }
}

/** Update a session's title on the backend and refresh the sidebar. */
async function renameSession(sessionId, title) {
  try {
    await window.electronAPI.session.update(sessionId, { title });
    const session = window.App.sessions.find(s => s.id === sessionId);
    if (session) {
      session.title = title;
      if (sessionId === window.App.currentSession) {
        window.RightPanel.updateSessionName(title);
      }
    }
    renderSessionList();
  } catch (error) {
    if(window.App.debug)console.error('Failed to rename session:', error);
  }
}

/** Replace the title element with an inline text input for renaming. */
function startRename(card, titleEl, session) {
  const currentName = titleEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'sc-title-input';
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  function finishRename() {
    const newName = input.value.trim() || currentName;
    const newTitle = document.createElement('div');
    newTitle.className = 'sc-title';
    newTitle.textContent = newName;
    card.dataset.name = newName;
    input.replaceWith(newTitle);
    if (newName !== currentName) {
      renameSession(session.id, newName);
    }
  }

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { input.value = currentName; input.blur(); }
  });
}

/** Toggle the "attached" flag on a session (pins it to the top). */
function toggleAttach(sessionId) {
  const session = window.App.sessions.find(s => s.id === sessionId);
  if (session) {
    session.attached = !session.attached;
    renderSessionList();
    window.electronAPI.session.update(sessionId, { attached: session.attached }).catch(() => {});
  }
}

/** Filter session cards by name substring match. */
function searchSessions(query) {
  const cards = document.querySelectorAll('#normalSessions .session-card, #attachedSessions .session-card');
  cards.forEach(card => {
    const name = (card.dataset.name || '').toLowerCase();
    card.style.display = !query || name.indexOf(query) !== -1 ? '' : 'none';
  });
}

// Guard against concurrent session creation
let _sessionCreatePromise = null;

// Guard against concurrent session switching
let _switchingSession = false;

/** Get the current session ID, or create a new one if none exists. */
async function ensureSession() {
  if (window.App.currentSession) return window.App.currentSession;
  if (_sessionCreatePromise) return _sessionCreatePromise;

  _sessionCreatePromise = (async () => {
    try {
      // Save old session if it exists in the session list
      const lastActive = await window.electronAPI.session.getActive();
      if (lastActive) {
        const exists = window.App.sessions.some(s => s.id === lastActive);
        if (exists) {
          try { await window.electronAPI.session.saveCurrent(); } catch (e) {}
        }
      }

      const session = await window.electronAPI.session.create();
      const newSession = typeof session === 'string' ? { id: session, title: '' } : session;

      // Restore snapshot or create empty dirs for new session
      try { await window.electronAPI.session.restore(newSession.id); } catch (e) {}

      if (!newSession.title) newSession.title = '';
      window.App.currentSession = newSession.id;
      newSession.title = newSession.title || '';
      window.App.sessions.unshift(newSession);
      renderSessionList();

      window.RightPanel.updateSessionName('New Chat');

      document.querySelectorAll('.session-card').forEach(c => {
        c.classList.toggle('active', c.dataset.id === newSession.id);
      });

      return newSession.id;
    } catch (error) {
      if(window.App.debug)console.error('Failed to create session:', error);
      throw error;
    }
  })();

  try {
    return await _sessionCreatePromise;
  } finally {
    _sessionCreatePromise = null;
  }
}

window.Sessions = { loadSessions, selectSession, deleteSession, renameSession, searchSessions, renderSessionList, ensureSession };
