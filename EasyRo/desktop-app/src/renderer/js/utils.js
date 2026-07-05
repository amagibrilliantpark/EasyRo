/** DOM element cache to avoid repeated getElementById/querySelector calls */
const domCache = {};

/** Get an element by ID, using cache if available */
function $(id) {
  if (!domCache[id]) {
    domCache[id] = document.getElementById(id);
  }
  return domCache[id];
}

/** Clear DOM cache (useful for session switches or major DOM changes) */
function clearDomCache() {
  for (const key in domCache) {
    delete domCache[key];
  }
}

/** Update the status indicator dot and text in the sidebar. */
function setStatus(type, text) {
  const statusDot = $('statusDot');
  const statusText = $('statusText');
  if (statusDot) statusDot.className = `status-dot ${type}`;
  if (statusText) statusText.textContent = text;
}

/** Escape HTML entities to prevent XSS when inserting user text. */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.Utils = { setStatus, escapeHtml, $, clearDomCache };
