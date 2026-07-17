/** Provider modal: list, custom-provider, and detail rendering. */
(function () {
  const M = (window.ProviderModal = window.ProviderModal || {});

  function renderProviderList() {
    const container = M.el("providerList");
    const ids = M.PM.providersList;
    if (!ids || ids.length === 0) {
      container.innerHTML = `<div class="provider-list-empty">No providers available</div>`;
      return;
    }

    const connectedIds = window.App.getConnectedProviderIds
      ? window.App.getConnectedProviderIds()
      : M.PM.connectedProviders || [];

    container.innerHTML = "";
    for (const id of ids) {
      const detail = M.PM.providersAllDetails ? M.PM.providersAllDetails[id] : null;
      const meta = detail && detail.name ? { name: detail.name } : M.getProviderMeta(id);
      const methods = M.PM.authMethods[id] || [];
      const connected = connectedIds.includes(id);

      const item = document.createElement("button");
      item.className = "provider-item";
      item.dataset.id = id;

      const connectedMark = connected
        ? `<span class="provider-item-connected"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>`
        : "";

      item.innerHTML = `<span class="provider-item-label">${meta.name} ${connectedMark}</span>`;

      item.addEventListener("click", () => M.selectProvider(id, methods, meta));
      container.appendChild(item);
    }

    const otherItem = document.createElement("button");
    otherItem.className = "provider-item provider-item-other";
    otherItem.innerHTML = "Other";
    otherItem.addEventListener("click", () => M.openCustomProvider());
    container.appendChild(otherItem);
  }

  function openCustomProvider() {
    M.PM.selectedProvider = "__custom__";
    M.PM.customStep = 1;
    M.el("providerDetailTitle").textContent = "Custom Provider";
    M.el("providerList").classList.remove("active");
    M.el("providerList").classList.add("hidden");
    M.el("providerDetail").classList.add("active");
    M.el("providerError").classList.remove("active");
    M.el("providerSuccess").classList.remove("active");

    document.getElementById("providerDetailCustom").classList.add("active");
    document.getElementById("providerDetailDefault").classList.remove("active");

    M.showCustomStep(1);
  }

  function showCustomStep(step) {
    M.PM.customStep = step;
    const idRow = M.el("providerCustomIdRow");
    const keyRow = M.el("providerCustomKeyRow");
    const connectBtn = M.el("providerBtnConnect");

    if (step === 1) {
      idRow.style.display = "flex";
      keyRow.style.display = "none";
      M.el("providerCustomId").value = "";
      M.el("providerCustomId").focus();
      connectBtn.innerHTML = "<span>Next</span>";
      connectBtn.disabled = false;
      connectBtn.classList.remove("loading");
    } else {
      idRow.style.display = "none";
      keyRow.style.display = "flex";
      M.el("providerCustomIdDisplay").textContent = M.PM.customProviderId;
      M.el("providerCustomKey").value = "";
      M.el("providerCustomKey").focus();
      connectBtn.innerHTML = "<span>Connect</span>";
      connectBtn.disabled = false;
      connectBtn.classList.remove("loading");
    }
  }

  /** Render extra prompt fields (beyond the base API key) declared by an auth method. */
  function renderExtraPrompts(prompts) {
    const container = M.el("providerExtraFields");
    container.innerHTML = "";
    M.PM.extraPrompts = prompts || [];

    for (const prompt of M.PM.extraPrompts) {
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
    const container = M.el("providerExtraFields");
    container.querySelectorAll("[data-prompt-key]").forEach((fieldEl) => {
      metadata[fieldEl.dataset.promptKey] = fieldEl.value;
    });
    return metadata;
  }

  function selectProvider(id, methods, meta) {
    M.PM.selectedProvider = id;
    M.PM.oauthStage = null;

    const apiMethodIndex = methods.findIndex((m) => m.type === "api");
    const oauthMethodIndex = methods.findIndex((m) => m.type === "oauth");

    const isConnected =
      window.App.getConnectedProviderIds &&
      window.App.getConnectedProviderIds().includes(id);

    M.el("providerDetailTitle").textContent = meta.name;
    M.el("providerList").classList.remove("active");
    M.el("providerList").classList.add("hidden");
    M.el("providerDetail").classList.add("active");
    M.el("providerError").classList.remove("active");
    M.el("providerSuccess").classList.remove("active");

    const defaultDetail = document.getElementById("providerDetailDefault");
    const customDetail = document.getElementById("providerDetailCustom");
    const connectedDetail = document.getElementById("providerDetailConnected");

    M.el("providerOAuthCodeRow").style.display = "none";
    M.el("providerExtraFields").innerHTML = "";

    const connectBtn = M.el("providerBtnConnect");
    const disconnectBtn = M.el("providerBtnDisconnect");
    const removeBtn = M.el("providerBtnRemove");

    if (isConnected) {
      defaultDetail.classList.remove("active");
      customDetail.classList.remove("active");
      connectedDetail.classList.add("active");
      connectBtn.style.display = "none";
      const isCustom = M.isCustomProvider(id);
      disconnectBtn.style.display = "";
      removeBtn.style.display = isCustom ? "" : "none";
      disconnectBtn.disabled = false;
      disconnectBtn.classList.remove("loading");
      removeBtn.disabled = false;
      removeBtn.classList.remove("loading");
      disconnectBtn.innerHTML = "<span>Disconnect</span>";
      removeBtn.innerHTML = "<span>Delete Provider</span>";
      return;
    }

    connectedDetail.classList.remove("active");
    defaultDetail.classList.add("active");
    customDetail.classList.remove("active");
    connectBtn.style.display = "";
    disconnectBtn.style.display = "none";
    removeBtn.style.display = "none";

    document.getElementById("providerDetailDefault").classList.add("active");
    document.getElementById("providerDetailCustom").classList.remove("active");

    M.el("providerOAuthCodeRow").style.display = "none";
    M.el("providerExtraFields").innerHTML = "";

    if (apiMethodIndex !== -1) {
      M.PM.methodType = "api";
      M.PM.methodIndex = apiMethodIndex;
      const method = methods[apiMethodIndex];

      M.el("providerDetailHint").textContent =
        `Enter your ${meta.name} API key to connect.`;
      M.el("providerKeyRow").style.display = "flex";
      M.el("providerKeyInput").value = "";
      M.el("providerKeyInput").placeholder =
        meta.name === "OpenAI"
          ? "sk-..."
          : meta.name === "Anthropic"
            ? "sk-ant-..."
            : "Paste your API key...";
      M.el("providerKeyInput").focus();

      M.renderExtraPrompts(method.prompts);
    } else if (oauthMethodIndex !== -1) {
      M.PM.methodType = "oauth";
      M.PM.methodIndex = oauthMethodIndex;

      M.el("providerDetailHint").textContent =
        `Click Connect to authorize ${meta.name} in your browser.`;
      M.el("providerKeyRow").style.display = "none";
    } else {
      M.PM.methodType = "api";
      M.PM.methodIndex = 0;

      M.el("providerDetailHint").textContent =
        `Paste your credentials for ${meta.name}.`;
      M.el("providerKeyRow").style.display = "flex";
      M.el("providerKeyInput").value = "";
      M.el("providerKeyInput").placeholder = "Paste your credentials...";
      M.el("providerKeyInput").focus();
    }

    connectBtn.disabled = false;
    connectBtn.classList.remove("loading");
    connectBtn.innerHTML = "<span>Connect</span>";
  }

  function showListView() {
    M.el("providerList").classList.add("active");
    M.el("providerList").classList.remove("hidden");
    M.el("providerDetail").classList.remove("active");
    M.el("providerSuccess").classList.remove("active");
    M.el("providerError").classList.remove("active");
    document.getElementById("providerDetailDefault").classList.remove("active");
    document.getElementById("providerDetailCustom").classList.remove("active");
    document.getElementById("providerDetailConnected").classList.remove("active");
    M.el("providerBtnConnect").style.display = "";
    M.el("providerBtnDisconnect").style.display = "none";
    M.el("providerBtnRemove").style.display = "none";
  }

  function setConnecting(label) {
    const connectBtn = M.el("providerBtnConnect");
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

  M.renderProviderList = renderProviderList;
  M.openCustomProvider = openCustomProvider;
  M.showCustomStep = showCustomStep;
  M.renderExtraPrompts = renderExtraPrompts;
  M.collectExtraPromptValues = collectExtraPromptValues;
  M.selectProvider = selectProvider;
  M.showListView = showListView;
  M.setConnecting = setConnecting;
  M.addForceShowProvider = addForceShowProvider;
})();
