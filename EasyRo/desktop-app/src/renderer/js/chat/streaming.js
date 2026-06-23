// Accumulated text for the current streaming response
let streamingTextAccum = '';
let streamingRenderPending = false;
let streamingTargetMsg = null;
let streamingDeltaCount = 0;
let lastStreamingChunk = '';

/** Append a chunk of streamed text and schedule a render pass. */
function appendStreamingText(text) {
  // Guard against duplicate chunks
  if (text === lastStreamingChunk && text.length > 10) {
    console.warn(`[Perf] Streaming: duplicate chunk detected, skipping (${text.length} chars)`);
    return;
  }
  lastStreamingChunk = text;

  const container = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.classList.remove('active');

  if (!streamingTargetMsg || !streamingTargetMsg.parentNode || streamingTargetMsg.querySelector('.msg-card')) {
    streamingTargetMsg = document.createElement('div');
    streamingTargetMsg.className = 'message ai-message';
    container.appendChild(streamingTargetMsg);
    streamingDeltaCount = 0;
    console.log(`[Perf] Streaming: new message element created`);
  }

  Chat.Indicators.hideThinking();
  removeStreamingCursor();

  streamingTextAccum += text;
  streamingDeltaCount++;

  if (!streamingRenderPending) {
    streamingRenderPending = true;
    requestAnimationFrame(flushStreamingRender);
  }

  container.scrollTop = container.scrollHeight;
}

/** Re-render the streaming message from accumulated text (batched via rAF). */
function flushStreamingRender() {
  streamingRenderPending = false;
  if (!streamingTargetMsg || !streamingTargetMsg.parentNode) return;

  streamingTargetMsg.querySelectorAll('.msg-text, .streaming-cursor, pre').forEach(el => el.remove());
  Chat.Messages.renderTextContent(streamingTargetMsg, streamingTextAccum);
  addStreamingCursor(streamingTargetMsg);
}

/** Clean up streaming state when the response is complete. */
function finalizeStreaming() {
  if (!streamingTargetMsg || !streamingTargetMsg.parentNode) return;
  if (!streamingTextAccum) return;

  console.log(`[Perf] Streaming finalized: ${streamingDeltaCount} deltas, ${streamingTextAccum.length} chars`);
  removeStreamingCursor();
  resetStreamingAccum();
}

/** Reset all streaming state (called on new message or session switch). */
function resetStreamingAccum() {
  streamingTextAccum = '';
  streamingTargetMsg = null;
  streamingRenderPending = false;
  lastStreamingChunk = '';
}

/** Add a blinking cursor element at the end of the streaming message. */
function addStreamingCursor(parentMsg) {
  let cursor = parentMsg.querySelector('.streaming-cursor');
  if (!cursor) {
    cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    parentMsg.appendChild(cursor);
  }
}

/** Remove all streaming cursor elements from the DOM. */
function removeStreamingCursor() {
  document.querySelectorAll('.streaming-cursor').forEach(c => c.remove());
}

window.Chat = window.Chat || {};
window.Chat.Streaming = { appendStreamingText, finalizeStreaming, resetAccum: resetStreamingAccum, removeCursor: removeStreamingCursor };
