const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');

// Electron leitet userData aus dem productName ab. Seit der Umbenennung in
// „LZ Light Planner" laege das Token der Geraetebibliothek und der
// localStorage des Renderers (Projekte, Lager, Einstellungen) sonst in einem
// leeren Ordner. Nur im Paket: `electron .` nutzt den npm-Namen.
if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'Light Planner'));

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

// ── DMX-Eingang (Art-Net / sACN) ───────────────────────────────────────────
// Hier wird nur empfangen und durchgereicht; gedeutet werden die Pakete im
// Renderer (`src/core/dmxInput.ts`), damit die Deutung ohne Netz pruefbar ist.
// Gesendet wird nichts — der Planer ist Zuschauer, kein Pult.
const ARTNET_PORT = 6454;
const SACN_PORT = 5568;
const dmxIn = { artnet: null, sacn: null, groups: [] };

const ipv4Interfaces = () =>
  Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })));

const sacnGroup = (u) => `239.255.${(u >> 8) & 0xff}.${u & 0xff}`;

function forward(msg, rinfo) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('dmx-in:packet', new Uint8Array(msg), rinfo.address);
}

function bindSocket(port, opts) {
  return new Promise((resolve) => {
    let s;
    try {
      s = dgram.createSocket(opts);
    } catch (err) {
      resolve({ error: err });
      return;
    }
    s.on('message', forward);
    s.once('error', (err) => { try { s.close(); } catch { /* schon zu */ } resolve({ error: err }); });
    s.bind(port, () => resolve({ socket: s }));
  });
}

// reusePort: ein zweites Programm auf demselben Rechner (Visualisierer,
// QLC+) darf denselben Port weiter hoeren. Nicht jedes System kann das —
// macOS meldet ENOTSUP —, dann ohne.
async function openSocket(port) {
  const r = await bindSocket(port, { type: 'udp4', reuseAddr: true, reusePort: true });
  if (r.socket) return r;
  const plain = await bindSocket(port, { type: 'udp4', reuseAddr: true });
  return plain.socket ? plain : { error: `${port}: ${plain.error.message}` };
}

function stopDmxIn() {
  for (const k of ['artnet', 'sacn']) {
    try { dmxIn[k] && dmxIn[k].close(); } catch { /* schon zu */ }
    dmxIn[k] = null;
  }
  dmxIn.groups = [];
}

function joinGroups(universes, iface) {
  const errors = [];
  if (!dmxIn.sacn) return errors;
  for (const g of dmxIn.groups) {
    try { dmxIn.sacn.dropMembership(g.group, g.iface); } catch { /* war nicht beigetreten */ }
  }
  dmxIn.groups = [];
  const ifaces = iface ? [iface] : ipv4Interfaces().map((i) => i.address);
  for (const u of universes) {
    if (!(u >= 1 && u <= 63999)) continue;
    for (const a of ifaces.length ? ifaces : [undefined]) {
      try {
        dmxIn.sacn.addMembership(sacnGroup(u), a);
        dmxIn.groups.push({ group: sacnGroup(u), iface: a });
      } catch (err) {
        errors.push(`sACN ${u}${a ? ` @ ${a}` : ''}: ${err.message}`);
      }
    }
  }
  return errors;
}

ipcMain.handle('dmx-in:interfaces', () => ipv4Interfaces());

ipcMain.handle('dmx-in:start', async (_e, opts) => {
  stopDmxIn();
  const errors = [];
  if (opts && opts.artnet) {
    const r = await openSocket(ARTNET_PORT);
    if (r.error) errors.push(`Art-Net ${r.error}`);
    else { dmxIn.artnet = r.socket; try { r.socket.setBroadcast(true); } catch { /* nur Empfang */ } }
  }
  if (opts && opts.sacn) {
    const r = await openSocket(SACN_PORT);
    if (r.error) errors.push(`sACN ${r.error}`);
    else {
      dmxIn.sacn = r.socket;
      errors.push(...joinGroups(Array.isArray(opts.universes) ? opts.universes : [], opts.iface || undefined));
    }
  }
  return { ok: !!(dmxIn.artnet || dmxIn.sacn), errors };
});

ipcMain.handle('dmx-in:universes', (_e, opts) =>
  ({ errors: joinGroups(Array.isArray(opts && opts.universes) ? opts.universes : [], (opts && opts.iface) || undefined) }));

ipcMain.handle('dmx-in:stop', () => { stopDmxIn(); return true; });

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
    title: 'LZ Light Planner',
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
  stopDmxIn();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
