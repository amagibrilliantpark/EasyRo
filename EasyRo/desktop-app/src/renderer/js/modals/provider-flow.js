/** Provider modal: OAuth/API-key connect flows + event binding/init. */
(function () {
  const M = (window.ProviderModal = window.ProviderModal || {});

  /** Handle the OAuth authorize -> (open browser) -> callback flow. */
  async function doOAuthConnect() {
    const providerId = M.PM.selectedProvider;

    if (M.PM.oauthStage === null) {
      M.setConnecting("Starting...");
      const auth = await window.electronAPI.provider.oauthAuthorize(
        providerId,
        M.PM.methodIndex,
      );
      if (!auth || !auth.url) throw new Error("Could not start authorization.");

      window.electronAPI.openExternal(auth.url);
      M.PM.oauthStage = auth.method;

      if (auth.method === "code") {
        M.el("providerDetailHint").textContent =
          auth.instructions ||
          "Paste the authorization code shown in your browser.";
        M.el("providerOAuthCodeRow").style.display = "flex";
        M.el("providerOAuthCodeInput").value = "";
        M.el("providerOAuthCodeInput").focus();
        const connectBtn = M.el("providerBtnConnect");
        connectBtn.disabled = false;
        connectBtn.classList.remove("loading");
        connectBtn.innerHTML = "<span>Submit code</span>";
      } else {
        M.el("providerDetailHint").textContent =
          auth.instructions ||
          "Complete the authorization in your browser, then click Continue.";
        const connectBtn = M.el("providerBtnConnect");
        connectBtn.disabled = false;
        connectBtn.classList.remove("loading");
        connectBtn.innerHTML = "<span>Continue</span>";
      }
      M.PM.isConnecting = false;
      return;
    }

    M.setConnecting("Verifying...");
    const code =
      M.PM.oauthStage === "code"
        ? M.el("providerOAuthCodeInput").value.trim()
        : undefined;
    if (M.PM.oauthStage === "code" && !code) {
      throw new Error("Please paste the authorization code.");
    }
    await window.electronAPI.provider.oauthCallback(
      providerId,
      M.PM.methodIndex,
      code,
    );
    M.showSuccess(providerId);
  }

  /** Handle the plain API-key connect flow (PUT /auth/{id} with an ApiAuth body). */
  async function doApiKeyConnect() {
    let providerId = M.PM.selectedProvider;
    let key;
    let metadata;

    if (providerId === "__custom__") {
      if (M.PM.customStep === 1) {
        const customId = M.el("providerCustomId").value.trim();
        if (!customId) throw new Error("Please enter a provider ID.");
        M.PM.customProviderId = customId;
        M.showCustomStep(2);
        M.PM.isConnecting = false;
        return;
      }
      key = M.el("providerCustomKey").value.trim();
      if (!key) throw new Error("Please enter an API key.");
      providerId = M.PM.customProviderId;
    } else {
      key = M.el("providerKeyInput").value.trim();
      if (!key) throw new Error("Please enter an API key.");
      metadata = M.collectExtraPromptValues();
    }

    M.setConnecting("Connecting...");
    const credentials = {
      type: "api",
      key,
      ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
    };
    await window.electronAPI.provider.connect(providerId, credentials);
    M.showSuccess(providerId);
  }

  async function doConnect() {
    if (M.PM.isConnecting || !M.PM.selectedProvider) return;
    M.PM.isConnecting = true;
    M.el("providerError").classList.remove("active");

    try {
      if (M.PM.selectedProvider !== "__custom__" && M.PM.methodType === "oauth") {
        await M.doOAuthConnect();
      } else {
        await M.doApiKeyConnect();
      }
    } catch (err) {
      M.showConnectError(err.message);
    }
  }

  // --- Event bindings ---
  function init() {
    const overlay = M.el("providerModalOverlay");
    if (!overlay) return;

    M.el("providerModalClose").addEventListener("click", M.close);
    M.el("providerModalBackdrop").addEventListener("click", M.close);
    M.el("providerDetailBack").addEventListener("click", M.showListView);
    M.el("providerBtnConnect").addEventListener("click", M.doConnect);
    M.el("providerBtnDisconnect").addEventListener("click", () => {
      if (M.PM.selectedProvider) M.deleteProvider(M.PM.selectedProvider, "disconnect");
    });
    M.el("providerBtnRemove").addEventListener("click", () => {
      if (M.PM.selectedProvider) M.deleteProvider(M.PM.selectedProvider, "delete");
    });
    const enterHandler = (e) => {
      if (e.key === "Enter") M.doConnect();
    };
    M.el("providerKeyInput").addEventListener("keydown", enterHandler);
    M.el("providerCustomId").addEventListener("keydown", enterHandler);
    M.el("providerCustomKey").addEventListener("keydown", enterHandler);
    M.el("providerOAuthCodeInput").addEventListener("keydown", enterHandler);
    const escHandler = (e) => {
      if (e.key === "Escape") M.showListView();
    };
    M.el("providerKeyInput").addEventListener("keydown", escHandler);
    M.el("providerCustomId").addEventListener("keydown", escHandler);
    M.el("providerCustomKey").addEventListener("keydown", escHandler);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") M.close();
    });
  }

  M.doOAuthConnect = doOAuthConnect;
  M.doApiKeyConnect = doApiKeyConnect;
  M.doConnect = doConnect;
  M.init = init;

  // Init on DOMContentLoaded if already loaded, or wait
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
