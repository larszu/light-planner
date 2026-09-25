// Die einzige Bruecke zwischen Oberflaeche und Hauptprozess: das Token der
// Geraetebibliothek. Der Renderer bekommt drei Aufrufe, keinen Zugriff auf
// ipcRenderer selbst — sonst koennte jeder Code im Fenster beliebige Kanaele
// ansprechen. Laeuft sandboxed; `require('electron')` ist dort erlaubt.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lightPlannerSecrets', {
  getDeviceLibraryToken: () => ipcRenderer.invoke('device-library-token:get'),
  setDeviceLibraryToken: (value) => ipcRenderer.invoke('device-library-token:set', value),
  clearDeviceLibraryToken: () => ipcRenderer.invoke('device-library-token:clear'),
});
