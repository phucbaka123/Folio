const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

let win;

app.setAppUserModelId('com.folio.files');   // groups the taskbar icon and shows the right name in notifications

// A folder passed on the command line ("Folio.exe C:\some\folder") opens there.
const pathFromArgs = (argv) => argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-') && fs.existsSync(a)) || null;
let startPath = pathFromArgs(process.argv);

// Only one window: launching again brings the existing one forward (and opens the folder, if one was given).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const p = pathFromArgs(argv);
    if (p) win.webContents.send('app:openPath', p);
  });
}

// Window size and position are remembered between runs.
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; }
}
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ ...(win.isMaximized() || win.isMinimized() ? loadWindowState() : win.getBounds()), maximized: win.isMaximized() }));
  } catch { /* not worth failing a close over */ }
}

function createWindow() {
  const saved = loadWindowState();
  win = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 920,
    x: saved.x,
    y: saved.y,
    minWidth: 760,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: '#141416',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (saved.maximized) win.maximize(); win.show(); });
  win.on('maximize', () => win.webContents.send('win:maximized', true));
  win.on('unmaximize', () => win.webContents.send('win:maximized', false));
  win.on('close', saveWindowState);

  // A file dropped outside a drop target must not navigate the window to that file, and nothing opens extra windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(() => {
  if (!gotLock) return;
  if (app.isPackaged) Menu.setApplicationMenu(null);   // no Ctrl+R / DevTools shortcuts in the shipped app
  createWindow();
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('app:startPath', () => startPath);
ipcMain.handle('app:version', () => app.getVersion());

// ---- window controls ----
ipcMain.on('win:minimize', () => win.minimize());
ipcMain.on('win:toggleMaximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win:close', () => win.close());
ipcMain.handle('win:isMaximized', () => win.isMaximized());

// ---- places ----
function known(name) {
  try { return app.getPath(name); } catch { return null; }
}

// A disconnected network drive or an empty card reader can stall filesystem calls for many seconds,
// so drive probing runs in parallel and gives up quickly instead of holding up startup.
const withTimeout = (promise, ms, fallback) => Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]);

ipcMain.handle('fs:places', async () => {
  const home = os.homedir();
  let drives = [];
  if (process.platform === 'win32') {
    const roots = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i) + ':\\');
    const present = await Promise.all(roots.map((root) => withTimeout(fsp.access(root).then(() => true, () => false), 1500, false)));
    drives = roots.filter((_, i) => present[i]);
  } else {
    drives.push('/');
  }
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer || null;
  const labels = {};
  if (process.platform === 'win32') {
    await Promise.all(drives.map((root) => withTimeout(new Promise((resolve) => {
      // "vol C:" prints "Volume in drive C is OS"; unlabelled drives print "has no label".
      execFile('cmd.exe', ['/c', 'vol', root.slice(0, 2)], { windowsHide: true, timeout: 2500 }, (err, out) => {
        const m = !err && String(out).match(/ is (.+?)\s*$/m);
        if (m) labels[root] = m[1];
        resolve();
      });
    }), 3000)));
  }
  return {
    labels,
    home,
    desktop: known('desktop'),
    downloads: known('downloads'),
    documents: known('documents'),
    pictures: known('pictures'),
    music: known('music'),
    videos: known('videos'),
    oneDrive: oneDrive && fs.existsSync(oneDrive) ? oneDrive : null,
    drives,
  };
});

ipcMain.handle('fs:driveInfo', async (_e, root) => {
  try {
    const s = await fsp.statfs(root);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
});

// ---- directory listing ----
ipcMain.handle('fs:list', async (_e, dir) => {
  try {
    const names = await fsp.readdir(dir, { withFileTypes: true });
    const items = await Promise.all(
      names.map(async (d) => {
        const full = path.join(dir, d.name);
        let size = 0, mtime = 0, isDir = d.isDirectory();
        try {
          const st = await fsp.stat(full);
          size = st.size; mtime = st.mtimeMs; isDir = st.isDirectory();
        } catch { /* broken link or access denied: keep defaults */ }
        return { name: d.name, path: full, isDir, size, mtime };
      })
    );
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err.code === 'EPERM' || err.code === 'EACCES' ? 'Access denied' : err.message };
  }
});

// First 64 KB of a file as text, for the preview pane.
ipcMain.handle('fs:readText', async (_e, p) => {
  const LIMIT = 64 * 1024;
  let fh;
  try {
    fh = await fsp.open(p, 'r');
    const { size } = await fh.stat();
    const buf = Buffer.alloc(Math.min(size, LIMIT));
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const data = buf.subarray(0, bytesRead);
    if (data.includes(0)) return { ok: true, binary: true };
    return { ok: true, text: data.toString('utf8'), truncated: size > LIMIT };
  } catch (err) {
    return { ok: false, error: err.code === 'EPERM' || err.code === 'EACCES' ? 'Access denied' : err.message };
  } finally {
    if (fh) await fh.close();
  }
});

ipcMain.handle('fs:icon', async (_e, p) => {
  try {
    const img = await app.getFileIcon(p, { size: 'large' });
    return img.toDataURL();
  } catch {
    return null;
  }
});

