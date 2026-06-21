const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Centralized file-based logger for EasyRo.
 *
 * - Writes structured logs to a .log file
 * - Keeps console output in dev mode (--dev flag)
 * - Rotates log file when it exceeds MAX_SIZE
 */
class Logger {
  constructor() {
    this.isDev = process.argv.includes('--dev');
    this.logDir = null;
    this.logFile = null;
    this.MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    this._initialized = false;
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

  /** Write a log entry to file (and console in dev mode). */
  _write(level, category, message, data) {
    this._init();
    const line = this._format(level, category, message, data);

    // Always write to file
    try {
      fs.appendFileSync(this.logFile, line, 'utf-8');
    } catch {
      // Silently ignore write errors to avoid cascading failures
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
}

// Singleton instance
const logger = new Logger();

module.exports = logger;
