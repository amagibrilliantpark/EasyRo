/** Provider modal shared state + helpers. Attached to window.ProviderModal so the
 *  list/connect submodules (loaded as separate scripts) can share them. */
(function () {
  const M = (window.ProviderModal = window.ProviderModal || {});

  M.PM = {
    selectedProvider: null,
    authMethods: {},
    providersList: [],
    connectedProviders: [],
    isConnecting: false,
    customStep: 1,
    customProviderId: "",
    methodType: null,
    methodIndex: -1,
    extraPrompts: [],
    oauthStage: null,
  };

  function el(id) {
    return document.getElementById(id);
  }
  M.el = el;

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
  M.PROVIDER_META = PROVIDER_META;

  function getProviderMeta(id) {
    if (PROVIDER_META[id]) return PROVIDER_META[id];
    return { name: id.charAt(0).toUpperCase() + id.slice(1), color: "#666" };
  }
  M.getProviderMeta = getProviderMeta;

  /** A provider is "custom" (user-added) when OpenCode doesn't ship a built-in
   *  auth method for it — i.e. it isn't in the auth-methods list. Built-in
   *  defaults stay in that list, so they can be disconnected but not deleted. */
  function isCustomProvider(id) {
    return !M.PM.authMethods || !M.PM.authMethods[id];
  }
  M.isCustomProvider = isCustomProvider;

  /** Custom/extra provider ids the user added (not in the built-in auth-methods
   *  list). Persisted so they keep showing in the modal after reopening it. */
  function getExtraProviderIds() {
    try {
      const raw = localStorage.getItem('easyro_extra_providers');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function addExtraProvider(id) {
    if (!id || id === '__custom__') return;
    const list = getExtraProviderIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem('easyro_extra_providers', JSON.stringify(list));
    }
  }
  function removeExtraProvider(id) {
    const list = getExtraProviderIds().filter((x) => x !== id);
    localStorage.setItem('easyro_extra_providers', JSON.stringify(list));
  }
  M.getExtraProviderIds = getExtraProviderIds;
  M.addExtraProvider = addExtraProvider;
  M.removeExtraProvider = removeExtraProvider;
})();
