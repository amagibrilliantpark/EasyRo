/** Return the currently selected variant key only if the given model actually supports it. */
function getVariantForModel(model) {
  if (!model || !window.App.providers) return undefined;
  const allProviders = window.App.providers.all || [];
  const provider = allProviders.find((p) => p.id === model.provider);
  if (!provider || !provider.models) return undefined;
  const modelData =
    provider.models[model.model] ||
    Object.values(provider.models).find((m) => m.id === model.model);
  if (!modelData || !modelData.variants) return undefined;
  const keys = Object.keys(modelData.variants);
  if (!keys.length) return undefined;
  return keys.includes(window.App.currentVariant)
    ? window.App.currentVariant
    : keys[0];
}

/** Send the prompt input text to the AI. Aborts any in-progress generation first. */
async function sendMessage() {
  const input = document.querySelector(".prompt-input");
  const text = input.value.trim();
  if (!text) return;

  const sendStartTime = performance.now();
  console.log(`[Perf] ⏱ sendMessage START at ${sendStartTime.toFixed(0)}ms`);

  if (window.App.isProcessing && window.App.currentSession) {
    try {
      console.log(`[Perf] ⏱ Aborting previous session...`);
      await window.electronAPI.session.abort(window.App.currentSession);
      await new Promise((r) => setTimeout(r, 300));
      console.log(
        `[Perf] ⏱ Abort done in ${(performance.now() - sendStartTime).toFixed(0)}ms`,
      );
    } catch (e) {
      // already idle
    }
  }

  window.App.isProcessing = false;
  Chat.Streaming.resetAccum();
  Chat.Indicators.hideAllStatusIndicators();

  Chat.Messages.appendMessage("user", text);
  input.value = "";
  setStopMode(true);

  try {
    const sessionStart = performance.now();
    const sessionId = await window.Sessions.ensureSession();
    console.log(
      `[Perf] ⏱ ensureSession done in ${(performance.now() - sessionStart).toFixed(0)}ms, session: ${sessionId}`,
    );

    const model = window.App.currentModel;
    const agent = window.App.currentAgent;
    const modelWithVariant = model
      ? { ...model, variant: getVariantForModel(model) }
      : null;

    const sendAsyncStart = performance.now();
    console.log(
      `[Perf] ⏱ sendAsync START, model: ${model?.id || "none"}, agent: ${agent || "build"}`,
    );
    await window.electronAPI.message.sendAsync(
      sessionId,
      text,
      modelWithVariant,
      agent || "build",
    );
    console.log(
      `[Perf] ⏱ sendAsync DONE in ${(performance.now() - sendAsyncStart).toFixed(0)}ms`,
    );
    console.log(
      `[Perf] ⏱ Total sendMessage ${(performance.now() - sendStartTime).toFixed(0)}ms`,
    );

    if (typeof window.SSE !== "undefined")
      window.SSE.lastSendMessageTime = Date.now();
  } catch (error) {
    Chat.Indicators.hideAllStatusIndicators();
    Chat.Messages.appendMessage("assistant", "Error: " + error.message);
    console.error(
      `[Perf] ❌ sendMessage FAILED after ${(performance.now() - sendStartTime).toFixed(0)}ms:`,
      error.message,
    );
    setStopMode(false);
  }
}

/** Abort the current session's running generation. */
async function stopGeneration() {
  if (!window.App.currentSession) return;
  try {
    await window.electronAPI.session.abort(window.App.currentSession);
  } catch (error) {
    // ignore
  }
  setStopMode(false);
  Chat.Indicators.hideAllStatusIndicators();
}

/** Toggle the send button between send/stop modes and disable input while processing. */
function setStopMode(active) {
  window.App.isProcessing = active;
  const btn = document.querySelector(".btn-send");
  const input = document.querySelector(".prompt-input");
  btn.classList.toggle("stop-mode", active);
  input.disabled = active;
  if (!active) setTimeout(() => input.focus(), 50);
}

window.Chat = window.Chat || {};
window.Chat.sendMessage = sendMessage;
window.Chat.stopGeneration = stopGeneration;
window.Chat.setStopMode = setStopMode;

// Aliases for backward compatibility
window.Chat.renderMessages = Chat.Messages.renderMessages;
window.Chat.appendMessage = Chat.Messages.appendMessage;
window.Chat.appendStreamingText = Chat.Streaming.appendStreamingText;
window.Chat.finalizeStreaming = Chat.Streaming.finalizeStreaming;
window.Chat.resetStreamingAccum = Chat.Streaming.resetAccum;
window.Chat.removeStreamingCursor = Chat.Streaming.removeCursor;
window.Chat.showThinking = Chat.Indicators.showThinking;
window.Chat.hideThinking = Chat.Indicators.hideThinking;
window.Chat.showError = Chat.Indicators.showError;
window.Chat.showCompaction = Chat.Indicators.showCompaction;
window.Chat.showCompacted = Chat.Indicators.showCompacted;
window.Chat.showUsageExceed = Chat.Indicators.showUsageExceed;
window.Chat.hideAllStatusIndicators = Chat.Indicators.hideAllStatusIndicators;
