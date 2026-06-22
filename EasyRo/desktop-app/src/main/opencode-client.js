const log = require('./logger');

/** HTTP client for the OpenCode serve API. */
class OpenCodeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /** Make an HTTP request to the OpenCode API with timeout and error handling. */
  async request(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(text);
          errorMessage = errorJson.message || errorJson.error || text;
        } catch {
          errorMessage = text || errorMessage;
        }
        if (response.status === 429) {
          throw new Error(`Rate limit exceeded: ${errorMessage}`);
        } else if (response.status === 402 || response.status === 403) {
          throw new Error(`Usage/quota exceeded: ${errorMessage}`);
        }
        throw new Error(errorMessage);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout: ${method} ${endpoint}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  health() { return this.request('GET', '/global/health'); }
  listSessions() { return this.request('GET', '/session'); }
  createSession(title) { return this.request('POST', '/session', title ? { title } : {}); }
  getSession(id) { return this.request('GET', `/session/${id}`); }
  deleteSession(id) { return this.request('DELETE', `/session/${id}`); }
  updateSession(id, data) { return this.request('PATCH', `/session/${id}`, data); }
  getSessionTodo(id) { return this.request('GET', `/session/${id}/todo`); }
  forkSession(id, messageId) {
    return this.request('POST', `/session/${id}/fork`, { messageID: messageId });
  }
  abortSession(id) { return this.request('POST', `/session/${id}/abort`); }
  revertSession(id) { return this.request('POST', `/session/${id}/revert`); }
  unrevertSession(id) { return this.request('POST', `/session/${id}/unrevert`); }
  getSessionMessages(id) { return this.request('GET', `/session/${id}/message`); }

  sendMessage(sessionId, text, model) {
    const body = {
      parts: [{ type: 'text', text }],
      ...(model && { model: { providerID: model.provider, modelID: model.model } })
    };
    return this.request('POST', `/session/${sessionId}/message`, body);
  }

  sendMessageAsync(sessionId, text, model, agent) {
    const body = {
      parts: [{ type: 'text', text }],
      ...(model && { model: { providerID: model.provider, modelID: model.model, ...(model.variant && { variant: model.variant }) } }),
      ...(agent && { agent })
    };
    return this.request('POST', `/session/${sessionId}/prompt_async`, body);
  }

  respondPermission(sessionId, permissionId, response, remember) {
    return this.request('POST', `/session/${sessionId}/permissions/${permissionId}`, {
      response,
      remember
    });
  }

  respondQuestion(requestID, answers) {
    return this.request('POST', `/question/${requestID}/reply`, {
      answers: Array.isArray(answers) ? answers : [answers]
    });
  }

  rejectQuestion(requestID) {
    return this.request('POST', `/question/${requestID}/reject`);
  }

  listPendingQuestions() {
    return this.request('GET', '/question');
  }

  getConfig() { return this.request('GET', '/config'); }
  patchConfig(patch) { return this.request('PATCH', '/config', patch); }
  listProviders() { return this.request('GET', '/provider'); }
  listAgents() { return this.request('GET', '/agent'); }
  listTools() { return this.request('GET', '/experimental/tool/ids'); }
  readFile(filePath) { return this.request('GET', `/file/content?path=${encodeURIComponent(filePath)}`); }
  searchFiles(pattern) { return this.request('GET', `/find?pattern=${encodeURIComponent(pattern)}`); }
  findFiles(query) { return this.request('GET', `/find/file?query=${encodeURIComponent(query)}`); }
}

module.exports = { OpenCodeClient };
