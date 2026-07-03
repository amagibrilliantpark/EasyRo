// Revert modal state
let pendingRevertMessageId = null;
let pendingRevertMessageText = '';

/** Show the revert confirmation modal with message preview. */
function showRevertModal(messageId, messageText) {
  console.log(`[UI] Revert modal opened for message: ${messageId}`);
  pendingRevertMessageId = messageId;
  pendingRevertMessageText = messageText;

  const overlay = document.getElementById('revertModalOverlay');
  const messagePreview = document.getElementById('rmMessagePreview');

  if (messagePreview) {
    const truncatedText = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText;
    messagePreview.textContent = truncatedText;
  }

  if (overlay) overlay.classList.remove('hidden');
}

/** Close the revert modal and reset state. */
function closeRevertModal() {
  const overlay = document.getElementById('revertModalOverlay');
  if (overlay) overlay.classList.add('hidden');
  pendingRevertMessageId = null;
  pendingRevertMessageText = '';
}

/** Execute the revert operation. */
async function executeRevert() {
  if (!pendingRevertMessageId || !window.App.currentSession) return;

  const t0 = performance.now();
  console.log(`[UI] Executing revert for message: ${pendingRevertMessageId}`);

  try {
    await window.electronAPI.session.revert(window.App.currentSession, pendingRevertMessageId);

    // Remove the reverted message and all messages after it from UI
    const messages = document.querySelectorAll('.message');
    let foundRevertPoint = false;
    for (const msg of messages) {
      if (msg.dataset.messageId === pendingRevertMessageId) {
        foundRevertPoint = true;
        msg.remove();
      } else if (foundRevertPoint) {
        msg.remove();
      }
    }

    // Put reverted message text in input box
    const promptInput = document.querySelector('.prompt-input');
    if (promptInput) {
      promptInput.value = pendingRevertMessageText;
      promptInput.focus();
    }

    closeRevertModal();
    console.log(`[UI] Revert completed in ${(performance.now() - t0).toFixed(0)}ms`);
  } catch (error) {
    console.error(`[UI] Revert FAILED in ${(performance.now() - t0).toFixed(0)}ms:`, error);
    closeRevertModal();
  }
}

/** Initialize revert modal event listeners. */
function initRevertModal() {
  const cancelBtn = document.getElementById('rmCancel');
  const revertBtn = document.getElementById('rmRevert');

  if (cancelBtn) cancelBtn.addEventListener('click', closeRevertModal);
  if (revertBtn) revertBtn.addEventListener('click', executeRevert);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('revertModal');
      if (modal && !modal.classList.contains('hidden')) {
        closeRevertModal();
      }
    }
  });
}

window.Modals = { ...(window.Modals || {}), showRevertModal, closeRevertModal, initRevertModal };
