// Die Bruecken zwischen Oberflaeche und Hauptprozess: das Token der
// Geraetebibliothek und der DMX-Eingang. Der Renderer bekommt einzelne Aufrufe, keinen Zugriff auf
// ipcRenderer selbst — sonst koennte jeder Code im Fenster beliebige Kanaele
// ansprechen. Laeuft sandboxed; `require('electron')` ist dort erlaubt.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lightPlannerSecrets', {
  getDeviceLibraryToken: () => ipcRenderer.invoke('device-library-token:get'),
  setDeviceLibraryToken: (value) => ipcRenderer.invoke('device-library-token:set', value),
  clearDeviceLibraryToken: () => ipcRenderer.invoke('device-library-token:clear'),
});

contextBridge.exposeInMainWorld('lightPlannerDmx', {
  interfaces: () => ipcRenderer.invoke('dmx-in:interfaces'),
  start: (opts) => ipcRenderer.invoke('dmx-in:start', opts),
  setUniverses: (opts) => ipcRenderer.invoke('dmx-in:universes', opts),
  stop: () => ipcRenderer.invoke('dmx-in:stop'),
  // Liefert eine Abmeldefunktion; der Listener sieht nur Paket und Absender.
  onPacket: (cb) => {
    const h = (_e, data, from) => cb(data, from);
    ipcRenderer.on('dmx-in:packet', h);
    return () => ipcRenderer.removeListener('dmx-in:packet', h);
  },
});
