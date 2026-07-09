/** Update the session name displayed in the right panel header. */
function updateSessionName(title) {
  const el = document.getElementById('rpSessionName');
  if (el) el.textContent = title;
}

/** Update token count, percentage used, and cost in the context stats bar. */
function updateContextStats(tokenData) {
  const el = document.getElementById('rpStats');
  if (!el) return;

  let tokens = 0;
  let cost = 0;
  let maxTokens = 0;

  if (tokenData) {
    const input = tokenData.input || 0;
    const output = tokenData.output || 0;
    const reasoning = tokenData.reasoning || 0;
    tokens = input + output + reasoning;
    cost = tokenData.cost || 0;
  }

  // Get max context from current model
  if (window.App.currentModel && window.App.providers) {
    const allProviders = window.App.providers.all || [];
    for (const p of allProviders) {
      if (p.id === window.App.currentModel.provider && p.models) {
        let model = p.models[window.App.currentModel.model];
        if (!model) {
          const modelArray = Object.values(p.models);
          model = modelArray.find(m => m.id === window.App.currentModel.model);
        }
        if (model) {
          maxTokens = (model.limit && model.limit.context) || model.context_length || model.contextLength || 0;
        }
        break;
      }
    }
  }

  const percent = maxTokens > 0 ? Math.min(100, Math.round((tokens / maxTokens) * 100)) : 0;
  const costStr = cost > 0 ? `$${cost.toFixed(4)}` : '$0.00';
  const percentStr = maxTokens > 0 ? `${percent}% used` : '';
  const tokenStr = tokens > 0 ? `${tokens.toLocaleString()} tokens` : '';

  const parts = [tokenStr, percentStr, `${costStr} spent`].filter(Boolean);
  el.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
}

/** Render the todo list with checkboxes in the right panel. */
function updateTodoList(todos) {
  const container = document.getElementById('todoList');
  if (!container) return;

  container.innerHTML = '';

  if (!todos || todos.length === 0) return;

  for (const todo of todos) {
    const item = document.createElement('div');
    item.className = 'rp-todo-item';

    // Highlight in_progress todo with accent color
    if (todo.status === 'in_progress') {
      item.classList.add('rp-todo-item-active');
    }

    const check = document.createElement('span');
    check.className = 'todo-check';
    const isCompleted = todo.status === 'completed';
    check.textContent = isCompleted ? '[x]' : '[ ]';

    const text = document.createTextNode(todo.content || 'Todo');

    item.appendChild(check);
    item.appendChild(text);
    container.appendChild(item);
  }
}

/** Clear all todo items from the right panel. */
function clearTodoList() {
  const container = document.getElementById('todoList');
  if (container) container.innerHTML = '';
}

/** Update the SyncRo status in the right panel. */
function updateSyncRoStatus(status) {
  const el = document.getElementById('rpSyncRoStatus');
  if (el) {
    el.textContent = status || 'Unknown';
    el.className = 'rp-syncro-status ' + (status === 'Running' ? 'running' : 'stopped');
  }
}

function aggregateTokensFromMessages(messages) {
  let input = 0, output = 0, reasoning = 0, cost = 0;
  const list = messages.value || messages || [];
  for (const msg of list) {
    const info = msg.info || msg;
    if (info.role === 'assistant' && info.tokens) {
      input += info.tokens.input || 0;
      output += info.tokens.output || 0;
      reasoning += info.tokens.reasoning || 0;
    }
    if (info.role === 'assistant' && typeof info.cost === 'number') {
      cost += info.cost;
    }
  }
  return { input, output, reasoning, cost };
}

window.RightPanel = { updateSessionName, updateContextStats, updateTodoList, clearTodoList, updateSyncRoStatus, aggregateTokensFromMessages };
