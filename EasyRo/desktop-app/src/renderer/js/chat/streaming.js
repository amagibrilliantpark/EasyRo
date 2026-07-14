// Accumulated text for the current streaming response
let streamingTextAccum = '';
let streamingRenderPending = false;
let streamingTargetMsg = null;
let streamingDeltaCount = 0;
let lastStreamingChunk = '';
let streamingRenderThreshold = 0; // Minimum chars before we force a full re-render (for code blocks)

/** Append a chunk of streamed text and schedule a render pass. */
function appendStreamingText(text) {
  // Guard against duplicate chunks
  if (text === lastStreamingChunk && text.length > 10) {
    console.warn(`[Perf] Streaming: duplicate chunk detected, skipping (${text.length} chars)`);
    return;
  }
  lastStreamingChunk = text;

  const container = Utils.$('chatArea');
  const emptyState = Utils.$('emptyState');
  if (emptyState) emptyState.classList.remove('active');

  if (!streamingTargetMsg || !streamingTargetMsg.parentNode || streamingTargetMsg.querySelector('.msg-card')) {
    streamingTargetMsg = document.createElement('div');
    streamingTargetMsg.className = 'message ai-message';
    container.appendChild(streamingTargetMsg);
    streamingDeltaCount = 0;
    streamingRenderThreshold = 0;
  }

  Chat.Indicators.hideThinking();
  removeStreamingCursor();

  streamingTextAccum += text;
  streamingDeltaCount++;

  if (!streamingRenderPending) {
    streamingRenderPending = true;
    requestAnimationFrame(flushStreamingRender);
  }
}

/** Optimized render: only full re-render when code blocks might be involved */
function flushStreamingRender() {
  streamingRenderPending = false;
  if (!streamingTargetMsg || !streamingTargetMsg.parentNode) return;

  // Check if we have any code block markers - if yes, do a full re-render
  const recentText = streamingTextAccum.slice(streamingRenderThreshold);
  const hasCodeMarkers = recentText.includes('```');
  
  if (hasCodeMarkers || streamingTextAccum.length < 500) {
    // Full re-render (for code blocks or short texts)
    streamingTargetMsg.querySelectorAll('.msg-text, .streaming-cursor, pre').forEach(el => el.remove());
    Chat.Messages.renderTextContent(streamingTargetMsg, streamingTextAccum);
    streamingRenderThreshold = streamingTextAccum.length;
  } else {
    // Optimized incremental append - find last text span and add to it
    const spans = streamingTargetMsg.querySelectorAll('.msg-text');
    if (spans.length > 0) {
      const lastSpan = spans[spans.length - 1];
      const remainingText = streamingTextAccum.slice(streamingRenderThreshold);
      lastSpan.innerHTML += Chat.Messages.renderInlineMarkdown(remainingText);
      streamingRenderThreshold = streamingTextAccum.length;
    } else {
      // Fallback to full render if no spans exist yet
      streamingTargetMsg.querySelectorAll('.msg-text, .streaming-cursor, pre').forEach(el => el.remove());
      Chat.Messages.renderTextContent(streamingTargetMsg, streamingTextAccum);
      streamingRenderThreshold = streamingTextAccum.length;
    }
  }
  
  addStreamingCursor(streamingTargetMsg);

  // Scroll once per animation frame instead of on every incoming delta,
  // avoiding a forced synchronous layout for each streamed token.
  const container = streamingTargetMsg.parentNode;
  if (container) container.scrollTop = container.scrollHeight;
}

/** Clean up streaming state when the response is complete. */
function finalizeStreaming() {
  if (!streamingTargetMsg || !streamingTargetMsg.parentNode) return;
  if (!streamingTextAccum) return;

  removeStreamingCursor();
  resetStreamingAccum();
}

/** Reset all streaming state (called on new message or session switch). */
function resetStreamingAccum() {
  streamingTextAccum = '';
  streamingTargetMsg = null;
  streamingRenderPending = false;
  lastStreamingChunk = '';
  streamingRenderThreshold = 0;
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
