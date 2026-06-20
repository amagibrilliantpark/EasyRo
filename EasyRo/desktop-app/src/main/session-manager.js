const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.sessionsDir = path.join(projectPath, '.sessions');
    this.srcDir = path.join(projectPath, 'src');
    this.activeFile = path.join(this.sessionsDir, '.active');
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

    if (fs.existsSync(this.srcDir)) {
      fs.cpSync(this.srcDir, snapshotDir, { recursive: true });
    }

    this.setActiveSession(sessionId);
  }

  restoreFrom(sessionId) {
    if (!sessionId) return;
    const snapshotDir = path.join(this.sessionsDir, sessionId);

    if (fs.existsSync(this.srcDir)) {
      fs.rmSync(this.srcDir, { recursive: true, force: true });
    }

    if (fs.existsSync(snapshotDir)) {
      fs.cpSync(snapshotDir, this.srcDir, { recursive: true });
    } else {
      fs.mkdirSync(path.join(this.srcDir, 'server'), { recursive: true });
      fs.mkdirSync(path.join(this.srcDir, 'client'), { recursive: true });
      fs.mkdirSync(path.join(this.srcDir, 'shared'), { recursive: true });
    }

    this.setActiveSession(sessionId);
  }

  deleteSnapshot(sessionId) {
    const snapshotDir = path.join(this.sessionsDir, sessionId);
    if (fs.existsSync(snapshotDir)) {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
  }

  hasSnapshot(sessionId) {
    const snapshotDir = path.join(this.sessionsDir, sessionId);
    return fs.existsSync(snapshotDir);
  }
}

module.exports = { SessionManager };
