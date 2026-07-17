/** Provider modal: open/close lifecycle + connect/disconnect flows. */
(function () {
  const M = (window.ProviderModal = window.ProviderModal || {});

  /** Open the provider modal and load available providers. */
  async function open() {
    const overlay = M.el("providerModalOverlay");
    overlay.classList.remove("hidden");
    M.showListView();
    M.el("providerError").classList.remove("active");
    M.el("providerSuccess").classList.remove("active");
    M.resetSelection();

    M.el("providerList").innerHTML =
      '<div class="provider-list-empty">Loading providers...</div>';

    let provData = { all: [], connected: [] };
    try {
      provData = await window.electronAPI.provider.list();
    } catch {}
    await M.loadAuthMethods();

    M.PM.connectedProviders = provData.connected || [];
    M.PM.providersAllDetails = {};
    for (const p of provData.all || []) {
      M.PM.providersAllDetails[p.id] = p;
    }

    M.PM.providersList = [
      ...new Set([
        ...Object.keys(M.PM.authMethods),
        ...(provData.connected || []),
        ...M.getExtraProviderIds(),
      ]),
    ];

    M.renderProviderList();
  }

  function close() {
    M.el("providerModalOverlay").classList.add("hidden");
    M.resetSelection();
  }

  function resetSelection() {
    M.PM.selectedProvider = null;
    M.PM.isConnecting = false;
    M.PM.customStep = 1;
    M.PM.customProviderId = "";
    M.PM.methodType = null;
    M.PM.methodIndex = -1;
    M.PM.extraPrompts = [];
    M.PM.oauthStage = null;
  }

  async function loadAuthMethods() {
    try {
      M.PM.authMethods = (await window.electronAPI.provider.authMethods()) || {};
      M.PM.providersList = Object.keys(M.PM.authMethods);
    } catch {
      M.PM.authMethods = {};
      M.PM.providersList = [];
    }
  }

  // Poll GET /provider until the just-connected provider shows up with models,
  // then refresh the model picker. Bounded (<=8 requests over ~3s) and only
  // runs right after a connect, so it adds no steady load to the app.
  async function refreshUntilProviderVisible(providerId) {
    const maxAttempts = 8;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const data = await window.electronAPI.provider.list();
        const all = (data && (data.all || data.data)) || [];
        const found = all.find((p) => p.id === providerId);
        if (found && found.models && Object.keys(found.models).length > 0) {
          window.Providers.loadProviders();
          return true;
        }
      } catch (e) {
        // transient error — keep polling
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    window.Providers.loadProviders();
    return false;
  }

  async function showSuccess(providerId) {
    M.el("providerDetail").classList.remove("active");
    M.el("providerSuccess").classList.add("active");

    M.addForceShowProvider(providerId);
    if (window.App.addConnectedProvider) window.App.addConnectedProvider(providerId);
    M.addExtraProvider(providerId);
    window.Providers.loadProviders();

    setTimeout(() => M.close(), 900);
    M.refreshUntilProviderVisible(providerId);
  }

  /** Disconnect or delete a provider. */
  async function deleteProvider(providerId, mode) {
    if (M.PM.isConnecting || !providerId) return;
    M.PM.isConnecting = true;

    const isDelete = mode === "delete";
    const disconnectBtn = M.el("providerBtnDisconnect");
    const removeBtn = M.el("providerBtnRemove");
    const connectBtn = M.el("providerBtnConnect");
    connectBtn.disabled = true;
    disconnectBtn.disabled = true;
    removeBtn.disabled = true;

    const spinner = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`;
    if (isDelete) {
      removeBtn.classList.add("loading");
      removeBtn.innerHTML = `${spinner}<span>Deleting...</span>`;
    } else {
      disconnectBtn.classList.add("loading");
      disconnectBtn.innerHTML = `${spinner}<span>Disconnecting...</span>`;
    }

    try {
      await window.electronAPI.provider.delete(providerId);
      if (window.App.removeConnectedProvider) {
        window.App.removeConnectedProvider(providerId);
      }
      if (isDelete) M.removeExtraProvider(providerId);
      if (window.App.forceShowProviders) {
        window.App.forceShowProviders = window.App.forceShowProviders.filter(
          (x) => x !== providerId,
        );
      }
      window.Providers.loadProviders();

      try {
        const provData = await window.electronAPI.provider.list();
        M.PM.connectedProviders = provData.connected || [];
      } catch {}
      M.renderProviderList();
      M.showListView();
    } catch (err) {
      disconnectBtn.classList.remove("loading");
      removeBtn.classList.remove("loading");
      disconnectBtn.disabled = false;
      removeBtn.disabled = false;
      disconnectBtn.innerHTML = "<span>Disconnect</span>";
      removeBtn.innerHTML = "<span>Delete Provider</span>";
      connectBtn.disabled = false;
      M.el("providerError").textContent =
        err.message || (isDelete ? "Failed to delete provider." : "Failed to disconnect provider.");
      M.el("providerError").classList.add("active");
    } finally {
      M.PM.isConnecting = false;
    }
  }

  function showConnectError(message) {
    M.el("providerError").textContent =
      message || "Failed to connect. Please try again.";
    M.el("providerError").classList.add("active");

    const connectBtn = M.el("providerBtnConnect");
    connectBtn.disabled = false;
    connectBtn.classList.remove("loading");
    connectBtn.innerHTML = "<span>Connect</span>";
    M.PM.isConnecting = false;
  }

  M.open = open;
  M.close = close;
  M.resetSelection = resetSelection;
  M.loadAuthMethods = loadAuthMethods;
  M.refreshUntilProviderVisible = refreshUntilProviderVisible;
  M.showSuccess = showSuccess;
  M.deleteProvider = deleteProvider;
  M.showConnectError = showConnectError;
})();
