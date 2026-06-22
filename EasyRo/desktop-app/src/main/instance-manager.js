const path = require('path');
const log = require('./logger');
const { OpenCodeClient } = require('./opencode-client');
const { startRojo, startOpencode, findRojoExecutable, killProcessesOnPorts, sleep } = require('./process-manager');

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
    log.info('INSTANCE', 'Starting instance for project:', projectId);

    if (this.instances.has(projectId)) {
      log.info('INSTANCE', 'Stopping existing instance for project:', projectId);
      await this.stopInstance(projectId);
    }

    log.info('INSTANCE', 'Killing processes on ports:', ports.rojo, 'and', ports.opencode);
    await killProcessesOnPorts(ports.rojo, ports.opencode);
    log.info('INSTANCE', 'Ports cleared');

    const instance = {
      project,
      ports,
      rojoProcess: null,
      opencodeProcess: null,
      client: null,
      status: 'starting'
    };

    this.instances.set(projectId, instance);
    log.info('INSTANCE', 'Instance object created with status: starting');

    try {
      log.info('INSTANCE', 'Starting Rojo process...');
      await startRojo(instance);
      log.info('INSTANCE', 'Rojo started successfully');
      
      log.info('INSTANCE', 'Starting OpenCode process...');
      await startOpencode(instance);
      log.info('INSTANCE', 'OpenCode started successfully');
      
      log.info('INSTANCE', 'Creating OpenCode client...');
      this.createClient(instance);
      log.info('INSTANCE', 'Client created');
      
      log.info('INSTANCE', 'Waiting for health check...');
      await this.waitForHealth(instance);
      log.info('INSTANCE', 'Health check passed');
      
      instance.status = 'running';
      log.info('INSTANCE', 'Instance status set to: running');
    } catch (error) {
      instance.status = 'error';
      instance.error = error.message;
      log.error('INSTANCE', 'Instance start failed:', error.message);
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
    for (let i = 0; i < maxRetries; i++) {
      try {
        const data = await instance.client.health();
        if (data && data.healthy) {
          log.info('SYSTEM', 'Health check passed on attempt', i + 1);
          return true;
        }
      } catch {
        // not ready yet
      }
      await sleep(500);
    }
    log.error('SYSTEM', 'Health check timeout after', maxRetries, 'attempts');
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
