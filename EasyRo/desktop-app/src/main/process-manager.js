const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const log = require('./logger');

/** Execute a shell command asynchronously with timeout. */
function execAsync(command, timeout = 5000) {
  return new Promise((resolve) => {
    exec(command, { encoding: 'utf-8', timeout }, (error, stdout) => {
      if (error) {
        resolve('');
      } else {
        resolve((stdout || '').trim());
      }
    });
  });
}

/** Spawn the OpenCode serve process and resolve when it's ready. */
async function startOpencode(instance) {
  const { project, ports } = instance;
  const spawnStart = Date.now();
  
  // Find and validate OpenCode executable
  let opencodePath = findOpencodeExecutable(project.path);
  log.info('OPENCODE', `Found OpenCode at: ${opencodePath}`);
  
  // Check version if it's a local file (not just 'opencode' from PATH)
  if (opencodePath !== 'opencode' && fs.existsSync(opencodePath)) {
    const versionValid = await checkOpencodeVersion(opencodePath);
    if (!versionValid) {
      log.warn('OPENCODE', 'OpenCode version is below minimum, downloading v1.17.18...');
      try {
        opencodePath = await downloadOpencodeBinary(project.path);
      } catch (error) {
        log.error('OPENCODE', `Failed to download OpenCode: ${error.message}`);
        // Fall back to existing binary anyway
      }
    }
  } else if (opencodePath === 'opencode') {
    // Check PATH version
    const versionValid = await checkOpencodeVersion('opencode');
    if (!versionValid) {
      log.warn('OPENCODE', 'PATH OpenCode version is below minimum or not found, downloading v1.17.18...');
      try {
        opencodePath = await downloadOpencodeBinary(project.path);
      } catch (error) {
        log.error('OPENCODE', `Failed to download OpenCode: ${error.message}`);
        // Fall back to PATH anyway
      }
    }
  } else {
    // No OpenCode found, download it
    log.warn('OPENCODE', 'OpenCode not found, downloading v1.17.18...');
    try {
      opencodePath = await downloadOpencodeBinary(project.path);
    } catch (error) {
      log.error('OPENCODE', `Failed to download OpenCode: ${error.message}`);
      throw new Error('OpenCode not found and download failed');
    }
  }
  
  log.info('OPENCODE', `Spawning OpenCode: serve --port ${ports.opencode} (cwd: ${project.path})`);

  return new Promise((resolve, reject) => {
    const args = ['serve', '--port', ports.opencode.toString(), '--hostname', '127.0.0.1'];
    const child = spawn(opencodePath, args, {
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
        log.error('OPENCODE', `OpenCode start TIMEOUT after 20s, killing process`);
        reject(new Error('OpenCode start timeout'));
      }
    }, 20000);

    // Progress log every 5s if OpenCode hasn't started
    const progressLog = setInterval(() => {
      if (started) { clearInterval(progressLog); return; }
      log.info('OPENCODE', `Still waiting for OpenCode... (${((Date.now() - spawnStart) / 1000).toFixed(0)}s)`);
    }, 5000);

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const clean = stdoutBuffer.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      log.info('OPENCODE', 'stdout:', clean.trim());
      if (clean.includes('server listening') || clean.includes('ready') || clean.includes('listening')) {
        if (!started) {
          started = true;
          clearInterval(progressLog);
          clearTimeout(timeout);
          log.info('OPENCODE', `OpenCode ready in ${Date.now() - spawnStart}ms`);
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
          clearInterval(progressLog);
          clearTimeout(timeout);
          reject(new Error(`OpenCode error: ${stderrBuffer}`));
        }
      }
    });

    child.on('error', (error) => {
      if (!started) {
        started = true;
        clearInterval(progressLog);
        clearTimeout(timeout);
        reject(error);
      }
    });

    child.on('exit', (code) => {
      log.info('OPENCODE', 'Exited with code', code);
      if (!started) {
        started = true;
        clearInterval(progressLog);
        clearTimeout(timeout);
        reject(new Error(`OpenCode exited with code ${code}`));
      }
    });
  });
}

