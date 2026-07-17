/** Submit all question answers to the backend and close the modal. */
async function submitQuestionAnswers() {
  if (!pendingQuestion || isSubmitting) return;
  isSubmitting = true;

  try {
    const requestID = getQuestionRequestID();
    const answerList = pendingQuestion.questions.map((q, i) => {
      const selected = customInputs[i]?.trim() || answers[i] || '';
      return [selected];
    });

    const msgParts = pendingQuestion.questions.map((q, i) => {
      const label = q.header || q.label || ('Q' + (i + 1));
      const answer = customInputs[i]?.trim() || answers[i] || '\u2014';
      return label + ': ' + answer;
    });
    window.Chat.appendMessage('user', msgParts.join('\n'));

    if (!requestID) {
      closeQuestionModal();
      return;
    }
    await window.electronAPI.question.respond(requestID, answerList);
    
    closeQuestionModal();
    window.Chat.setStopMode(true);
    window.Chat.showThinking();
  } catch (error) {
    closeQuestionModal();
  }
}

/** Reject the current question and close the modal. */
async function rejectQuestionModal() {
  if (!pendingQuestion) return;
  const requestID = getQuestionRequestID();
  if (requestID) {
    try {
      await window.electronAPI.question.reject(requestID);
    } catch (error) {
      // ignore
    }
  }
  const wasOpen = questionModalOpen;
  closeQuestionModal();
  if (wasOpen) {
    window.Chat.setStopMode(false);
    window.Chat.hideAllStatusIndicators();
  }
}

/** Hide the question modal and reset state. */
function closeQuestionModal() {
  const modal = document.getElementById('questionModal');
  const promptBox = document.querySelector('.prompt-box');
  if (modal) modal.classList.add('hidden');
  if (promptBox) promptBox.classList.remove('hidden');
  questionModalOpen = false;
  pendingQuestion = null;
  isSubmitting = false;
}

/** Set up event listeners for the question modal (close button, text input, keyboard nav). */
function initQuestionModal() {
  const closeBtn = document.getElementById('qmClose');
  if (closeBtn) closeBtn.addEventListener('click', rejectQuestionModal);

  const textInput = document.getElementById('qmTextInput');
  if (textInput) {
    textInput.addEventListener('input', () => {
      customInputs[currentQ] = textInput.value;
      renderTopBar();
    });
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !questionModalOpen) return;
      if (e.key === 'Enter' && !inConfirmMode) {
        e.preventDefault();
        if (textInput.value.trim()) {
          customInputs[currentQ] = textInput.value;
          if (currentQ < pendingQuestion.questions.length - 1) {
            currentQ++;
            renderQuestionOptions();
          }
          checkAllAnswered();
        } else if (activeOptionIndex >= 0) {
          selectOption(activeOptionIndex);
        }
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!questionModalOpen || inConfirmMode) return;
    if (document.activeElement === textInput) return;

    if (e.key === 'Escape') { rejectQuestionModal(); return; }
    const q = pendingQuestion?.questions[currentQ];
    if (!q) return;
    const options = q.options || [];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveOption(activeOptionIndex < options.length - 1 ? activeOptionIndex + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveOption(activeOptionIndex > 0 ? activeOptionIndex - 1 : options.length - 1);
    } else if (e.key === 'Enter' && activeOptionIndex >= 0) {
      e.preventDefault();
      selectOption(activeOptionIndex);
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key) - 1;
      if (idx < options.length) selectOption(idx);
    }
  });
}
window.Modals = { showQuestionModal, closeQuestionModal, rejectQuestionModal, initQuestionModal };