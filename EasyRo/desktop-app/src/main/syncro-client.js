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

      this.ws.on('close', () => {
        log.warn('SYNCRO_CLIENT', 'Connection closed');
        this.connected = false;
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          log.info('SYNCRO_CLIENT', 'Received message:', message.type);
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
      log.warn('SYNCRO_CLIENT', 'Cannot send message: not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      log.info('SYNCRO_CLIENT', 'Sent message:', message.type);
      return true;
    } catch (error) {
      log.error('SYNCRO_CLIENT', 'Failed to send message:', error.message);
      return false;
    }
  }

  async pause() {
    const success = this.send({ type: 'pause' });
    if (success) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return success;
  }

  resume() {
    return this.send({ type: 'resume' });
  }

  resumeWithFullSync() {
    return this.send({ type: 'resumeWithFullSync' });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      log.info('SYNCRO_CLIENT', 'Disconnected');
    }
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = { SyncRoClient };
