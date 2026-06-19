const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Manages per-session source directories via Windows junctions.
 * Each session gets its own copy of src/ so Rojo serves isolated files.
 */
class SessionManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.sessionsDir = path.join(projectPath, '.sessions');
    this.baseDir = path.join(this.sessionsDir, 'base');
    this.srcPath = path.join(projectPath, 'src');
    this.activeSessionId = null;
    this._switching = false;
  }

  /** Set up the sessions directory and base snapshot on first run. */
  init() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    if (!fs.existsSync(this.baseDir)) {
      if (fs.existsSync(this.srcPath) && !this._isJunction(this.srcPath)) {
        const baseSrc = path.join(this.baseDir, 'src');
        fs.mkdirSync(this.baseDir, { recursive: true });
        fs.cpSync(this.srcPath, baseSrc, { recursive: true });
        this._removeSrc();
        this._createJunction(this.srcPath, baseSrc);
      }
    }

    this._recoverBrokenJunction();
  }

  /** Create a new session directory by copying the base snapshot. */
  createSessionDir(sessionId) {
    const sanitized = this._sanitizeId(sessionId);
    const sessionDir = path.join(this.sessionsDir, sanitized);
    if (fs.existsSync(sessionDir)) return sessionDir;

    const baseSrc = path.join(this.baseDir, 'src');
    if (!fs.existsSync(baseSrc)) {
      fs.mkdirSync(baseSrc, { recursive: true });
    }

    fs.cpSync(this.baseDir, sessionDir, { recursive: true });
    return sessionDir;
  }

  /** Point the project's src/ junction to a session's directory. */
  switchToSession(sessionId) {
    if (this._switching) throw new Error('Switch in progress');
    this._switching = true;

    try {
      const sanitized = this._sanitizeId(sessionId);
      const sessionDir = path.join(this.sessionsDir, sanitized);
      if (!fs.existsSync(sessionDir)) {
        this.createSessionDir(sessionId);
      }

      const srcTarget = path.join(sessionDir, 'src');
      if (!fs.existsSync(srcTarget)) {
        fs.mkdirSync(srcTarget, { recursive: true });
      }

      this._removeJunction(this.srcPath);
      this._createJunction(this.srcPath, srcTarget);
      this.activeSessionId = sessionId;
    } finally {
      this._switching = false;
    }
  }

  /** Remove a session's directory. Switches to base if it was active. */
  deleteSessionDir(sessionId) {
    const sanitized = this._sanitizeId(sessionId);
    const sessionDir = path.join(this.sessionsDir, sanitized);

    if (this.activeSessionId === sessionId) {
      this.switchToBase();
    }

    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  /** Revert src/ junction back to the base snapshot. */
  switchToBase() {
    if (this._switching) return;
    this._switching = true;

    try {
      this._removeJunction(this.srcPath);

      const baseSrc = path.join(this.baseDir, 'src');
      if (fs.existsSync(baseSrc)) {
        this._createJunction(this.srcPath, baseSrc);
      }

      this.activeSessionId = null;
    } finally {
      this._switching = false;
    }
  }

  getActiveSession() {
    return this.activeSessionId;
  }

  sessionExists(sessionId) {
    const sanitized = this._sanitizeId(sessionId);
    const sessionDir = path.join(this.sessionsDir, sanitized);
    return fs.existsSync(sessionDir);
  }

  cleanup() {
    this.switchToBase();
  }

  /** Sanitize session ID for use as a directory name. */
  _sanitizeId(id) {
    if (!id || typeof id !== 'string') return 'unknown';
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /** Check if a path is a directory junction or symlink. */
  _isJunction(filePath) {
    try {
      const stat = fs.lstatSync(filePath);
      return stat.isSymbolicLink();
    } catch {
      return false;
    }
  }

  /** If the src/ junction points to a missing target, recreate it. */
  _recoverBrokenJunction() {
    if (!this._isJunction(this.srcPath)) return;

    try {
      fs.accessSync(this.srcPath);
    } catch {
      this._removeJunction(this.srcPath);
      const baseSrc = path.join(this.baseDir, 'src');
      if (fs.existsSync(baseSrc)) {
        this._createJunction(this.srcPath, baseSrc);
      }
    }
  }

  /** Remove src/ — handles both junctions and real directories. */
  _removeSrc() {
    if (this._isJunction(this.srcPath)) {
      this._removeJunction(this.srcPath);
      return;
    }
    try {
      fs.rmSync(this.srcPath, { recursive: true, force: true });
    } catch {
      try {
        if (process.platform === 'win32') {
          execSync(`cmd /c rmdir /s /q "${this.srcPath}"`, { stdio: 'pipe' });
        } else {
          fs.rmSync(this.srcPath, { recursive: true, force: true });
        }
      } catch {
        throw new Error(`Cannot remove ${this.srcPath}. Close any programs using it and restart.`);
      }
    }
  }

  /** Create a directory junction (Windows) or symlink (macOS/Linux). */
  _createJunction(linkPath, targetPath) {
    try {
      if (process.platform === 'win32') {
        execSync(`cmd /c mklink /J "${linkPath}" "${targetPath}"`, { stdio: 'pipe' });
      } else {
        fs.symlinkSync(targetPath, linkPath, 'dir');
      }
    } catch (err) {
      throw new Error(`Failed to create junction/symlink: ${err.message}`);
    }
  }

  /** Remove a junction/symlink if it exists. */
  _removeJunction(linkPath) {
    try {
      if (this._isJunction(linkPath)) {
        if (process.platform === 'win32') {
          execSync(`cmd /c rmdir "${linkPath}"`, { stdio: 'pipe' });
        } else {
          fs.unlinkSync(linkPath);
        }
      }
    } catch (err) {
      // Already removed
    }
  }
}

module.exports = { SessionManager };
