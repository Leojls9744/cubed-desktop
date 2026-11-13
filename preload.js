// The only bridge between the CUBED web app and the desktop shell.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cubedDesktop", {
  onOpenFile: (open) => ipcRenderer.on("open-file", (_event, file) => open(file)),
  ready: () => ipcRenderer.send("ready"),
  saveFile: (path, bytes) => ipcRenderer.invoke("save-file", path, bytes),
});