/** Find syncro.exe in the project dir, packaged resources, parent dir, or fall back to PATH. */
function findSyncRoExecutable(projectPath) {
  // 1) Bundled alongside the project (dev or user-data copy)
  const localSyncro = path.join(projectPath, 'syncro.exe');
  if (fs.existsSync(localSyncro)) return localSyncro;

  // 2) Packaged as an extraResource (NSIS / portable → resources/syncro.exe)
  if (process.resourcesPath) {
    const resourcesSyncro = path.join(process.resourcesPath, 'syncro.exe');
    if (fs.existsSync(resourcesSyncro)) return resourcesSyncro;
  }

  // 3) Parent directory (portable exe sitting next to the project folder)
  const parentSyncro = path.join(path.dirname(projectPath), 'syncro.exe');
  if (fs.existsSync(parentSyncro)) return parentSyncro;

  // 4) System PATH
  return 'syncro';
}

/** Find opencode.exe in the project dir, packaged resources, parent dir, or fall back to PATH. */
function findOpencodeExecutable(projectPath) {
  // 1) Bundled alongside the project (dev or user-data copy)
  const localOpencode = path.join(projectPath, 'opencode.exe');
  if (fs.existsSync(localOpencode)) return localOpencode;

  // 2) Packaged as an extraResource (NSIS / portable → resources/opencode.exe)
  if (process.resourcesPath) {
    const resourcesOpencode = path.join(process.resourcesPath, 'opencode.exe');
    if (fs.existsSync(resourcesOpencode)) return resourcesOpencode;
  }

  // 3) Parent directory (portable exe sitting next to the project folder)
  const parentOpencode = path.join(path.dirname(projectPath), 'opencode.exe');
  if (fs.existsSync(parentOpencode)) return parentOpencode;

  // 4) System PATH (return 'opencode' to check PATH)
  return 'opencode';
}

/** Check if opencode version is >= 1.17.18 */
async function checkOpencodeVersion(opencodePath) {
  try {
    const result = await execAsync(`"${opencodePath}" -v`, 5000);
    const versionMatch = result.match(/v?(\d+\.\d+\.\d+)/);
    if (!versionMatch) {
      log.warn('OPENCODE', `Could not parse version from: ${result}`);
      return false;
    }
    const version = versionMatch[1];
    log.info('OPENCODE', `Found OpenCode version: ${version}`);
    
    // Parse version and check if >= 1.17.18
    const [major, minor, patch] = version.split('.').map(Number);
    const minMajor = 1, minMinor = 17, minPatch = 18;
    
    if (major > minMajor) return true;
    if (major === minMajor && minor > minMinor) return true;
    if (major === minMajor && minor === minMinor && patch >= minPatch) return true;
    
    log.warn('OPENCODE', `OpenCode version ${version} is below minimum 1.17.18`);
    return false;
  } catch (error) {
    log.warn('OPENCODE', `Failed to check OpenCode version: ${error.message}`);
    return false;
  }
}

