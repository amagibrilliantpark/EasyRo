/** Main application entry point — wires up all UI event listeners. */
document.addEventListener('DOMContentLoaded', () => {
  window.SSE.initSSE();
  window.Modals.initQuestionModal();

  window.electronAPI.onProjectReady(async (data) => {
    document.getElementById('sidebarStatus').textContent = 'Ready — ' + data.name;
    await window.Sessions.loadSessions();
    await window.Providers.loadProviders();
    await window.Providers.loadAgents();

    // Update Rojo port display
    try {
      const status = await window.electronAPI.instance.status();
      if (status && status.ports && status.ports.rojo) {
        window.RightPanel.updatePortDisplay(status.ports.rojo);
      }
    } catch (error) {
      console.error('Failed to get instance status:', error);
    }

    // Restore saved agent
    const savedAgent = localStorage.getItem('easyro_agent');
    if (savedAgent) {
      window.App.currentAgent = savedAgent;
      const modeSelector = document.getElementById('modeSelector');
      modeSelector.querySelector('span').textContent = savedAgent.charAt(0).toUpperCase() + savedAgent.slice(1);
      document.querySelectorAll('#modePopup .popup-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.value === savedAgent);
      });
    }
  });

  window.electronAPI.onProjectError((data) => {
    document.getElementById('sidebarStatus').textContent = 'Error: ' + data.error;
  });

  // ── Sidebar toggle ──
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
      searchBar.classList.remove('active');
      sidebarLogo.classList.remove('hidden');
      sidebarBtns.classList.remove('hidden');
    }
  });

  // ── Search ──
  const searchToggle = document.getElementById('searchToggle');
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput');
  const searchClose = document.getElementById('searchClose');
  const sidebarLogo = document.querySelector('.sidebar-logo');
  const sidebarBtns = document.querySelector('.sidebar-btns');

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
  const centerSearchModal = document.getElementById('centerSearchModal');
  const centerSearchBackdrop = document.getElementById('centerSearchBackdrop');
  const centerSearchClose = document.getElementById('centerSearchClose');
  const centerSearchInput = document.getElementById('centerSearchInput');
  const centerSearchResults = document.getElementById('centerSearchResults');

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

  centerSearchInput.addEventListener('input', function() {
    updateCenterSearchResults(this.value.toLowerCase());
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
    window.Sessions.searchSessions(this.value.toLowerCase());
  });

  // ── New chat — save current session, then deselect ──
  document.getElementById('newChatBtn').addEventListener('click', async (e) => {
    e.stopPropagation();

    // Save current session's files
    if (window.App.currentSession) {
      try { await window.electronAPI.session.saveCurrent(); } catch (e) {}
    }

    window.App.currentSession = null;
    window.Chat.resetStreamingAccum();
    window.Chat.hideAllStatusIndicators();
    document.querySelectorAll('.session-card').forEach(c => c.classList.remove('active'));
    document.getElementById('chatArea').querySelectorAll('.message, .streaming-cursor').forEach(m => m.remove());
    document.getElementById('emptyState').classList.add('active');
    window.RightPanel.updateSessionName('New Chat');
    window.RightPanel.clearTodoList();
    window.RightPanel.updateContextStats(null);
  });

  // ── Send message ──
  const btnSend = document.querySelector('.btn-send');
  const promptInput = document.querySelector('.prompt-input');

  btnSend.addEventListener('click', () => {
    if (window.App.isProcessing) {
      window.Chat.stopGeneration();
    } else {
      window.Chat.sendMessage();
    }
  });

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window.Chat.sendMessage();
    }
  });

  // ── Mode selector (Build/Plan) ──
  const modeSelector = document.getElementById('modeSelector');
  const modePopup = document.getElementById('modePopup');

  modeSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = modePopup.classList.contains('active');
    closeAllPopups();
    if (!wasOpen) modePopup.classList.add('active');
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
    });
  });

  // ── Model selector ──
  const modelSelector = document.getElementById('modelSelector');
  const modelPopup = document.getElementById('modelPopup');

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
  const todoHeader = document.getElementById('todoHeader');
  const todoList = document.getElementById('todoList');

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
  document.getElementById('modePopup').classList.remove('active');
  document.getElementById('modelPopup').classList.remove('active');
  document.getElementById('variantPopup').classList.remove('active');
}
