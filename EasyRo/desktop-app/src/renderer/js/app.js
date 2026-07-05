/** Debounce utility function */
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/** Main application entry point — wires up all UI event listeners. */
const _appStartTime = performance.now();
console.log(`[Init] DOMContentLoaded fired at ${(performance.now() - _appStartTime).toFixed(0)}ms`);

document.addEventListener('DOMContentLoaded', () => {
  console.log(`[Init] DOMContentLoaded handler start at ${(performance.now() - _appStartTime).toFixed(0)}ms`);

  console.log(`[Init] Initializing SSE...`);
  window.SSE.initSSE();
  console.log(`[Init] SSE initialized`);

  console.log(`[Init] Initializing question modal...`);
  window.Modals.initQuestionModal();
  console.log(`[Init] Initializing revert modal...`);
  window.Modals.initRevertModal();
  console.log(`[Init] Modals initialized`);

  window.electronAPI.onProjectReady(async (data) => {
    const readyTime = performance.now() - _appStartTime;
    console.log(`[Init] ✅ project:ready received at ${readyTime.toFixed(0)}ms, project: ${data.name}`);

    const sidebarStatusEl = Utils.$('sidebarStatus');
    if (sidebarStatusEl) sidebarStatusEl.textContent = 'Ready — ' + data.name;

    console.log(`[Init] Loading sessions...`);
    const t0 = performance.now();
    await window.Sessions.loadSessions();
    console.log(`[Init] Sessions loaded in ${(performance.now() - t0).toFixed(0)}ms`);

    console.log(`[Init] Loading providers...`);
    const t1 = performance.now();
    await window.Providers.loadProviders();
    console.log(`[Init] Providers loaded in ${(performance.now() - t1).toFixed(0)}ms`);

    console.log(`[Init] Loading agents...`);
    const t2 = performance.now();
    await window.Providers.loadAgents();
    console.log(`[Init] Agents loaded in ${(performance.now() - t2).toFixed(0)}ms`);

    // Update Rojo port display
    try {
      const status = await window.electronAPI.instance.status();
      console.log(`[Init] Instance status:`, status);
      if (status && status.ports && status.ports.rojo) {
        window.RightPanel.updatePortDisplay(status.ports.rojo);
      }
    } catch (error) {
      console.error('[Init] Failed to get instance status:', error);
    }

    // Restore saved agent
    const savedAgent = localStorage.getItem('easyro_agent');
    if (savedAgent) {
      console.log(`[Init] Restoring saved agent: ${savedAgent}`);
      window.App.currentAgent = savedAgent;
      const modeSelector = Utils.$('modeSelector');
      if (modeSelector) modeSelector.querySelector('span').textContent = savedAgent.charAt(0).toUpperCase() + savedAgent.slice(1);
      document.querySelectorAll('#modePopup .popup-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.value === savedAgent);
      });
    }

    console.log(`[Init] ✅ App fully ready in ${(performance.now() - _appStartTime).toFixed(0)}ms`);
  });

  window.electronAPI.onProjectError((data) => {
    console.error(`[Init] ❌ project:error received:`, data.error);
    const sidebarStatusEl = Utils.$('sidebarStatus');
    if (sidebarStatusEl) sidebarStatusEl.textContent = 'Error: ' + data.error;
  });

  // ── Startup status monitor ──
  let _lastStatusText = '';
  let _statusCheckCount = 0;
  const _statusMonitor = setInterval(() => {
    const statusEl = Utils.$('sidebarStatus');
    if (!statusEl) return;
    const currentText = statusEl.textContent;
    if (currentText !== _lastStatusText) {
      console.log(`[Init] Status changed: "${_lastStatusText}" → "${currentText}" at ${(performance.now() - _appStartTime).toFixed(0)}ms`);
      _lastStatusText = currentText;
    }
    _statusCheckCount++;
    // If stuck at "Starting..." for more than 15 seconds, log warning
    if (_statusCheckCount > 30 && currentText.includes('Starting')) {
      console.warn(`[Init] ⚠️ Stuck at "Starting..." for ${(_statusCheckCount * 500 / 1000).toFixed(0)}s`);
      // Check instance status
      window.electronAPI.instance.status().then(status => {
        console.warn(`[Init] Instance status:`, status);
      }).catch(err => {
        console.warn(`[Init] Failed to get instance status:`, err.message);
      });
    }
    // Stop monitoring after app is ready or after 60 seconds
    if (currentText.includes('Ready') || _statusCheckCount > 120) {
      clearInterval(_statusMonitor);
      console.log(`[Init] Status monitor stopped at ${(performance.now() - _appStartTime).toFixed(0)}ms`);
    }
  }, 500);

  // ── Sidebar toggle ──
  const sidebar = Utils.$('sidebar');
  const sidebarToggle = Utils.$('sidebarToggle');
  const searchBar = Utils.$('searchBar');
  const sidebarLogo = document.querySelector('.sidebar-logo');
  const sidebarBtns = document.querySelector('.sidebar-btns');
  
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    console.log(`[UI] Sidebar ${sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded'}`);
    if (sidebar.classList.contains('collapsed')) {
      searchBar.classList.remove('active');
      sidebarLogo.classList.remove('hidden');
      sidebarBtns.classList.remove('hidden');
    }
  });

  // ── Init Settings ──
  window.Settings.init();

  // ── Search ──
  const searchToggle = Utils.$('searchToggle');
  const searchInput = Utils.$('searchInput');
  const searchClose = Utils.$('searchClose');

  searchToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sidebar.classList.contains('collapsed')) {
      // Open center search modal when sidebar is collapsed
      openCenterSearchModal();
    } else {
      // Open sidebar search when sidebar is expanded
      sidebarLogo.classList.add('hidden');
      sidebarBtns.classList.add('hidden');
      searchBar.classList.add('active');
      searchInput.focus();
    }
  });

  // ── Center Search Modal ──
  const centerSearchModal = Utils.$('centerSearchModal');
  const centerSearchBackdrop = Utils.$('centerSearchBackdrop');
  const centerSearchClose = Utils.$('centerSearchClose');
  const centerSearchInput = Utils.$('centerSearchInput');
  const centerSearchResults = Utils.$('centerSearchResults');

  function openCenterSearchModal() {
    centerSearchModal.classList.remove('hidden');
    centerSearchInput.value = '';
    centerSearchInput.focus();
    updateCenterSearchResults('');
  }

  function closeCenterSearchModal() {
    centerSearchModal.classList.add('hidden');
    centerSearchInput.value = '';
  }

  centerSearchClose.addEventListener('click', closeCenterSearchModal);
  centerSearchBackdrop.addEventListener('click', closeCenterSearchModal);

  // Debounce search inputs
  const debouncedCenterSearch = debounce((query) => {
    updateCenterSearchResults(query);
  }, 250);
  
  const debouncedSidebarSearch = debounce((query) => {
    window.Sessions.searchSessions(query);
  }, 250);

  centerSearchInput.addEventListener('input', function() {
    debouncedCenterSearch(this.value.toLowerCase());
  });

  centerSearchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeCenterSearchModal();
    }
  });

  function updateCenterSearchResults(query) {
    const sessions = window.Sessions.getAllSessions();
    const filtered = sessions.filter(s => 
      s.title && s.title.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      centerSearchResults.innerHTML = '<div class="center-search-empty">No sessions found</div>';
      return;
    }

    centerSearchResults.innerHTML = filtered.map(session => `
      <button class="center-search-result-item" data-session-id="${session.id}">
        <div class="center-search-result-title">${session.title || 'Untitled'}</div>
      </button>
    `).join('');

    // Add click handlers
    centerSearchResults.querySelectorAll('.center-search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const sessionId = item.dataset.sessionId;
        window.Sessions.selectSession(sessionId);
        closeCenterSearchModal();
      });
    });
  }

  searchClose.addEventListener('click', (e) => {
    e.stopPropagation();
    searchBar.classList.remove('active');
    sidebarLogo.classList.remove('hidden');
    sidebarBtns.classList.remove('hidden');
    searchInput.value = '';
    window.Sessions.searchSessions('');
  });

  searchInput.addEventListener('click', (e) => e.stopPropagation());
  searchInput.addEventListener('input', function() {
    debouncedSidebarSearch(this.value.toLowerCase());
  });

  // ── New chat — save current session, then deselect ──
  const newChatBtn = Utils.$('newChatBtn');
  newChatBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    console.log(`[UI] New chat button clicked`);

    // Save current session's files
    if (window.App.currentSession) {
      console.log(`[Session] Saving current session before new chat: ${window.App.currentSession}`);
      try { await window.electronAPI.session.saveCurrent(); } catch (e) {}
    }

    window.App.currentSession = null;
    window.Chat.resetStreamingAccum();
    window.Chat.hideAllStatusIndicators();
    document.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
    const chatArea = Utils.$('chatArea');
    const emptyState = Utils.$('emptyState');
    chatArea.querySelectorAll('.message, .streaming-cursor').forEach(m => m.remove());
    emptyState.classList.add('active');
    window.RightPanel.updateSessionName('New Chat');
    window.RightPanel.clearTodoList();
    window.RightPanel.updateContextStats(null);
  });

  // ── Send message ──
  const btnSend = document.querySelector('.btn-send');
  const promptInput = document.querySelector('.prompt-input');

  btnSend.addEventListener('click', () => {
    if (window.App.isProcessing) {
      console.log(`[UI] Stop button clicked`);
      window.Chat.stopGeneration();
    } else {
      console.log(`[UI] Send button clicked`);
      window.Chat.sendMessage();
    }
  });

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log(`[UI] Enter key pressed, sending message`);
      window.Chat.sendMessage();
    }
  });

  // ── Mode selector (Build/Plan) ──
  const modeSelector = Utils.$('modeSelector');
  const modePopup = Utils.$('modePopup');

  modeSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = modePopup.classList.contains('active');
    closeAllPopups();
    if (!wasOpen) modePopup.classList.add('active');
    console.log(`[UI] Mode selector ${wasOpen ? 'closed' : 'opened'}`);
  });

  modePopup.querySelectorAll('.popup-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      modePopup.querySelectorAll('.popup-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      modeSelector.querySelector('span').textContent = item.textContent;
      modePopup.classList.remove('active');
      window.App.currentAgent = item.dataset.value;
      localStorage.setItem('easyro_agent', item.dataset.value);
      console.log(`[UI] Agent changed to: ${item.dataset.value}`);
    });
  });

  // ── Model selector ──
  const modelSelector = Utils.$('modelSelector');
  const modelPopup = Utils.$('modelPopup');

  modelSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = modelPopup.classList.contains('active');
    closeAllPopups();
    if (!wasOpen) modelPopup.classList.add('active');
  });

  // ── Close popups on outside click ──
  document.addEventListener('click', () => closeAllPopups());

  document.addEventListener('click', () => {
    document.querySelectorAll('.session-menu').forEach(m => m.classList.remove('active'));
  });

  // ── Todo toggle ──
  const todoHeader = Utils.$('todoHeader');
  const todoList = Utils.$('todoList');

  todoHeader.addEventListener('click', () => {
    const isOpen = todoList.classList.contains('active');
    const arrow = todoHeader.querySelector('.todo-arrow');
    if (isOpen) {
      todoList.classList.remove('active');
      arrow.textContent = '\u25B6';
    } else {
      todoList.classList.add('active');
      arrow.textContent = '\u25BC';
    }
  });
});

/** Close all popup menus (mode, model, variant). */
function closeAllPopups() {
  Utils.$('modePopup').classList.remove('active');
  Utils.$('modelPopup').classList.remove('active');
  Utils.$('variantPopup').classList.remove('active');
}
