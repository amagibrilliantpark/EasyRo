/** Show a "Thinking..." indicator at the bottom of the chat. */
function showThinking(label) {
  hideAllStatusIndicators();
  const text = label || 'Thinking...';
  const container = document.getElementById('chatArea');
  const indicator = document.createElement('div');
  indicator.className = 'thinking-indicator active';
  indicator.textContent = text;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

/** Remove the thinking indicator and streaming cursor. */
function hideThinking() {
  Chat.Streaming.removeCursor();
  document.querySelectorAll('.thinking-indicator').forEach(el => el.remove());
}

/** Remove all status indicators (thinking, error, compaction, usage). */
function hideAllStatusIndicators() {
  document.querySelectorAll('.thinking-indicator, .error-indicator, .compaction-indicator, .usage-indicator').forEach(el => el.remove());
}

/** Show an error message indicator in the chat. */
function showError(message) {
  hideAllStatusIndicators();
  const text = message || 'An error occurred';
  const container = document.getElementById('chatArea');
  const indicator = document.createElement('div');
  indicator.className = 'error-indicator active';
  indicator.textContent = text;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

/** Show a "Compacting context" indicator with animated dots. */
function showCompaction(message) {
  hideAllStatusIndicators();
  const container = document.getElementById('chatArea');
  const indicator = document.createElement('div');
  indicator.className = 'compaction-indicator active';
  indicator.innerHTML = '<span class="compaction-label">' + escapeHtml(message || 'Compacting context') + '</span><span class="compaction-bounce"><span></span><span></span><span></span></span>';
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

/** Show a brief "Compacted" confirmation that auto-dismisses after 3s. */
function showCompacted() {
  hideAllStatusIndicators();
  const container = document.getElementById('chatArea');
  const indicator = document.createElement('div');
  indicator.className = 'compaction-indicator active';
  indicator.textContent = 'Compacted';
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
  setTimeout(() => { if (indicator.parentNode) indicator.remove(); }, 3000);
}

/** Show a usage/rate-limit exceeded warning. */
function showUsageExceed(message) {
  hideAllStatusIndicators();
  const text = message || 'Usage limit exceeded';
  const container = document.getElementById('chatArea');
  const indicator = document.createElement('div');
  indicator.className = 'usage-indicator active';
  indicator.textContent = text;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

window.Chat = window.Chat || {};
window.Chat.Indicators = { showThinking, hideThinking, hideAllStatusIndicators, showError, showCompaction, showCompacted, showUsageExceed };
