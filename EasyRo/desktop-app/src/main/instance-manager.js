const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

/** Manages Rojo and OpenCode child processes per project. */
class InstanceManager {
  constructor() {
    this.instances = new Map();
    this.baseRojoPort = 3000;
    this.baseOpencodePort = 4096;
    this.portAllocator = { rojo: 0, opencode: 0 };
    this._startingPromise = null;
  }

  /** Allocate the next available port pair for Rojo and OpenCode. */
  allocatePorts(projectId) {
    const maxOffset = 100;
    if (this.portAllocator.rojo >= maxOffset) {
      this.portAllocator.rojo = 0;
    }
    if (this.portAllocator.opencode >= maxOffset) {
      this.portAllocator.opencode = 0;
    }
    const ports = {
      rojo: this.baseRojoPort + this.portAllocator.rojo,
      opencode: this.baseOpencodePort + this.portAllocator.opencode
    };
    this.portAllocator.rojo++;
    this.portAllocator.opencode++;
    return ports;
  }

  /** Start a project instance (waits for any in-progress start to finish first). */
  async startInstance(project, ports) {
    if (this._startingPromise) {
      await this._startingPromise;
    }

    this._startingPromise = this._doStartInstance(project, ports);
    try {
      return await this._startingPromise;
    } finally {
      this._startingPromise = null;
    }
  }

  /** Internal: kill existing instance, spawn Rojo + OpenCode, wait for health. */
  async _doStartInstance(project, ports) {
    const { id: projectId, path: projectPath } = project;

    if (this.instances.has(projectId)) {
      await this.stopInstance(projectId);
    }

    await this.killProcessesOnPorts(ports.rojo, ports.opencode);

    const instance = {
      project,
      ports,
      rojoProcess: null,
      opencodeProcess: null,
      client: null,
      status: 'starting'
    };

    this.instances.set(projectId, instance);

    try {
      await this.startRojo(instance);
      await this.startOpencode(instance);
      this.createClient(instance);
      await this.waitForHealth(instance);
      instance.status = 'running';
    } catch (error) {
      instance.status = 'error';
      instance.error = error.message;
      throw error;
    }
  }

  /** Spawn the Rojo process and resolve when it starts listening. */
  async startRojo(instance) {
    const { project, ports } = instance;
    const rojoPath = this.findRojoExecutable(project.path);

    return new Promise((resolve, reject) => {
      const args = ['serve', '--port', ports.rojo.toString()];
      const child = spawn(rojoPath, args, {
        cwd: project.path,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });

      instance.rojoProcess = child;

      let started = false;
      const timeout = setTimeout(() => {
        if (!started) {
          child.kill();
          reject(new Error('Rojo start timeout'));
        }
      }, 30000);

      child.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server started') || output.includes('Listening') || output.includes('listening')) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        const lower = output.toLowerCase();
        if ((lower.includes('error') && !lower.includes('no error')) || lower.includes('fatal') || lower.includes('failed')) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            reject(new Error(`Rojo error: ${output}`));
          }
        }
      });

      child.on('error', (error) => {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          reject(error);
        }
      });

      child.on('exit', (code) => {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          reject(new Error(`Rojo exited with code ${code}`));
        }
      });
    });
  }

  /** Spawn the OpenCode serve process and resolve when it's ready. */
  async startOpencode(instance) {
    const { project, ports } = instance;

    return new Promise((resolve, reject) => {
      const args = ['serve', '--port', ports.opencode.toString(), '--hostname', '127.0.0.1'];
      const child = spawn('opencode', args, {
        cwd: project.path,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          OPENCODE_CONFIG: path.join(project.path, 'opencode.json')
        }
      });

      instance.opencodeProcess = child;

      let started = false;
      const timeout = setTimeout(() => {
        if (!started) {
          child.kill();
          reject(new Error('OpenCode start timeout'));
        }
      }, 20000);

      child.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server listening') || output.includes('Ready') || output.includes('listening') || output.includes('ready')) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        const lower = output.toLowerCase();
        if ((lower.includes('error') && !lower.includes('no error')) || lower.includes('fatal') || lower.includes('failed')) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            reject(new Error(`OpenCode error: ${output}`));
          }
        }
      });

      child.on('error', (error) => {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          reject(error);
        }
      });

      child.on('exit', (code) => {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          reject(new Error(`OpenCode exited with code ${code}`));
        }
      });
    });
  }

  /** Create an OpenCodeClient pointed at the running instance. */
  createClient(instance) {
    const baseUrl = `http://127.0.0.1:${instance.ports.opencode}`;
    instance.client = new OpenCodeClient(baseUrl);
  }

  /** Poll the health endpoint until the instance reports healthy. */
  async waitForHealth(instance, maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const data = await instance.client.health();
        if (data && data.healthy) return true;
      } catch {
        // not ready yet
      }
      await this.sleep(500);
    }
    throw new Error('Health check timeout');
  }

  /** Gracefully stop both child processes for a project. */
  async stopInstance(projectId) {
    const instance = this.instances.get(projectId);
    if (!instance) return;

    const exitPromises = [];

    if (instance.rojoProcess) {
      exitPromises.push(new Promise((resolve) => {
        instance.rojoProcess.on('exit', resolve);
        instance.rojoProcess.kill();
      }));
    }
    if (instance.opencodeProcess) {
      exitPromises.push(new Promise((resolve) => {
        instance.opencodeProcess.on('exit', resolve);
        instance.opencodeProcess.kill();
      }));
    }

    if (exitPromises.length > 0) {
      await Promise.race([
        Promise.all(exitPromises),
        this.sleep(5000)
      ]);
    }

    instance.status = 'stopped';
    this.instances.delete(projectId);
  }

  /** Stop all running instances. */
  async killAll() {
    for (const [projectId] of this.instances) {
      await this.stopInstance(projectId);
    }
  }

  getClient(projectId) {
    const instance = this.instances.get(projectId);
    return instance ? instance.client : null;
  }

  getStatus(projectId) {
    const instance = this.instances.get(projectId);
    if (!instance) return { status: 'not_started' };
    return {
      status: instance.status,
      ports: instance.ports,
      error: instance.error
    };
  }

  /** Find rojo.exe in the project dir, parent dir, or fall back to PATH. */
  findRojoExecutable(projectPath) {
    const localRojo = path.join(projectPath, 'rojo.exe');
    if (fs.existsSync(localRojo)) return localRojo;

    const parentRojo = path.join(path.dirname(projectPath), 'rojo.exe');
    if (fs.existsSync(parentRojo)) return parentRojo;

    return 'rojo';
  }

  /** Kill any process already listening on the given ports. */
  async killProcessesOnPorts(rojoPort, opencodePort) {
    for (const port of [rojoPort, opencodePort]) {
      try {
        if (process.platform === 'win32') {
          const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8', timeout: 5000 }).trim();
          if (result) {
            const lines = result.split('\n');
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              const pid = parseInt(parts[parts.length - 1]);
              if (pid && pid > 0) {
                try { execSync(`taskkill /PID ${pid} /F`, { timeout: 3000 }); } catch {}
              }
            }
          }
        } else {
          const result = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', timeout: 5000 }).trim();
          if (result) {
            const pids = result.split('\n').filter(p => p.trim());
            for (const pid of pids) {
              try { execSync(`kill -9 ${pid.trim()}`, { timeout: 3000 }); } catch {}
            }
          }
        }
      } catch {}
    }
    await this.sleep(500);
  }

  /** Promise-based sleep. */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { InstanceManager, OpenCodeClient };