/** Download OpenCode binary from GitHub releases (v1.17.18) */
async function downloadOpencodeBinary(projectPath) {
  const downloadUrl = 'https://github.com/anomalyco/opencode/releases/download/v1.17.18/opencode-windows-x64.exe';
  const targetPath = path.join(projectPath, 'opencode.exe');
  
  log.info('OPENCODE', `Downloading OpenCode v1.17.18 from ${downloadUrl}`);
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    
    https.get(downloadUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = Math.round((downloadedSize / totalSize) * 100);
        if (progress % 10 === 0) {
          log.info('OPENCODE', `Download progress: ${progress}%`);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        log.info('OPENCODE', `OpenCode downloaded to ${targetPath}`);
        resolve(targetPath);
      });
      
      file.on('error', (error) => {
        fs.unlink(targetPath, () => {});
        reject(error);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/** Spawn the SyncRo process and resolve when it starts listening. */
async function startSyncRo(instance) {
  const { project, ports } = instance;
  const syncroPath = findSyncRoExecutable(project.path);
  const spawnStart = Date.now();
  log.info('SYNCRO', `Spawning SyncRo: ${syncroPath} start --port ${ports.syncro} --path ${project.path}`);

  return new Promise((resolve, reject) => {
    const args = ['start', '--port', ports.syncro.toString(), '--path', project.path];
    const child = spawn(syncroPath, args, {
      cwd: project.path,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });

    instance.syncroProcess = child;

    let started = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';
    const timeout = setTimeout(() => {
      if (!started) {
        child.kill();
        log.error('SYNCRO', `SyncRo start TIMEOUT after 30s, killing process`);
        reject(new Error('SyncRo start timeout'));
      }
    }, 30000);

    // Progress log every 5s if SyncRo hasn't started
    const progressLog = setInterval(() => {
      if (started) { clearInterval(progressLog); return; }
      log.info('SYNCRO', `Still waiting for SyncRo... (${((Date.now() - spawnStart) / 1000).toFixed(0)}s)`);
    }, 5000);

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const clean = stdoutBuffer.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      log.info('SYNCRO', 'stdout:', clean.trim());
      if (clean.includes('started') || clean.includes('watching') || clean.includes('listening')) {
        if (!started) {
          started = true;
          clearInterval(progressLog);
          clearTimeout(timeout);
          log.info('SYNCRO', `SyncRo ready in ${Date.now() - spawnStart}ms`);
          resolve();
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      const clean = stderrBuffer.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase();
      log.warn('SYNCRO', 'stderr:', clean.trim());
      if ((clean.includes('error') && !clean.includes('no error')) || clean.includes('fatal') || clean.includes('failed')) {
        if (!started) {
          started = true;
          clearInterval(progressLog);
          clearTimeout(timeout);
          reject(new Error(`SyncRo error: ${stderrBuffer}`));
        }
      }
    });

    child.on('error', (error) => {
      if (!started) {
        started = true;
        clearInterval(progressLog);
        clearTimeout(timeout);
        reject(error);
      }
    });

    child.on('exit', (code) => {
      log.info('SYNCRO', 'Exited with code', code);
      if (!started) {
        started = true;
        clearInterval(progressLog);
        clearTimeout(timeout);
        reject(new Error(`SyncRo exited with code ${code}`));
      }
    });
  });
}

/** Kill any process already listening on the given ports. */
async function killProcessesOnPorts(syncroPort, opencodePort) {
  for (const port of [syncroPort, opencodePort]) {
    try {
      if (process.platform === 'win32') {
        const result = await execAsync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`, 5000);
        if (result) {
          const pids = result.split(/\s+/).filter(p => p.trim());
          for (const pid of pids) {
            const pidNum = parseInt(pid);
            if (pidNum && pidNum > 0 && pidNum !== 0) {
              try { await execAsync(`taskkill /PID ${pidNum} /F`, 3000); } catch {}
            }
          }
        }
      } else {
        const result = await execAsync(`lsof -ti :${port}`, 5000);
        if (result) {
          const pids = result.split('\n').filter(p => p.trim());
          for (const pid of pids) {
            try { await execAsync(`kill -9 ${pid.trim()}`, 3000); } catch {}
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

/** Kill a process AND its entire child tree.
 *  Windows: `taskkill /F /T` kills the cmd.exe wrapper AND the Bun/OpenCode
 *  grandchild (spawned via shell:true) that a plain child.kill() would orphan.
 *  POSIX: SIGTERM to the process group + pid. */
async function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /F /T /PID ${pid}`, 5000);
    } else {
      try { process.kill(-pid, 'SIGTERM'); } catch {}
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  } catch {}
}

module.exports = { startOpencode, startSyncRo, findSyncRoExecutable, findOpencodeExecutable, checkOpencodeVersion, downloadOpencodeBinary, killProcessesOnPorts, killProcessTree, sleep };