// ---- operations ----
ipcMain.handle('fs:open', (_e, p) => shell.openPath(p));
ipcMain.handle('fs:reveal', (_e, p) => shell.showItemInFolder(p));

function wrap(fn) {
  return async (...args) => {
    try { await fn(...args); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  };
}

ipcMain.handle('fs:rename', wrap(async (_e, p, newName) => {
  if (/[\\/:*?"<>|]/.test(newName)) throw new Error('A name cannot contain \\ / : * ? " < > |');
  await fsp.rename(p, path.join(path.dirname(p), newName));
}));

ipcMain.handle('fs:trash', wrap(async (_e, paths) => {
  for (const p of paths) await shell.trashItem(p);
}));

function uniqueName(dir, base, ext) {
  let n = 0, candidate;
  do {
    candidate = n === 0 ? base + ext : `${base} (${n})${ext}`;
    n++;
  } while (fs.existsSync(path.join(dir, candidate)));
  return candidate;
}

ipcMain.handle('fs:create', async (_e, dir, kind) => {
  try {
    const name = kind === 'folder'
      ? uniqueName(dir, 'New folder', '')
      : uniqueName(dir, 'New text document', '.txt');
    const full = path.join(dir, name);
    if (kind === 'folder') await fsp.mkdir(full);
    else await fsp.writeFile(full, '');
    return { ok: true, path: full };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

const sameFolder = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function moveAny(src, dst) {
  try { await fsp.rename(src, dst); }
  catch (err) {
    if (err.code !== 'EXDEV') throw err;   // different drive: copy then delete
    await fsp.cp(src, dst, { recursive: true });
    await fsp.rm(src, { recursive: true, force: true });
  }
}

// mode: 'copy' | 'cut'. policy: undefined | 'replace' | 'skip' | 'both', used only when names collide.
// Without a policy, a collision returns { ok: false, conflicts } and nothing is touched.
ipcMain.handle('fs:paste', async (_e, sources, destDir, mode, policy) => {
  try {
    const plan = [];
    const conflicts = [];
    for (const src of sources) {
      const name = path.basename(src);
      const st = await fsp.stat(src);
      const split = (n) => (st.isDirectory() ? [n, ''] : [path.basename(n, path.extname(n)), path.extname(n)]);

      if (st.isDirectory()) {
        const rel = path.relative(src, destDir);
        if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
          throw new Error(`Can't ${mode === 'cut' ? 'move' : 'copy'} "${name}" into itself`);
        }
      }

      const full = path.join(destDir, name);
      if (sameFolder(path.dirname(src), destDir)) {
        if (mode === 'cut') continue;   // moving into the folder it is already in
        const [base, ext] = split(name);
        plan.push({ src, target: path.join(destDir, uniqueName(destDir, base, ext)) });
      } else if (fs.existsSync(full)) {
        if (!policy) { conflicts.push(name); continue; }
        if (policy === 'skip') continue;
        if (policy === 'replace') { plan.push({ src, target: full, replace: true }); continue; }
        const [base, ext] = split(name);
        plan.push({ src, target: path.join(destDir, uniqueName(destDir, base, ext)) });
      } else {
        plan.push({ src, target: full });
      }
    }
    if (conflicts.length) return { ok: false, conflicts };

    const done = [];
    for (const { src, target, replace } of plan) {
      if (replace) await shell.trashItem(target);   // to the Recycle Bin, so a replace is recoverable
      if (mode === 'cut') await moveAny(src, target);
      else await fsp.cp(src, target, { recursive: true });
      done.push({ from: src, to: target, replaced: !!replace });
    }
    return { ok: true, done };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Reverses a recorded operation. Moves go back to where they came from; copies and new items are recycled.
ipcMain.handle('fs:undo', wrap(async (_e, op) => {
  if (op.type === 'rename') {
    await fsp.rename(op.to, op.from);
  } else if (op.type === 'move') {
    for (const { from, to } of [...op.pairs].reverse()) {
      if (fs.existsSync(from)) throw new Error(`"${path.basename(from)}" can't go back: something is already there`);
      await moveAny(to, from);
    }
  } else if (op.type === 'copy' || op.type === 'create') {
    for (const p of op.paths) await shell.trashItem(p);
  }
}));

// ---- Windows clipboard (so copy/paste works with the real Explorer and other apps) ----
// Set-Clipboard -Path puts a file list on the clipboard; it can't mark a "cut", so external pastes act as copies.
function powershell(script, env) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { env: { ...process.env, ...env }, windowsHide: true, timeout: 8000 },
      (err, stdout) => resolve(err ? null : stdout));
  });
}

ipcMain.handle('clip:write', async (_e, paths) => {
  if (process.platform !== 'win32') return false;
  const out = await powershell('Set-Clipboard -Path (ConvertFrom-Json $env:FILES_JSON); "ok"', { FILES_JSON: JSON.stringify(paths) });
  return !!out;
});

ipcMain.handle('clip:read', async () => {
  if (process.platform !== 'win32') return [];
  const out = await powershell('$f = @(Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }); ConvertTo-Json -Compress -InputObject $f');
  try { return out ? JSON.parse(out) : []; } catch { return []; }
});
