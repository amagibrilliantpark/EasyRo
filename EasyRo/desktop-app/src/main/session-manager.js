const fs = require('fs');
const path = require('path');
const log = require('./logger');

class SessionManager {
  constructor(projectPath, syncroClient = null) {
    this.projectPath = projectPath;
    this.sessionsDir = path.join(projectPath, '.sessions');
    this.srcDir = path.join(projectPath, 'src');
    this.activeFile = path.join(this.sessionsDir, '.active');
    this.syncroClient = syncroClient;
    // Config files to include in session snapshots (besides src/)
    this.configFiles = ['default.project.json', 'opencode.json', 'AGENTS.md'];
  }

  init() {
    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  getActiveSession() {
    try {
      return fs.readFileSync(this.activeFile, 'utf-8').trim();
    } catch {
      return null;
    }
  }

  setActiveSession(sessionId) {
    fs.writeFileSync(this.activeFile, sessionId, 'utf-8');
  }

  saveCurrentTo(sessionId) {
    if (!sessionId) return;
    const snapshotDir = path.join(this.sessionsDir, sessionId);

    if (fs.existsSync(snapshotDir)) {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }

    fs.mkdirSync(snapshotDir, { recursive: true });

    // Snapshot src/ directory
    if (fs.existsSync(this.srcDir)) {
      fs.cpSync(this.srcDir, path.join(snapshotDir, 'src'), { recursive: true });
      log.info('SESSION', 'Saved src/ for', sessionId);
    } else {
      log.warn('SESSION', 'src dir missing, skipping src save for', sessionId);
    }

    // Snapshot config files
    for (const file of this.configFiles) {
      const src = path.join(this.projectPath, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(snapshotDir, file));
        log.info('SESSION', 'Saved config', file, 'for', sessionId);
      }
    }

    this.setActiveSession(sessionId);
    log.info('SESSION', 'Saved snapshot for', sessionId);
  }

  async restoreFrom(sessionId) {
    if (!sessionId) return;
    const snapshotDir = path.join(this.sessionsDir, sessionId);

    // Pause SyncRo before file operations to prevent conflicts
    if (this.syncroClient && this.syncroClient.isConnected()) {
      log.info('SESSION', 'Pausing SyncRo before session restore');
      await this.syncroClient.pause();
    }

    // Restore src/ directory
    if (fs.existsSync(this.srcDir)) {
      fs.rmSync(this.srcDir, { recursive: true, force: true });
    }

    if (fs.existsSync(snapshotDir)) {
      // Restore src/ from snapshot
      const snapshotSrc = path.join(snapshotDir, 'src');
      if (fs.existsSync(snapshotSrc)) {
        fs.cpSync(snapshotSrc, this.srcDir, { recursive: true });
      } else {
        // Legacy snapshot: entire snapshot IS the src (backward compat)
        fs.cpSync(snapshotDir, this.srcDir, {
          recursive: true,
          filter: (src) => !this.configFiles.some(f => src.endsWith(f))
        });
      }

      // Restore config files
      for (const file of this.configFiles) {
        const snapshotFile = path.join(snapshotDir, file);
        if (fs.existsSync(snapshotFile)) {
          fs.copyFileSync(snapshotFile, path.join(this.projectPath, file));
          log.info('SESSION', 'Restored config', file, 'for', sessionId);
        }
      }

      log.info('SESSION', 'Restored from', sessionId);
    } else {
      fs.mkdirSync(path.join(this.srcDir, 'server'), { recursive: true });
      fs.mkdirSync(path.join(this.srcDir, 'client'), { recursive: true });
      fs.mkdirSync(path.join(this.srcDir, 'shared'), { recursive: true });
      log.warn('SESSION', 'No snapshot found for', sessionId, '- created empty dirs');
    }

    this.setActiveSession(sessionId);

    // Resume SyncRo with full sync after file operations
    if (this.syncroClient && this.syncroClient.isConnected()) {
      log.info('SESSION', 'Resuming SyncRo with full sync after session restore');
      this.syncroClient.resumeWithFullSync();
    }
  }

  deleteSnapshot(sessionId) {
    const snapshotDir = path.join(this.sessionsDir, sessionId);
    if (fs.existsSync(snapshotDir)) {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
      log.info('SESSION', 'Deleted snapshot', sessionId);
    }
  }

  hasSnapshot(sessionId) {
    const snapshotDir = path.join(this.sessionsDir, sessionId);
    return fs.existsSync(snapshotDir);
  }
}

module.exports = { SessionManager };
