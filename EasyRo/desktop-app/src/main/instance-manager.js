const path = require('path');
const log = require('./logger');
const { OpenCodeClient } = require('./opencode-client');
const { startOpencode, startSyncRo, findSyncRoExecutable, killProcessesOnPorts, killProcessTree, sleep } = require('./process-manager');

/** Manages SyncRo and OpenCode child processes per project. */
class InstanceManager {
  constructor() {
    this.instances = new Map();
    this.baseSyncRoPort = 5000;
    this.baseOpencodePort = 4096;
    this.portAllocator = { syncro: 0, opencode: 0 };
    this._startingPromise = null;
  }

  /** Allocate the next available port pair for SyncRo and OpenCode. */
  allocatePorts(projectId) {
    const maxOffset = 100;
    if (this.portAllocator.syncro >= maxOffset) {
      this.portAllocator.syncro = 0;
    }
    if (this.portAllocator.opencode >= maxOffset) {
      this.portAllocator.opencode = 0;
    }
    const ports = {
      syncro: this.baseSyncRoPort + this.portAllocator.syncro,
      opencode: this.baseOpencodePort + this.portAllocator.opencode
    };
    this.portAllocator.syncro++;
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

  /** Internal: kill existing instance, spawn SyncRo + OpenCode, wait for health. */
  async _doStartInstance(project, ports) {
    const { id: projectId, path: projectPath } = project;
    const instanceStart = Date.now();
    log.info('INSTANCE', `Starting instance for project: ${projectId}`);

    if (this.instances.has(projectId)) {
      log.info('INSTANCE', `Stopping existing instance for project: ${projectId}`);
      const stopStart = Date.now();
      await this.stopInstance(projectId);
      log.info('INSTANCE', `Existing instance stopped in ${Date.now() - stopStart}ms`);
    }

    log.info('INSTANCE', `Killing processes on ports: ${ports.syncro} and ${ports.opencode}`);
    const killStart = Date.now();
    await killProcessesOnPorts(ports.syncro, ports.opencode);
    log.info('INSTANCE', `Ports cleared in ${Date.now() - killStart}ms`);

    const instance = {
      project,
      ports,
      syncroProcess: null,
      opencodeProcess: null,
      client: null,
      status: 'starting'
    };

    this.instances.set(projectId, instance);
    log.info('INSTANCE', 'Instance object created with status: starting');

    try {
      log.info('INSTANCE', 'Starting SyncRo process...');
      const syncroStart = Date.now();
      await startSyncRo(instance);
      log.info('INSTANCE', `SyncRo started in ${Date.now() - syncroStart}ms`);

      log.info('INSTANCE', 'Starting OpenCode process...');
      const ocStart = Date.now();
      await startOpencode(instance);
      log.info('INSTANCE', `OpenCode started in ${Date.now() - ocStart}ms`);

      log.info('INSTANCE', 'Creating OpenCode client...');
      this.createClient(instance);
      log.info('INSTANCE', 'Client created');

      log.info('INSTANCE', 'Waiting for health check...');
      const healthStart = Date.now();
      await this.waitForHealth(instance);
      log.info('INSTANCE', `Health check passed in ${Date.now() - healthStart}ms`);

      instance.status = 'running';
      log.info('INSTANCE', `Instance status set to: running (total: ${Date.now() - instanceStart}ms)`);
    } catch (error) {
      instance.status = 'error';
      instance.error = error.message;
      log.error('INSTANCE', `Instance start FAILED after ${Date.now() - instanceStart}ms:`, error.message);
      log.error('INSTANCE', 'Error stack:', error.stack);
      throw error;
    }
  }

  /** Create an OpenCodeClient pointed at the running instance. */
  createClient(instance) {
    const baseUrl = `http://127.0.0.1:${instance.ports.opencode}`;
    instance.client = new OpenCodeClient(baseUrl);
  }

  /** Poll the health endpoint until the instance reports healthy. */
  async waitForHealth(instance, maxRetries = 30) {
    log.info('SYSTEM', `Health check starting (max ${maxRetries} attempts)`);
    for (let i = 0; i < maxRetries; i++) {
      try {
        const data = await instance.client.health();
        if (data && data.healthy) {
          log.info('SYSTEM', `Health check passed on attempt ${i + 1}`);
          return true;
        }
        log.info('SYSTEM', `Health check attempt ${i + 1}: not healthy yet`);
      } catch (err) {
        if (i % 5 === 0) {
          log.info('SYSTEM', `Health check attempt ${i + 1}: connection failed (${err.message})`);
        }
      }
      await sleep(500);
    }
    log.error('SYSTEM', `Health check timeout after ${maxRetries} attempts`);
    throw new Error('Health check timeout');
  }

  /** Gracefully stop both child processes for a project. */
  async stopInstance(projectId) {
    const instance = this.instances.get(projectId);
    if (!instance) return;

    const exitPromises = [];

    if (instance.syncroProcess) {
      const p = instance.syncroProcess;
      exitPromises.push(new Promise((resolve) => {
        p.on('exit', resolve);
        p.kill();
        killProcessTree(p.pid);
      }));
    }
    if (instance.opencodeProcess) {
      const p = instance.opencodeProcess;
      exitPromises.push(new Promise((resolve) => {
        p.on('exit', resolve);
        p.kill();
        killProcessTree(p.pid);
      }));
    }

    if (exitPromises.length > 0) {
      await Promise.race([
        Promise.all(exitPromises),
        sleep(5000)
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
}

module.exports = { InstanceManager };
