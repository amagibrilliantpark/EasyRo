/** Provider connection modal — lets users add API keys / OAuth for LLM providers directly from the UI. */
(function () {
  const PM = {
    selectedProvider: null,
    authMethods: {},
    providersList: [],
    connectedProviders: [],
    isConnecting: false,
    customStep: 1,
    customProviderId: "",
    // Selected auth method for the current provider ('api' | 'oauth')
    methodType: null,
    methodIndex: -1,
    // Extra prompt fields declared by the auth method (beyond the base key)
    extraPrompts: [],
    // OAuth flow state: null before starting, then 'auto' | 'code' once authorize() responds
    oauthStage: null,
  };

  function el(id) {
    return document.getElementById(id);
  }

  /** Map provider IDs to display names & colors for avatars. */
  const PROVIDER_META = {
    openai: { name: "OpenAI", color: "#19c37d" },
    anthropic: { name: "Anthropic", color: "#d97757" },
    openrouter: { name: "OpenRouter", color: "#ff6b35" },
    opencode: { name: "OpenCode Zen", color: "#6366f1" },
    google: { name: "Google Gemini", color: "#4285f4" },
    groq: { name: "Groq", color: "#f97316" },
    deepseek: { name: "DeepSeek", color: "#4f6cf7" },
    ollama: { name: "Ollama", color: "#7c3aed" },
    github: { name: "GitHub Copilot", color: "#24292e" },
    gitlab: { name: "GitLab Duo", color: "#fc6d26" },
    fireworks: { name: "Fireworks AI", color: "#ff4400" },
    together: { name: "Together AI", color: "#b02df7" },
    cerebras: { name: "Cerebras", color: "#1e3a5f" },
    mistral: { name: "Mistral", color: "#ff6b6b" },
    cohere: { name: "Cohere", color: "#39594d" },
    bedrock: { name: "Amazon Bedrock", color: "#ff9900" },
    vertex: { name: "Google Vertex", color: "#4285f4" },
    azure: { name: "Azure OpenAI", color: "#0078d4" },
    perplexity: { name: "Perplexity", color: "#1b3a5c" },
    xai: { name: "xAI", color: "#1a1a2e" },
    huggingface: { name: "Hugging Face", color: "#ffd21e" },
    deepinfra: { name: "Deep Infra", color: "#0d1117" },
    moonshot: { name: "Moonshot AI", color: "#2b4f8c" },
    minimax: { name: "MiniMax", color: "#3b82f6" },
    nebius: { name: "Nebius", color: "#0066ff" },
    digitalocean: { name: "DigitalOcean", color: "#0080ff" },
  };

  function getProviderMeta(id) {
    if (PROVIDER_META[id]) return PROVIDER_META[id];
    return { name: id.charAt(0).toUpperCase() + id.slice(1), color: "#666" };
  }

  /** Open the provider modal and load available providers. */
  async function open() {
    const overlay = el("providerModalOverlay");
    overlay.classList.remove("hidden");
    showListView();
    el("providerError").classList.remove("active");
    el("providerSuccess").classList.remove("active");
    resetSelection();

    el("providerList").innerHTML =
      '<div class="provider-list-empty">Loading providers...</div>';

    await loadAuthMethods();

    // Check which providers are already connected
    try {
      const provData = await window.electronAPI.provider.list();
      PM.connectedProviders = provData.connected || [];
    } catch {
      PM.connectedProviders = [];
    }

    renderProviderList();
  }

  function close() {
    el("providerModalOverlay").classList.add("hidden");
    resetSelection();
  }

  function resetSelection() {
    PM.selectedProvider = null;
    PM.isConnecting = false;
    PM.customStep = 1;
    PM.customProviderId = "";
    PM.methodType = null;
    PM.methodIndex = -1;
    PM.extraPrompts = [];
    PM.oauthStage = null;
  }

  async function loadAuthMethods() {
    try {
      PM.authMethods = (await window.electronAPI.provider.authMethods()) || {};
      PM.providersList = Object.keys(PM.authMethods);
    } catch {
      PM.authMethods = {};
      PM.providersList = [];
    }
  }

  function renderProviderList() {
    const container = el("providerList");
    const ids = PM.providersList;
    if (!ids || ids.length === 0) {
      container.innerHTML = `<div class="provider-list-empty">No providers available</div>`;
      return;
    }

    const connectedIds = window.App.getConnectedProviderIds
      ? window.App.getConnectedProviderIds()
      : PM.connectedProviders || [];

    container.innerHTML = "";
    for (const id of ids) {
      const meta = getProviderMeta(id);
      const methods = PM.authMethods[id] || [];
      const connected = connectedIds.includes(id);

      const item = document.createElement("button");
      item.className = "provider-item";
      item.dataset.id = id;

      const connectedMark = connected
        ? `<span class="provider-item-connected"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>`
        : "";

      const deleteBtn = connected
        ? `<span class="provider-item-delete" title="Remove provider"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M6 4V2.5h4V4M5 4l.6 9.5h4.8L11 4"/></svg></span>`
        : "";

      item.innerHTML = `<span class="provider-item-label">${meta.name} ${connectedMark}</span>${deleteBtn}`;

      item.addEventListener("click", () => selectProvider(id, methods, meta));
      const delEl = item.querySelector(".provider-item-delete");
      if (delEl) {
        delEl.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteProvider(id);
        });
      }
      container.appendChild(item);
    }

    // Add "Other / Custom Provider" entry
    const otherItem = document.createElement("button");
    otherItem.className = "provider-item provider-item-other";
    otherItem.innerHTML = "Other";
    otherItem.addEventListener("click", () => openCustomProvider());
    container.appendChild(otherItem);
  }

  function openCustomProvider() {
    PM.selectedProvider = "__custom__";
    PM.customStep = 1;
    el("providerDetailTitle").textContent = "Custom Provider";
    el("providerList").classList.remove("active");
    el("providerList").classList.add("hidden");
    el("providerDetail").classList.add("active");
    el("providerError").classList.remove("active");
    el("providerSuccess").classList.remove("active");

    document.getElementById("providerDetailCustom").classList.add("active");
    document.getElementById("providerDetailDefault").classList.remove("active");

    showCustomStep(1);
  }

  function showCustomStep(step) {
    PM.customStep = step;
    const idRow = el("providerCustomIdRow");
    const keyRow = el("providerCustomKeyRow");
    const connectBtn = el("providerBtnConnect");

    if (step === 1) {
      idRow.style.display = "flex";
      keyRow.style.display = "none";
      el("providerCustomId").value = "";
      el("providerCustomId").focus();
      connectBtn.innerHTML = "<span>Next</span>";
      connectBtn.disabled = false;
      connectBtn.classList.remove("loading");
    } else {
      idRow.style.display = "none";
      keyRow.style.display = "flex";
      el("providerCustomIdDisplay").textContent = PM.customProviderId;
      el("providerCustomKey").value = "";
      el("providerCustomKey").focus();
      connectBtn.innerHTML = "<span>Connect</span>";
      connectBtn.disabled = false;
      connectBtn.classList.remove("loading");
    }
  }

  /** Render extra prompt fields (beyond the base API key) declared by an auth method. */
  function renderExtraPrompts(prompts) {
    const container = el("providerExtraFields");
    container.innerHTML = "";
    PM.extraPrompts = prompts || [];

    for (const prompt of PM.extraPrompts) {
      const group = document.createElement("div");
      group.className = "provider-field-group";
      group.style.marginTop = "16px";

      const label = document.createElement("div");
      label.className = "provider-detail-label";
      label.textContent = prompt.message || prompt.key;
      group.appendChild(label);

      if (prompt.type === "select") {
        const select = document.createElement("select");
        select.className = "provider-key-input";
        select.dataset.promptKey = prompt.key;
        for (const opt of prompt.options || []) {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          select.appendChild(option);
        }
        group.appendChild(select);
      } else {
        const input = document.createElement("input");
        input.className = "provider-key-input";
        input.type = "text";
        input.placeholder = prompt.placeholder || "";
        input.dataset.promptKey = prompt.key;
        group.appendChild(input);
      }

      container.appendChild(group);
    }
  }

  /** Collect the values of any extra prompt fields into a metadata object. */
  function collectExtraPromptValues() {
    const metadata = {};
    const container = el("providerExtraFields");
    container.querySelectorAll("[data-prompt-key]").forEach((fieldEl) => {
      metadata[fieldEl.dataset.promptKey] = fieldEl.value;
    });
    return metadata;
  }

  function selectProvider(id, methods, meta) {
    PM.selectedProvider = id;
    PM.oauthStage = null;

    const apiMethodIndex = methods.findIndex((m) => m.type === "api");
    const oauthMethodIndex = methods.findIndex((m) => m.type === "oauth");

    const isConnected =
      window.App.getConnectedProviderIds &&
      window.App.getConnectedProviderIds().includes(id);

    el("providerDetailTitle").textContent = meta.name;
    el("providerList").classList.remove("active");
    el("providerList").classList.add("hidden");
    el("providerDetail").classList.add("active");
    el("providerError").classList.remove("active");
    el("providerSuccess").classList.remove("active");

    const defaultDetail = document.getElementById("providerDetailDefault");
    const customDetail = document.getElementById("providerDetailCustom");
    const connectedDetail = document.getElementById("providerDetailConnected");

    el("providerOAuthCodeRow").style.display = "none";
    el("providerExtraFields").innerHTML = "";

    const connectBtn = el("providerBtnConnect");
    const removeBtn = el("providerBtnRemove");

    // Already-connected providers: show the connected state with a Remove button.
    if (isConnected) {
      defaultDetail.classList.remove("active");
      customDetail.classList.remove("active");
      connectedDetail.classList.add("active");
      connectBtn.style.display = "none";
      removeBtn.style.display = "";
      removeBtn.disabled = false;
      removeBtn.classList.remove("loading");
      removeBtn.innerHTML = "<span>Remove Provider</span>";
      return;
    }

    // Not connected: show the normal connect form.
    connectedDetail.classList.remove("active");
    defaultDetail.classList.add("active");
    customDetail.classList.remove("active");
    connectBtn.style.display = "";
    removeBtn.style.display = "none";

    document.getElementById("providerDetailDefault").classList.add("active");
    document.getElementById("providerDetailCustom").classList.remove("active");

    el("providerOAuthCodeRow").style.display = "none";
    el("providerExtraFields").innerHTML = "";

    // Prefer API key auth when available; fall back to OAuth.
    if (apiMethodIndex !== -1) {
      PM.methodType = "api";
      PM.methodIndex = apiMethodIndex;
      const method = methods[apiMethodIndex];

      el("providerDetailHint").textContent =
        `Enter your ${meta.name} API key to connect.`;
      el("providerKeyRow").style.display = "flex";
      el("providerKeyInput").value = "";
      el("providerKeyInput").placeholder =
        meta.name === "OpenAI"
          ? "sk-..."
          : meta.name === "Anthropic"
            ? "sk-ant-..."
            : "Paste your API key...";
      el("providerKeyInput").focus();

      renderExtraPrompts(method.prompts);
    } else if (oauthMethodIndex !== -1) {
      PM.methodType = "oauth";
      PM.methodIndex = oauthMethodIndex;

      el("providerDetailHint").textContent =
        `Click Connect to authorize ${meta.name} in your browser.`;
      el("providerKeyRow").style.display = "none";
    } else {
      // Shouldn't normally happen (every ProviderAuthMethod is "api" or "oauth"),
      // but fall back to a generic key paste as a safety net.
      PM.methodType = "api";
      PM.methodIndex = 0;

      el("providerDetailHint").textContent =
        `Paste your credentials for ${meta.name}.`;
      el("providerKeyRow").style.display = "flex";
      el("providerKeyInput").value = "";
      el("providerKeyInput").placeholder = "Paste your credentials...";
      el("providerKeyInput").focus();
    }

    connectBtn.disabled = false;
    connectBtn.classList.remove("loading");
    connectBtn.innerHTML = "<span>Connect</span>";
  }

  function showListView() {
    el("providerList").classList.add("active");
    el("providerList").classList.remove("hidden");
    el("providerDetail").classList.remove("active");
    el("providerSuccess").classList.remove("active");
    el("providerError").classList.remove("active");
    document.getElementById("providerDetailDefault").classList.remove("active");
    document.getElementById("providerDetailCustom").classList.remove("active");
    document.getElementById("providerDetailConnected").classList.remove("active");
    el("providerBtnConnect").style.display = "";
    el("providerBtnRemove").style.display = "none";
  }

  function setConnecting(label) {
    const connectBtn = el("providerBtnConnect");
    connectBtn.disabled = true;
    connectBtn.classList.add("loading");
    connectBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg><span>${label}</span>`;
  }

  function addForceShowProvider(id) {
    if (!id) return;
    if (!window.App.forceShowProviders) window.App.forceShowProviders = [];
    if (!window.App.forceShowProviders.includes(id)) {
      window.App.forceShowProviders.push(id);
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
    // Fallback: force-show already revealed it; do one final refresh.
    window.Providers.loadProviders();
    return false;
  }

  async function showSuccess(providerId) {
    el("providerDetail").classList.remove("active");
    el("providerSuccess").classList.add("active");

    // Reveal the new provider immediately (force-show bypasses the
    // startup-derived "connected" gate), then poll briefly in the background
    // to catch server-side propagation of its models.
    addForceShowProvider(providerId);
    if (window.App.addConnectedProvider) window.App.addConnectedProvider(providerId);
    window.Providers.loadProviders();

    setTimeout(() => close(), 900);
    refreshUntilProviderVisible(providerId);
  }

  /** Remove a connected provider (DELETE /auth/{id}) and refresh the UI. */
  async function deleteProvider(providerId) {
    if (PM.isConnecting || !providerId) return;
    PM.isConnecting = true;

    const removeBtn = el("providerBtnRemove");
    const connectBtn = el("providerBtnConnect");
    connectBtn.disabled = true;
    removeBtn.disabled = true;
    removeBtn.classList.add("loading");
    removeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg><span>Removing...</span>`;

    try {
      await window.electronAPI.provider.delete(providerId);
      if (window.App.removeConnectedProvider) {
        window.App.removeConnectedProvider(providerId);
      }
      if (window.App.forceShowProviders) {
        window.App.forceShowProviders = window.App.forceShowProviders.filter(
          (x) => x !== providerId,
        );
      }
      window.Providers.loadProviders();

      // Re-fetch the server-side connected list and rebuild the modal list.
      try {
        const provData = await window.electronAPI.provider.list();
        PM.connectedProviders = provData.connected || [];
      } catch {}
      renderProviderList();
      showListView();
    } catch (err) {
      removeBtn.classList.remove("loading");
      removeBtn.disabled = false;
      removeBtn.innerHTML = "<span>Remove Provider</span>";
      connectBtn.disabled = false;
      el("providerError").textContent =
        err.message || "Failed to remove provider.";
      el("providerError").classList.add("active");
    } finally {
      PM.isConnecting = false;
    }
  }

  function showConnectError(message) {
    el("providerError").textContent =
      message || "Failed to connect. Please try again.";
    el("providerError").classList.add("active");

    const connectBtn = el("providerBtnConnect");
    connectBtn.disabled = false;
    connectBtn.classList.remove("loading");
    connectBtn.innerHTML = "<span>Connect</span>";
    PM.isConnecting = false;
  }

  /** Handle the OAuth authorize -> (open browser) -> callback flow. */
  async function doOAuthConnect() {
    const providerId = PM.selectedProvider;

    if (PM.oauthStage === null) {
      // Step 1: start the authorization flow
      setConnecting("Starting...");
      const auth = await window.electronAPI.provider.oauthAuthorize(
        providerId,
        PM.methodIndex,
      );
      if (!auth || !auth.url) throw new Error("Could not start authorization.");

      window.electronAPI.openExternal(auth.url);
      PM.oauthStage = auth.method; // "auto" | "code"

      if (auth.method === "code") {
        el("providerDetailHint").textContent =
          auth.instructions ||
          "Paste the authorization code shown in your browser.";
        el("providerOAuthCodeRow").style.display = "flex";
        el("providerOAuthCodeInput").value = "";
        el("providerOAuthCodeInput").focus();
        const connectBtn = el("providerBtnConnect");
        connectBtn.disabled = false;
        connectBtn.classList.remove("loading");
        connectBtn.innerHTML = "<span>Submit code</span>";
      } else {
        el("providerDetailHint").textContent =
          auth.instructions ||
          "Complete the authorization in your browser, then click Continue.";
        const connectBtn = el("providerBtnConnect");
        connectBtn.disabled = false;
        connectBtn.classList.remove("loading");
        connectBtn.innerHTML = "<span>Continue</span>";
      }
      PM.isConnecting = false;
      return;
    }

    // Step 2: finish the flow
    setConnecting("Verifying...");
    const code =
      PM.oauthStage === "code"
        ? el("providerOAuthCodeInput").value.trim()
        : undefined;
    if (PM.oauthStage === "code" && !code) {
      throw new Error("Please paste the authorization code.");
    }
    await window.electronAPI.provider.oauthCallback(
      providerId,
      PM.methodIndex,
      code,
    );
    showSuccess(providerId);
  }

  /** Handle the plain API-key connect flow (PUT /auth/{id} with an ApiAuth body). */
  async function doApiKeyConnect() {
    let providerId = PM.selectedProvider;
    let key;
    let metadata;

    if (providerId === "__custom__") {
      if (PM.customStep === 1) {
        const customId = el("providerCustomId").value.trim();
        if (!customId) throw new Error("Please enter a provider ID.");
        PM.customProviderId = customId;
        showCustomStep(2);
        PM.isConnecting = false;
        return;
      }
      key = el("providerCustomKey").value.trim();
      if (!key) throw new Error("Please enter an API key.");
      providerId = PM.customProviderId;
    } else {
      key = el("providerKeyInput").value.trim();
      if (!key) throw new Error("Please enter an API key.");
      metadata = collectExtraPromptValues();
    }

    setConnecting("Connecting...");
    const credentials = {
      type: "api",
      key,
      ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
    };
    await window.electronAPI.provider.connect(providerId, credentials);
    showSuccess(providerId);
  }

  async function doConnect() {
    if (PM.isConnecting || !PM.selectedProvider) return;
    PM.isConnecting = true;
    el("providerError").classList.remove("active");

    try {
      if (PM.selectedProvider !== "__custom__" && PM.methodType === "oauth") {
        await doOAuthConnect();
      } else {
        await doApiKeyConnect();
      }
    } catch (err) {
      showConnectError(err.message);
    }
  }

  // --- Event bindings ---
  function init() {
    const overlay = el("providerModalOverlay");
    if (!overlay) return;

    // Close button
    el("providerModalClose").addEventListener("click", close);
    // Backdrop click
    el("providerModalBackdrop").addEventListener("click", close);
    // Back button in detail view
    el("providerDetailBack").addEventListener("click", showListView);
    // Cancel button
    el("providerBtnCancel").addEventListener("click", showListView);
    // Connect button
    el("providerBtnConnect").addEventListener("click", doConnect);
    // Remove button (connected providers)
    el("providerBtnRemove").addEventListener("click", () => {
      if (PM.selectedProvider) deleteProvider(PM.selectedProvider);
    });
    // Enter key in inputs
    const enterHandler = (e) => {
      if (e.key === "Enter") doConnect();
    };
    el("providerKeyInput").addEventListener("keydown", enterHandler);
    el("providerCustomId").addEventListener("keydown", enterHandler);
    el("providerCustomKey").addEventListener("keydown", enterHandler);
    el("providerOAuthCodeInput").addEventListener("keydown", enterHandler);
    // Escape key in inputs
    const escHandler = (e) => {
      if (e.key === "Escape") showListView();
    };
    el("providerKeyInput").addEventListener("keydown", escHandler);
    el("providerCustomId").addEventListener("keydown", escHandler);
    el("providerCustomKey").addEventListener("keydown", escHandler);
    // Escape key on overlay
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  // Init on DOMContentLoaded if already loaded, or wait
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose public API
  window.ProviderModal = { open, close };
})();
