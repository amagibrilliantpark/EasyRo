/** Open the question modal and initialize state for multi-question flow. */
function showQuestionModal(properties) {
  if (!properties || !properties.questions || !properties.questions.length) {
    return;
  }

  if (pendingQuestion && questionModalOpen) {
    const oldRequestID = getQuestionRequestID();
    if (oldRequestID) {
      window.electronAPI.question.reject(oldRequestID).catch(() => {});
    }
  }

  pendingQuestion = properties;
  currentQ = 0;
  answers = new Array(properties.questions.length).fill(undefined);
  customInputs = new Array(properties.questions.length).fill('');
  inConfirmMode = false;
  activeOptionIndex = -1;
  isSubmitting = false;
  questionModalOpen = true;

  window.Chat.hideThinking();

  const modal = document.getElementById('questionModal');
  const promptBox = document.querySelector('.prompt-box');
  if (modal) modal.classList.remove('hidden');
  if (promptBox) promptBox.classList.add('hidden');

  renderQuestionOptions();

  setTimeout(() => {
    const textInput = document.getElementById('qmTextInput');
    if (textInput) textInput.focus();
  }, 50);
}

/** Render the top tab bar showing question labels and confirm button. */
function renderTopBar() {
  const qmTopBar = document.getElementById('qmTopBar');
  if (!qmTopBar || !pendingQuestion) return;
  const questions = pendingQuestion.questions;

  qmTopBar.innerHTML = '';
  questions.forEach((q, i) => {
    const lbl = document.createElement('span');
    let c = 'qm-top-label';
    if (!inConfirmMode && i === currentQ) c += ' active';
    if (answers[i] !== undefined || (customInputs[i] && customInputs[i].trim())) c += ' answered';
    lbl.className = c;
    lbl.textContent = q.header || q.label || ('Q' + (i + 1));
    lbl.addEventListener('click', () => {
      if (inConfirmMode) return;
      saveCurrentInput();
      currentQ = i;
      renderQuestionOptions();
    });
    qmTopBar.appendChild(lbl);
  });

  const allDone = questions.every((q, i) => answers[i] !== undefined || (customInputs[i] && customInputs[i].trim()));
  const cl = document.createElement('span');
  cl.className = 'qm-top-label' + (inConfirmMode ? ' active' : '') + (allDone ? ' answered' : '');
  cl.textContent = 'Confirm';
  cl.addEventListener('click', () => {
    saveCurrentInput();
    showConfirmScreen();
  });
  qmTopBar.appendChild(cl);
}

/** Render the options list for the current question. */
function renderQuestionOptions() {
  if (!pendingQuestion) return;
  const questions = pendingQuestion.questions;
  const q = questions[currentQ];
  inConfirmMode = false;
  activeOptionIndex = -1;

  const qmTitle = document.getElementById('qmTitle');
  const qmBody = document.getElementById('qmBody');
  const qmFooter = document.getElementById('qmFooter');
  const qmDivider = document.getElementById('qmDivider');
  const qmTextInput = document.getElementById('qmTextInput');

  if (qmTitle) qmTitle.textContent = q.question || q.text || 'Question';
  if (qmBody) qmBody.innerHTML = '';
  if (qmFooter) qmFooter.style.display = '';
  if (qmDivider) qmDivider.style.display = '';
  if (qmTextInput) qmTextInput.value = customInputs[currentQ] || '';

  renderTopBar();

  const options = q.options || [];
  const saved = answers[currentQ];

  options.forEach((opt, i) => {
    const row = document.createElement('div');
    row.className = 'qm-row';
    const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.text || String(opt));
    if (saved && saved === optLabel) { row.classList.add('active', 'answered'); }
    const optDesc = typeof opt === 'object' && opt.description ? opt.description : '';
    row.innerHTML = '<div class="qm-num">' + (i + 1) + '</div>' +
      '<div class="qm-label">' + escapeQuestion(optLabel) +
      (optDesc ? '<div style="font-size:11px;color:#94a3b8;margin-top:2px;">' + escapeQuestion(optDesc) + '</div>' : '') +
      '</div>' +
      '<svg class="qm-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

    row.addEventListener('mouseenter', () => setActiveOption(i));
    row.addEventListener('click', () => selectOption(i));
    if (qmBody) qmBody.appendChild(row);
    if (saved && saved === optLabel) setActiveOption(i);
  });
}

/** Highlight the option at index i. */
function setActiveOption(i) {
  activeOptionIndex = i;
  const qmBody = document.getElementById('qmBody');
  if (qmBody) {
    qmBody.querySelectorAll('.qm-row').forEach((el, idx) => el.classList.toggle('active', idx === i));
  }
}

/** Select an option, save the answer, and advance to the next question. */
function selectOption(i) {
  const q = pendingQuestion.questions[currentQ];
  const options = q.options || [];
  const optLabel = typeof options[i] === 'string' ? options[i] : (options[i].label || options[i].text || String(options[i]));
  answers[currentQ] = optLabel;
  customInputs[currentQ] = '';
  const qmTextInput = document.getElementById('qmTextInput');
  if (qmTextInput) qmTextInput.value = '';

  if (currentQ < pendingQuestion.questions.length - 1) {
    currentQ++;
    renderQuestionOptions();
  }
  checkAllAnswered();
}

/** Auto-advance to confirm screen if all questions have answers. */
function checkAllAnswered() {
  const allDone = pendingQuestion.questions.every((q, i) =>
    answers[i] !== undefined || (customInputs[i] && customInputs[i].trim())
  );
  if (allDone) {
    showConfirmScreen();
  }
}

/** Persist the current text input value before switching questions. */
function saveCurrentInput() {
  const qmTextInput = document.getElementById('qmTextInput');
  if (qmTextInput) {
    customInputs[currentQ] = qmTextInput.value;
  }
}

/** Show a summary of all answers with Confirm/Back buttons. */
function showConfirmScreen() {
  inConfirmMode = true;
  saveCurrentInput();

  const qmTitle = document.getElementById('qmTitle');
  const qmBody = document.getElementById('qmBody');
  const qmFooter = document.getElementById('qmFooter');
  const qmDivider = document.getElementById('qmDivider');

  if (qmTitle) qmTitle.textContent = 'Your selections';
  if (qmBody) qmBody.innerHTML = '';
  if (qmFooter) qmFooter.style.display = 'none';
  if (qmDivider) qmDivider.style.display = 'none';

  renderTopBar();

  pendingQuestion.questions.forEach((q, i) => {
    const answer = customInputs[i]?.trim() || answers[i] || '\u2014';
    const label = q.header || q.label || ('Q' + (i + 1));
    const row = document.createElement('div');
    row.className = 'qm-row-confirm';
    row.innerHTML = '<span class="qm-confirm-label">' + escapeQuestion(label) + '</span>' +
      '<span class="qm-confirm-value">' + escapeQuestion(answer) + '</span>';
    if (qmBody) qmBody.appendChild(row);
  });

  const actions = document.createElement('div');
  actions.className = 'qm-confirm-actions';
  actions.innerHTML = '<button class="qm-btn-send">Confirm & Send</button><button class="qm-btn-back">Back</button>';
  actions.querySelector('.qm-btn-back').addEventListener('click', () => {
    currentQ = 0;
    renderQuestionOptions();
  });
  actions.querySelector('.qm-btn-send').addEventListener('click', () => {
    if (!isSubmitting) submitQuestionAnswers();
  });
  if (qmBody) qmBody.appendChild(actions);
}
