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
    if (!sessionId) {
      log.warn('SESSION', 'saveCurrentTo called with empty sessionId');
      return;
    }
    const snapshotDir = path.join(this.sessionsDir, sessionId);
    log.info('SESSION', `Saving current state to session: ${sessionId}`);

    if (fs.existsSync(snapshotDir)) {
      log.info('SESSION', `Snapshot dir exists, removing: ${snapshotDir}`);
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }

    fs.mkdirSync(snapshotDir, { recursive: true });

    // Snapshot src/ directory
    if (fs.existsSync(this.srcDir)) {
      fs.cpSync(this.srcDir, path.join(snapshotDir, 'src'), { recursive: true });
      log.info('SESSION', `Saved src/ directory for ${sessionId}`);
    } else {
      log.warn('SESSION', 'src dir missing, skipping src save');
    }

    // Snapshot config files
    for (const file of this.configFiles) {
      const src = path.join(this.projectPath, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(snapshotDir, file));
        log.info('SESSION', `Saved config: ${file}`);
      }
    }

    this.setActiveSession(sessionId);
    log.info('SESSION', `Session save complete: ${sessionId}`);
  }

  async restoreFrom(sessionId) {
    if (!sessionId) {
      log.warn('SESSION', 'restoreFrom called with empty sessionId');
      return;
    }
    const snapshotDir = path.join(this.sessionsDir, sessionId);
    log.info('SESSION', `Starting session restore: ${sessionId}`);

    // Pause SyncRo before file operations to prevent conflicts
    if (this.syncroClient && this.syncroClient.isConnected()) {
      log.info('SESSION', 'Pausing SyncRo before file restore...');
      await this.syncroClient.pause();
      log.info('SESSION', 'SyncRo paused for restore');
    } else {
      log.info('SESSION', 'SyncRo not connected, skipping pause');
    }

    // Restore src/ directory
    if (fs.existsSync(this.srcDir)) {
      log.info('SESSION', 'Removing existing src/ directory...');
      fs.rmSync(this.srcDir, { recursive: true, force: true });
    }

    if (fs.existsSync(snapshotDir)) {
      log.info('SESSION', `Snapshot found at: ${snapshotDir}`);

      // Restore src/ from snapshot
      const snapshotSrc = path.join(snapshotDir, 'src');
      if (fs.existsSync(snapshotSrc)) {
        log.info('SESSION', 'Restoring src/ from snapshot...');
        fs.cpSync(snapshotSrc, this.srcDir, { recursive: true });
        log.info('SESSION', 'src/ restored successfully');
      } else {
        // Legacy snapshot: entire snapshot IS the src (backward compat)
        log.info('SESSION', 'Legacy snapshot format, restoring...');
        fs.cpSync(snapshotDir, this.srcDir, {
          recursive: true,
          filter: (src) => !this.configFiles.some(f => src.endsWith(f))
        });
        log.info('SESSION', 'Legacy restore complete');
      }

      // Restore config files
      for (const file of this.configFiles) {
        const snapshotFile = path.join(snapshotDir, file);
        if (fs.existsSync(snapshotFile)) {
          fs.copyFileSync(snapshotFile, path.join(this.projectPath, file));
          log.info('SESSION', `Restored config: ${file}`);
        }
      }

      log.info('SESSION', `Session restore complete: ${sessionId}`);
    } else {
      log.warn('SESSION', `No snapshot found for ${sessionId}, creating empty dirs`);
      fs.mkdirSync(path.join(this.srcDir, 'server'), { recursive: true });
      fs.mkdirSync(path.join(this.srcDir, 'client'), { recursive: true });
      fs.mkdirSync(path.join(this.srcDir, 'shared'), { recursive: true });
    }

    this.setActiveSession(sessionId);

    // Resume SyncRo with full sync after file operations
    if (this.syncroClient && this.syncroClient.isConnected()) {
      log.info('SESSION', 'Resuming SyncRo with full sync...');
      this.syncroClient.resumeWithFullSync();
      log.info('SESSION', 'SyncRo resumeWithFullSync sent');
    } else {
      log.info('SESSION', 'SyncRo not connected, skipping resume');
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
