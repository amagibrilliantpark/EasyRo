const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Centralized file-based logger for EasyRo.
 *
 * - Writes structured logs to a .log file
 * - Keeps console output in dev mode (--dev flag)
 * - Rotates log file when it exceeds MAX_SIZE
 * - Uses async buffering for better performance
 */
class Logger {
  constructor() {
    this.isDev = process.argv.includes('--dev');
    this.logDir = null;
    this.logFile = null;
    this.MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    this._initialized = false;
    this._buffer = [];
    this._flushInterval = 1000; // 1 second
    this._flushTimer = null;
    this._isFlushing = false;
  }

  /** Initialize log directory and file path. Called lazily on first write. */
  _init() {
    if (this._initialized) return;

    if (app.isPackaged) {
      this.logDir = path.join(app.getPath('userData'), 'logs');
    } else {
      // Dev mode: EasyRo/logs/ (two levels above desktop-app/)
      this.logDir = path.resolve(__dirname, '..', '..', '..', 'logs');
    }

    fs.mkdirSync(this.logDir, { recursive: true });
    this.logFile = path.join(this.logDir, 'easyro.log');
    this._initialized = true;

    // Rotate if file already exceeds max size
    this._rotateIfNeeded();

    // Start periodic flush
    this._startFlushTimer();
  }

  /** Start periodic flush timer. */
  _startFlushTimer() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => {
      this._flush();
    }, this._flushInterval);
  }

  /** Stop periodic flush timer. */
  _stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  /** Flush buffered logs to disk. */
  async _flush() {
    if (this._isFlushing || this._buffer.length === 0) return;
    
    this._isFlushing = true;
    const bufferToFlush = this._buffer;
    this._buffer = [];

    try {
      if (bufferToFlush.length > 0) {
        await fs.promises.appendFile(this.logFile, bufferToFlush.join(''), 'utf-8');
        this._rotateIfNeeded();
      }
    } catch (error) {
      // Silently ignore write errors to avoid cascading failures
    } finally {
      this._isFlushing = false;
    }
  }

  /** Rename current log to easyro-{date}.log and start fresh if > MAX_SIZE. */
  _rotateIfNeeded() {
    if (!this.logFile || !fs.existsSync(this.logFile)) return;
    const stats = fs.statSync(this.logFile);
    if (stats.size >= this.MAX_SIZE) {
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const rotated = path.join(this.logDir, `easyro-${date}.log`);
      try {
        fs.renameSync(this.logFile, rotated);
      } catch {
        // If rotation fails, continue with existing file
      }
    }
  }

  /** Format a log line: [timestamp] [LEVEL] [CATEGORY] message */
  _format(level, category, message, data) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let line = `[${ts}] [${level}] [${category}] ${message}`;
    if (data && data.length > 0) {
      const extra = data.map(d => {
        if (d instanceof Error) return d.stack || d.message;
        if (typeof d === 'object') {
          try { return JSON.stringify(d); } catch { return String(d); }
        }
        return String(d);
      }).join(' ');
      line += ' ' + extra;
    }
    return line + '\n';
  }

  /** Write a log entry to buffer (async flush to file). */
  _write(level, category, message, data) {
    this._init();
    const line = this._format(level, category, message, data);

    // Add to buffer for async write
    this._buffer.push(line);

    // Flush immediately if buffer is too large (> 100 lines)
    if (this._buffer.length >= 100) {
      this._flush();
    }

    // Console output in dev mode
    if (this.isDev) {
      const consoleLine = line.trim();
      if (level === 'ERROR') {
        console.error(consoleLine);
      } else if (level === 'WARN') {
        console.warn(consoleLine);
      } else {
        console.log(consoleLine);
      }
    }
  }

  /** Log an informational message. */
  info(category, message, ...data) {
    this._write('INFO', category, message, data);
  }

  /** Log a warning. */
  warn(category, message, ...data) {
    this._write('WARN', category, message, data);
  }

  /** Log an error. */
  error(category, message, ...data) {
    this._write('ERROR', category, message, data);
    // Flush immediately for errors
    this._flush();
  }

  /** Return the path to the current log file. */
  getLogPath() {
    this._init();
    return this.logFile;
  }

  /** Return the log directory path. */
  getLogDir() {
    this._init();
    return this.logDir;
  }

  /** Flush all pending logs and cleanup. */
  async shutdown() {
    this._stopFlushTimer();
    await this._flush();
  }
}

// Singleton instance
const logger = new Logger();

// Flush logs on process exit
process.on('exit', () => {
  logger.shutdown();
});

module.exports = logger;
