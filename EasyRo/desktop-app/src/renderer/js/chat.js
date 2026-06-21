/** Send the prompt input text to the AI. Aborts any in-progress generation first. */
async function sendMessage() {
  const input = document.querySelector('.prompt-input');
  const text = input.value.trim();
  if (!text) return;

  if (window.App.isProcessing && window.App.currentSession) {
    try {
      await window.electronAPI.session.abort(window.App.currentSession);
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      // already idle
    }
  }

  window.App.isProcessing = false;
  Chat.Streaming.resetAccum();
  Chat.Indicators.hideAllStatusIndicators();

  Chat.Messages.appendMessage('user', text);
  input.value = '';
  setStopMode(true);

  try {
    const sessionId = await window.Sessions.ensureSession();
    const model = window.App.currentModel;
    const agent = window.App.currentAgent;
    const variant = window.App.currentVariant;
    const modelWithVariant = model ? { ...model, variant } : null;
    await window.electronAPI.message.sendAsync(
      sessionId,
      text,
      modelWithVariant,
      agent || 'build'
    );
    if (typeof window.SSE !== 'undefined') window.SSE.lastSendMessageTime = Date.now();
    window.electronAPI.log('info', 'RENDERER', 'Message sent to session: ' + sessionId);
  } catch (error) {
    Chat.Indicators.hideAllStatusIndicators();
    Chat.Messages.appendMessage('assistant', 'Error: ' + error.message);
    window.electronAPI.log('error', 'RENDERER', 'Send message error: ' + error.message);
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
  const btn = document.querySelector('.btn-send');
  const input = document.querySelector('.prompt-input');
  btn.classList.toggle('stop-mode', active);
  input.disabled = active;
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
