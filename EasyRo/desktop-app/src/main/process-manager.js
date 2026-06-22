const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('./logger');

/** Spawn the Rojo process and resolve when it starts listening. */
async function startRojo(instance) {
  const { project, ports } = instance;
  const rojoPath = findRojoExecutable(project.path);

  return new Promise((resolve, reject) => {
    const args = ['serve', '--port', ports.rojo.toString()];
    const child = spawn(rojoPath, args, {
      cwd: project.path,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });

    instance.rojoProcess = child;

    let started = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const timeout = setTimeout(() => {
      if (!started) {
        child.kill();
        reject(new Error('Rojo start timeout'));
      }
    }, 30000);

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const clean = stdoutBuffer.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      log.info('ROJO', 'stdout:', clean.trim());
      if (clean.includes('listening') || clean.includes('server started')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          resolve();
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      const clean = stderrBuffer.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      log.warn('ROJO', 'stderr:', clean.trim());
      if ((clean.includes('error') && !clean.includes('no error')) || clean.includes('fatal') || clean.includes('failed')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          reject(new Error(`Rojo error: ${stderrBuffer}`));
        }
      }
    });

    child.on('error', (error) => {
      if (!started) {
        started = true;
        clearTimeout(timeout);
        reject(error);
      }
    });

    child.on('exit', (code) => {
      log.info('ROJO', 'Exited with code', code);
      if (!started) {
        started = true;
        clearTimeout(timeout);
        reject(new Error(`Rojo exited with code ${code}`));
      }
    });
  });
}

/** Spawn the OpenCode serve process and resolve when it's ready. */
async function startOpencode(instance) {
  const { project, ports } = instance;

  return new Promise((resolve, reject) => {
    const args = ['serve', '--port', ports.opencode.toString(), '--hostname', '127.0.0.1'];
    const child = spawn('opencode', args, {
      cwd: project.path,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        OPENCODE_CONFIG: path.join(project.path, 'opencode.json')
      }
    });

    instance.opencodeProcess = child;

    let started = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const timeout = setTimeout(() => {
      if (!started) {
        child.kill();
        reject(new Error('OpenCode start timeout'));
      }
    }, 20000);

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const clean = stdoutBuffer.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      log.info('OPENCODE', 'stdout:', clean.trim());
      if (clean.includes('server listening') || clean.includes('ready') || clean.includes('listening')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          resolve();
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      const clean = stderrBuffer.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      log.warn('OPENCODE', 'stderr:', clean.trim());
      if ((clean.includes('error') && !clean.includes('no error')) || clean.includes('fatal') || clean.includes('failed')) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          reject(new Error(`OpenCode error: ${stderrBuffer}`));
        }
      }
    });

    child.on('error', (error) => {
      if (!started) {
        started = true;
        clearTimeout(timeout);
        reject(error);
      }
    });

    child.on('exit', (code) => {
      log.info('OPENCODE', 'Exited with code', code);
      if (!started) {
        started = true;
        clearTimeout(timeout);
        reject(new Error(`OpenCode exited with code ${code}`));
      }
    });
  });
}

/** Find rojo.exe in the project dir, packaged resources, parent dir, or fall back to PATH. */
function findRojoExecutable(projectPath) {
  // 1) Bundled alongside the project (dev or user-data copy)
  const localRojo = path.join(projectPath, 'rojo.exe');
  if (fs.existsSync(localRojo)) return localRojo;

  // 2) Packaged as an extraResource (NSIS / portable → resources/rojo.exe)
  if (process.resourcesPath) {
    const resourcesRojo = path.join(process.resourcesPath, 'rojo.exe');
    if (fs.existsSync(resourcesRojo)) return resourcesRojo;
  }

  // 3) Parent directory (portable exe sitting next to the project folder)
  const parentRojo = path.join(path.dirname(projectPath), 'rojo.exe');
  if (fs.existsSync(parentRojo)) return parentRojo;

  // 4) System PATH
  return 'rojo';
}

/** Kill any process already listening on the given ports. */
async function killProcessesOnPorts(rojoPort, opencodePort) {
  for (const port of [rojoPort, opencodePort]) {
    try {
      if (process.platform === 'win32') {
        // Use regex to match exact port (not :30000 when looking for :3000)
        const result = execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`, { encoding: 'utf-8', timeout: 5000 }).trim();
        if (result) {
          const pids = result.split(/\s+/).filter(p => p.trim());
          for (const pid of pids) {
            const pidNum = parseInt(pid);
            if (pidNum && pidNum > 0 && pidNum !== 0) {
              try { execSync(`taskkill /PID ${pidNum} /F`, { timeout: 3000 }); } catch {}
            }
          }
        }
      } else {
        const result = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', timeout: 5000 }).trim();
        if (result) {
          const pids = result.split('\n').filter(p => p.trim());
          for (const pid of pids) {
            try { execSync(`kill -9 ${pid.trim()}`, { timeout: 3000 }); } catch {}
          }
        }
      }
    } catch {}
  }
  await sleep(500);
}

/** Promise-based sleep. */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startRojo, startOpencode, findRojoExecutable, killProcessesOnPorts, sleep };
