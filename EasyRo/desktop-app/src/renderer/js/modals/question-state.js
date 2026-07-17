// Question modal state
let pendingQuestion = null;
let questionModalOpen = false;
let currentQ = 0;
let answers = [];
let customInputs = [];
let inConfirmMode = false;
let activeOptionIndex = -1;
let isSubmitting = false;

/** Extract the request ID from a pending question (handles different API shapes). */
function getQuestionRequestID() {
  if (!pendingQuestion) return null;
  return pendingQuestion.id || pendingQuestion.requestID || pendingQuestion.request_id || null;
}
/** Escape HTML to safely render question text. */
function escapeQuestion(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}