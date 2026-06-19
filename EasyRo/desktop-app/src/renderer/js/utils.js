/** Update the status indicator dot and text in the sidebar. */
function setStatus(type, text) {
  document.getElementById('statusDot').className = `status-dot ${type}`;
  document.getElementById('statusText').textContent = text;
}

/** Escape HTML entities to prevent XSS when inserting user text. */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.Utils = { setStatus, escapeHtml };
