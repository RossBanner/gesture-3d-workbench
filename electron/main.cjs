const { app, BrowserWindow, protocol, session, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const MAX_BYTES = 512000;
let window;
let cameraEnabled = false;
let fileDialogActive = false;
protocol.registerSchemesAsPrivileged([{ scheme: 'workbench', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const isLocal = (url) => { try { const u = new URL(url); return u.protocol === 'workbench:' && u.host === 'app'; } catch { return false; } };
function validateSender(event) { if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isLocal(event.senderFrame.url)) throw new Error('Untrusted request.'); }
app.setName('Gesture 3D Workbench');
app.setAppUserModelId('local.gesture3d.workbench');
app.whenReady().then(() => {
  const root = path.resolve(__dirname, '../dist');
  protocol.handle('workbench', async request => {
    if (!isLocal(request.url) || request.method !== 'GET') return new Response('Not found', { status: 404 });
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Invalid path', { status: 400 }); }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.task': 'application/octet-stream', '.png': 'image/png' };
    try { return new Response(await fs.readFile(file), { headers: { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  });
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window?.webContents && cameraEnabled && isLocal(contents.getURL()) && isLocal(details.requestingUrl || contents.getURL()) && permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'video');
  });
  ses.setPermissionCheckHandler((contents, permission, origin, details) => contents === window?.webContents && cameraEnabled && permission === 'media' && isLocal(origin) && details.mediaType === 'video');
  ses.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('workbench://app/') && !details.url.startsWith('devtools:') && !details.url.startsWith('blob:') && !details.url.startsWith('data:') }));
  ipcMain.handle('camera:access', (event, enabled) => { validateSender(event); if (typeof enabled !== 'boolean') throw new Error('Invalid camera request.'); cameraEnabled = enabled; });
  ipcMain.handle('scene:save', async (event, text) => {
    validateSender(event);
    if (fileDialogActive) return { canceled: true };
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) return { error: 'Scene data is too large.' };
    try { const data = JSON.parse(text); if (data.format !== 'gesture-3d-workbench' || data.version !== 1 || !Array.isArray(data.objects) || data.objects.length > 200) return { error: 'Invalid scene data.' }; } catch { return { error: 'Invalid scene data.' }; }
    fileDialogActive = true;
    try {
      const result = await dialog.showSaveDialog(window, { title: 'Save your scene', defaultPath: 'My assembly.g3d.json', filters: [{ name: 'Workbench scene', extensions: ['g3d.json'] }] });
      if (result.canceled || !result.filePath) return { canceled: true };
      await fs.writeFile(result.filePath, text, 'utf8');
      return { name: path.basename(result.filePath) };
    } catch (e) { return { error: `Could not save the scene: ${e.message}` }; } finally { fileDialogActive = false; }
  });
  ipcMain.handle('scene:open', async event => {
    validateSender(event);
    if (fileDialogActive) return { canceled: true };
    fileDialogActive = true;
    try {
      const result = await dialog.showOpenDialog(window, { title: 'Open a Workbench scene', properties: ['openFile'], filters: [{ name: 'Workbench scene', extensions: ['json'] }] });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const file = result.filePaths[0];
      const handle = await fs.open(file, 'r');
      let text;
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_BYTES) return { error: 'Choose a scene file smaller than 500 KB.' };
        const buffer = Buffer.alloc(MAX_BYTES + 1); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_BYTES) return { error: 'Scene is too large.' };
        text = buffer.subarray(0, bytesRead).toString('utf8');
      } finally { await handle.close(); }
      return { text, name: path.basename(file) };
    } catch (e) { return { error: `Could not open the scene: ${e.message}` }; } finally { fileDialogActive = false; }
  });
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 1040, minHeight: 720, show: false, backgroundColor: '#121b1d', icon: path.join(root,'icon.png'), title: 'Gesture 3D Workbench', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => { cameraEnabled = false; });
  window.on('closed', () => { cameraEnabled = false; window = null; });
  window.once('ready-to-show', () => window.show());
  window.loadURL('workbench://app/');
});
app.on('window-all-closed', () => app.quit());
