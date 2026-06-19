/** Re-render the full message list from session history. */
function renderMessages(messages) {
  const container = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');

  container.querySelectorAll('.message, .thinking-indicator, .error-indicator, .compaction-indicator, .usage-indicator, .streaming-cursor').forEach(m => m.remove());
  Chat.Streaming.resetAccum();

  if (!messages || messages.length === 0) {
    emptyState.classList.add('active');
    return;
  }

  emptyState.classList.remove('active');

  const msgList = messages.value || messages;

  for (const msg of msgList) {
    if (msg.parts) {
      for (const part of msg.parts) {
        if (part.type === 'text' && part.text) {
          appendMessage(msg.info ? msg.info.role : 'assistant', part.text);
        }
      }
    }
  }

  container.scrollTop = container.scrollHeight;
}

/** Append a single message bubble to the chat area. */
function appendMessage(role, text) {
  const container = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');
  emptyState.classList.remove('active');

  const msg = document.createElement('div');
  msg.className = 'message ' + (role === 'user' ? 'user-message' : 'ai-message');

  if (role === 'user') {
    msg.innerHTML = '<div class="msg-card">' + escapeHtml(text) + '</div>';
  } else {
    renderTextContent(msg, text);
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

/** Render inline markdown: bold, italic, inline code, and line breaks. */
function renderInlineMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

/** Render message text with fenced code blocks and diff highlighting. */
function renderTextContent(container, text) {
  const regex = /```(\w+)?\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const beforeCode = text.slice(lastIndex, match.index);
    if (beforeCode.trim()) {
      const span = document.createElement('span');
      span.className = 'msg-text';
      span.innerHTML = renderInlineMarkdown(beforeCode);
      container.appendChild(span);
    }

    const code = match[2];
    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');

    const lines = code.split('\n');
    for (const line of lines) {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'code-line';

      if (line.startsWith('+')) {
        lineDiv.classList.add('diff-add');
        lineDiv.textContent = line;
      } else if (line.startsWith('-')) {
        lineDiv.classList.add('diff-remove');
        lineDiv.textContent = line;
      } else if (line.startsWith('@@')) {
        lineDiv.classList.add('diff-context');
        lineDiv.textContent = line;
      } else {
        lineDiv.textContent = line;
      }

      codeEl.appendChild(lineDiv);
    }

    pre.appendChild(codeEl);
    container.appendChild(pre);
    lastIndex = match.index + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    const span = document.createElement('span');
    span.className = 'msg-text';
    span.innerHTML = renderInlineMarkdown(remaining);
    container.appendChild(span);
  }
}

window.Chat = window.Chat || {};
window.Chat.Messages = { renderMessages, appendMessage, renderTextContent, renderInlineMarkdown };
