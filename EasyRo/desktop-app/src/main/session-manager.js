const fs = require('fs');
const path = require('path');
const log = require('./logger');

class SessionManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.sessionsDir = path.join(projectPath, '.sessions');
    this.srcDir = path.join(projectPath, 'src');
    this.activeFile = path.join(this.sessionsDir, '.active');
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

  _syncDirs(srcDir, destDir, isRootDir = false) {
    // Ensure destination directory exists
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Get entries in destination
    let destEntries = [];
    try {
      destEntries = fs.readdirSync(destDir);
    } catch (err) {
      log.error('SESSION', `Failed to read dest dir: ${destDir}`, err);
    }

    // Get entries in source (if it exists)
    let srcEntries = [];
    if (srcDir && fs.existsSync(srcDir)) {
      try {
        srcEntries = fs.readdirSync(srcDir);
      } catch (err) {
        log.error('SESSION', `Failed to read src dir: ${srcDir}`, err);
      }
    }

    // Protect standard top-level directories from deletion
    const protectedDirs = isRootDir ? ['server', 'client', 'shared'] : [];

    // 1. Delete extra files/folders in destination that are not in source
    for (const entry of destEntries) {
      const destPath = path.join(destDir, entry);
      const srcPath = srcDir ? path.join(srcDir, entry) : null;

      // Skip protected directories from deletion itself
      if (protectedDirs.includes(entry)) {
        continue;
      }

      const existsInSrc = srcPath && fs.existsSync(srcPath);

      if (!existsInSrc) {
        try {
          const stats = fs.statSync(destPath);
          if (stats.isDirectory()) {
            fs.rmSync(destPath, { recursive: true, force: true });
            log.info('SESSION', `Deleted extra directory: ${destPath}`);
          } else {
            fs.unlinkSync(destPath);
            log.info('SESSION', `Deleted extra file: ${destPath}`);
          }
        } catch (err) {
          log.error('SESSION', `Failed to delete: ${destPath}`, err.message);
        }
      }
    }

    // 2. Explicitly recurse into protected root directories to clean/sync their contents
    if (isRootDir) {
      for (const entry of protectedDirs) {
        const srcSub = srcDir ? path.join(srcDir, entry) : null;
        const destSub = path.join(destDir, entry);
        this._syncDirs(srcSub, destSub, false);
      }
    }

    // 3. Copy/update files from source to destination
    for (const entry of srcEntries) {
      // Skip protected directories in the main copy loop since we handled them above
      if (isRootDir && protectedDirs.includes(entry)) {
        continue;
      }

      const srcPath = path.join(srcDir, entry);
      const destPath = path.join(destDir, entry);

      try {
        const srcStats = fs.statSync(srcPath);

        if (srcStats.isDirectory()) {
          // Recursively sync directories
          this._syncDirs(srcPath, destPath, false);
        } else {
          let shouldCopy = false;

          if (!fs.existsSync(destPath)) {
            shouldCopy = true;
          } else {
            const destStats = fs.statSync(destPath);
            if (destStats.isDirectory()) {
              // Target is a directory, but source is a file - delete target directory first
              fs.rmSync(destPath, { recursive: true, force: true });
              shouldCopy = true;
            } else if (srcStats.size !== destStats.size) {
              shouldCopy = true;
            } else {
              // Compare content if size is identical
              const srcBuf = fs.readFileSync(srcPath);
              const destBuf = fs.readFileSync(destPath);
              if (!srcBuf.equals(destBuf)) {
                shouldCopy = true;
              }
            }
          }

          if (shouldCopy) {
            fs.copyFileSync(srcPath, destPath);
            log.info('SESSION', `Synced file: ${destPath}`);
          }
        }
      } catch (err) {
        log.error('SESSION', `Failed to sync: ${srcPath} -> ${destPath}`, err.message);
      }
    }
  }

  restoreFrom(sessionId) {
    const snapshotDir = sessionId ? path.join(this.sessionsDir, sessionId) : null;
    const snapshotSrc = snapshotDir ? path.join(snapshotDir, 'src') : null;

    log.info('SESSION', `Restoring session: ${sessionId || 'CLEAR_WORKSPACE'}`);

    // Sync src/ using the recursive diff sync
    this._syncDirs(snapshotSrc, this.srcDir, true);

    // Guarantee that standard folders always exist (even if they were empty or not in the snapshot)
    for (const sub of ['server', 'client', 'shared']) {
      const dir = path.join(this.srcDir, sub);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    if (snapshotDir && fs.existsSync(snapshotDir)) {
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
      log.info('SESSION', 'Clean workspace prepared');
    }

    if (sessionId) {
      this.setActiveSession(sessionId);
    } else {
      // Clear active session
      try {
        if (fs.existsSync(this.activeFile)) {
          fs.unlinkSync(this.activeFile);
        }
      } catch (e) {
        log.error('SESSION', 'Failed to delete active session file', e);
      }
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
