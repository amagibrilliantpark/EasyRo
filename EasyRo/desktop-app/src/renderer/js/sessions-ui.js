function renderSessionList() {
  const attachedContainer = Utils.$("attachedSessions");
  const normalContainer = Utils.$("normalSessions");
  const attachedLabel = Utils.$("attachedLabel");

  // Single pass + fragments: one reflow per list instead of one per card.
  const attachedFrag = document.createDocumentFragment();
  const normalFrag = document.createDocumentFragment();
  let attachedCount = 0;

  for (const s of window.App.sessions) {
    if (s.attached) {
      attachedFrag.appendChild(createSessionCard(s));
      attachedCount++;
    } else {
      normalFrag.appendChild(createSessionCard(s));
    }
  }

  attachedLabel.style.display = attachedCount > 0 ? "block" : "none";

  attachedContainer.innerHTML = "";
  normalContainer.innerHTML = "";
  attachedContainer.appendChild(attachedFrag);
  normalContainer.appendChild(normalFrag);
}

/** Build a session card element with title, context menu, and click handler. */
function createSessionCard(session) {
  const card = document.createElement("div");
  card.className =
    "session-card" +
    (session.id === window.App.currentSession ? " active" : "");
  card.dataset.id = session.id;
  card.dataset.name = session.title || "New Chat";

  const title = document.createElement("div");
  title.className = "sc-title";
  title.textContent = session.title || "New Chat";

  const moreBtn = document.createElement("button");
  moreBtn.className = "session-more";
  moreBtn.innerHTML =
    '<svg viewBox="0 0 14 14"><circle cx="7" cy="3" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11" r="1.2"/></svg>';

  const menu = document.createElement("div");
  menu.className = "session-menu";
  menu.innerHTML = `
    <button class="session-menu-item" data-action="rename"><svg viewBox="0 0 14 14"><path d="M10 2l2 2-7 7H3v-2l7-7z"/></svg>Rename</button>
    <button class="session-menu-item" data-action="attach"><svg viewBox="0 0 14 14"><path d="M1 7h5M3.5 4.5v5"/><rect x="7" y="2" width="6" height="10" rx="1.5"/></svg>Attach</button>
    <button class="session-menu-item danger" data-action="delete"><svg viewBox="0 0 14 14"><path d="M2 4h10M5 4V2h4v2M3 4v8a1 1 0 001 1h6a1 1 0 001-1V4"/></svg>Delete</button>
  `;

  card.appendChild(title);
  card.appendChild(moreBtn);
  card.appendChild(menu);

  card.addEventListener("click", function (e) {
    if (e.target.closest(".session-more") || e.target.closest(".session-menu"))
      return;
    selectSession(session.id);
  });

  moreBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    const wasOpen = menu.classList.contains("active");
    document
      .querySelectorAll(".session-menu")
      .forEach((m) => m.classList.remove("active"));
    if (!wasOpen) menu.classList.add("active");
  });

  menu.querySelectorAll(".session-menu-item").forEach((item) => {
    item.addEventListener("click", function (e) {
      e.stopPropagation();
      const action = this.dataset.action;
      if (action === "delete") {
        deleteSession(session.id);
      } else if (action === "rename") {
        document
          .querySelectorAll(".session-menu")
          .forEach((m) => m.classList.remove("active"));
        startRename(card, title, session);
      } else if (action === "attach") {
        toggleAttach(session.id);
      }
      if (action !== "rename") {
        document
          .querySelectorAll(".session-menu")
          .forEach((m) => m.classList.remove("active"));
      }
    });
  });

  return card;
}
function startRename(card, titleEl, session) {
  const currentName = titleEl.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "sc-title-input";
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  function finishRename() {
    const newName = input.value.trim() || currentName;
    const newTitle = document.createElement("div");
    newTitle.className = "sc-title";
    newTitle.textContent = newName;
    card.dataset.name = newName;
    input.replaceWith(newTitle);
    if (newName !== currentName) {
      renameSession(session.id, newName);
    }
  }

  input.addEventListener("blur", finishRename);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      input.blur();
    }
    if (ev.key === "Escape") {
      input.value = currentName;
      input.blur();
    }
  });
}

/** Toggle the "attached" flag on a session (pins it to the top). Persisted via session metadata. */
function toggleAttach(sessionId) {
  const session = window.App.sessions.find((s) => s.id === sessionId);
  if (session) {
    session.attached = !session.attached;
    session.metadata = {
      ...(session.metadata || {}),
      attached: session.attached,
    };
    renderSessionList();
    window.electronAPI.session
      .update(sessionId, { metadata: session.metadata })
      .catch(() => {});
  }
}

/** Filter session cards by name substring match. */
function searchSessions(query) {
  const cards = document.querySelectorAll(
    "#normalSessions .session-card, #attachedSessions .session-card",
  );
  cards.forEach((card) => {
    const name = (card.dataset.name || "").toLowerCase();
    card.style.display = !query || name.indexOf(query) !== -1 ? "" : "none";
  });
}
window.Sessions = {
  loadSessions,
  selectSession,
  deleteSession,
  renameSession,
  searchSessions,
  renderSessionList,
  ensureSession,
  getAllSessions: () => window.App.sessions || [],
  getSessions,
};