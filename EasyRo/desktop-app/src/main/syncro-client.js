const WebSocket = require('ws');
const log = require('./logger');

class SyncRoClient {
  constructor(port) {
    this.port = port;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.port}`;
      log.info('SYNCRO_CLIENT', `Connecting to SyncRo at ${url}`);

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        log.info('SYNCRO_CLIENT', 'Connected to SyncRo');
        this.connected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on('error', (error) => {
        log.error('SYNCRO_CLIENT', 'Connection error:', error.message);
        this.connected = false;
        if (this.reconnectAttempts === 0) {
          reject(error);
        }
      });

      this.ws.on('close', (code, reason) => {
        log.warn('SYNCRO_CLIENT', `Connection closed (code: ${code}, reason: ${reason || 'none'})`);
        this.connected = false;
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          log.info('SYNCRO_CLIENT', `Received: ${message.type}`, JSON.stringify(message));
        } catch (err) {
          log.error('SYNCRO_CLIENT', 'Failed to parse message:', err.message);
        }
      });
    });
  }

  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('SYNCRO_CLIENT', 'Max reconnection attempts reached');
      return false;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    log.info('SYNCRO_CLIENT', `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();
      return true;
    } catch (error) {
      return this.reconnect();
    }
  }

  send(message) {
    if (!this.connected || !this.ws) {
      log.warn('SYNCRO_CLIENT', `Cannot send message (${message.type}): not connected (connected: ${this.connected}, ws: ${!!this.ws})`);
      return false;
    }

    try {
      const payload = JSON.stringify(message);
      log.info('SYNCRO_CLIENT', `Sending: ${message.type}`, payload);
      this.ws.send(payload);
      return true;
    } catch (error) {
      log.error('SYNCRO_CLIENT', `Failed to send ${message.type}:`, error.message);
      return false;
    }
  }

  async pause() {
    log.info('SYNCRO_CLIENT', 'Pausing SyncRo file watcher...');
    const success = this.send({ type: 'pause' });
    if (success) {
      await new Promise(resolve => setTimeout(resolve, 500));
      log.info('SYNCRO_CLIENT', 'SyncRo paused successfully');
    } else {
      log.warn('SYNCRO_CLIENT', 'SyncRo pause failed - not connected');
    }
    return success;
  }

  resume() {
    log.info('SYNCRO_CLIENT', 'Resuming SyncRo file watcher...');
    const success = this.send({ type: 'resume' });
    if (success) {
      log.info('SYNCRO_CLIENT', 'SyncRo resume message sent');
    } else {
      log.warn('SYNCRO_CLIENT', 'SyncRo resume failed - not connected');
    }
    return success;
  }

  resumeWithFullSync() {
    log.info('SYNCRO_CLIENT', 'Resuming SyncRo with full sync...');
    const success = this.send({ type: 'resumeWithFullSync' });
    if (success) {
      log.info('SYNCRO_CLIENT', 'SyncRo resumeWithFullSync message sent');
    } else {
      log.warn('SYNCRO_CLIENT', 'SyncRo resumeWithFullSync failed - not connected');
    }
    return success;
  }

  disconnect() {
    if (this.ws) {
      log.info('SYNCRO_CLIENT', 'Disconnecting from SyncRo...');
      this.ws.close();
      this.ws = null;
      this.connected = false;
      log.info('SYNCRO_CLIENT', 'Disconnected from SyncRo');
    } else {
      log.info('SYNCRO_CLIENT', 'Already disconnected');
    }
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = { SyncRoClient };
