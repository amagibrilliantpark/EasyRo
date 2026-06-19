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
  let maxTokens = 200000;

  if (tokenData) {
    const input = tokenData.input || 0;
    const output = tokenData.output || 0;
    const reasoning = tokenData.reasoning || 0;
    tokens = input + output + reasoning;
    cost = tokenData.cost || 0;

    // Get max context from current model
    if (window.App.currentModel && window.App.providers) {
      const allProviders = window.App.providers.all || [];
      for (const p of allProviders) {
        if (p.id === window.App.currentModel.provider && p.models) {
          const model = p.models[window.App.currentModel.model];
          if (model && model.limit && model.limit.context) {
            maxTokens = model.limit.context;
          }
          break;
        }
      }
    }
  }

  const percent = maxTokens > 0 ? Math.min(100, Math.round((tokens / maxTokens) * 100)) : 0;

  el.innerHTML = `
    <span>${tokens.toLocaleString()} tokens</span>
    <span>${percent}% used</span>
    <span>$${cost.toFixed(4)} spent</span>
  `;
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

window.RightPanel = { updateSessionName, updateContextStats, updateTodoList, clearTodoList };
