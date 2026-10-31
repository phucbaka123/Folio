const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
  close: () => ipcRenderer.send('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  startPath: () => ipcRenderer.invoke('app:startPath'),
  version: () => ipcRenderer.invoke('app:version'),
  onOpenPath: (cb) => ipcRenderer.on('app:openPath', (_e, p) => cb(p)),
  onMaximized: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),

  places: () => ipcRenderer.invoke('fs:places'),
  driveInfo: (root) => ipcRenderer.invoke('fs:driveInfo', root),
  list: (dir) => ipcRenderer.invoke('fs:list', dir),
  icon: (p) => ipcRenderer.invoke('fs:icon', p),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  open: (p) => ipcRenderer.invoke('fs:open', p),
  reveal: (p) => ipcRenderer.invoke('fs:reveal', p),
  rename: (p, name) => ipcRenderer.invoke('fs:rename', p, name),
  trash: (paths) => ipcRenderer.invoke('fs:trash', paths),
  create: (dir, kind) => ipcRenderer.invoke('fs:create', dir, kind),
  paste: (sources, dest, mode, policy) => ipcRenderer.invoke('fs:paste', sources, dest, mode, policy),
  undo: (op) => ipcRenderer.invoke('fs:undo', op),

  clipWrite: (paths) => ipcRenderer.invoke('clip:write', paths),
  clipRead: () => ipcRenderer.invoke('clip:read'),
  // Files dropped in from other apps: the File object's path is only available through webUtils.
  pathForFile: (file) => webUtils.getPathForFile(file),
});
