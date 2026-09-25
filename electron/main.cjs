const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// ── Token der Geraetebibliothek ────────────────────────────────────────────
// Verschluesselt mit `safeStorage` (Schluesselbund / DPAPI / libsecret) in
// einer Datei unter userData — nie im Projekt, nie im localStorage der App.
// Gespeichert wird `{ server, token }`: ein Token gilt nur fuer den Server,
// der es ausgestellt hat. Ohne verfuegbare Verschluesselung wird NICHTS
// geschrieben; die Anmeldung haelt dann nur bis zum Beenden (Renderer-Speicher).
// Der Wert wird nirgends geloggt.
const tokenFile = () => path.join(app.getPath('userData'), 'device-library-token.bin');

ipcMain.handle('device-library-token:get', () => {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(tokenFile())) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenFile())));
  } catch {
    return null;
  }
});

ipcMain.handle('device-library-token:set', (_e, value) => {
  if (!value || typeof value.server !== 'string' || typeof value.token !== 'string') return false;
  if (!safeStorage.isEncryptionAvailable()) return false;
  const data = safeStorage.encryptString(JSON.stringify({ server: value.server, token: value.token }));
  fs.writeFileSync(tokenFile(), data, { mode: 0o600 });
  return true;
});

ipcMain.handle('device-library-token:clear', () => {
  try {
    fs.rmSync(tokenFile(), { force: true });
  } catch {
    // Eine Datei, die nicht geloescht werden kann, ist beim naechsten `get`
    // unlesbar oder gehoert zu einem anderen Server — beides heisst abgemeldet.
  }
  return true;
});

// Runtime window / taskbar icon. dist/ and electron/ sit side by side both in
// dev (after `vite build`) and inside the packaged asar; icon.png is copied
// there from public/. The installer / .exe / .app icon comes from
// build/icon.png via electron-builder instead.
function windowIcon() {
  const p = path.join(__dirname, '..', 'dist', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Light Planner',
    icon: windowIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
  });

  // In production, load the built files; in dev, load the Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWindow.webContents.getURL()) e.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
