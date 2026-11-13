// The only bridge between the CUBED web app and the desktop shell.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cubedDesktop", {
  onOpenFile: (open) => ipcRenderer.on("open-file", (_event, file) => open(file)),
  ready: () => ipcRenderer.send("ready"),
  saveFile: (path, bytes) => ipcRenderer.invoke("save-file", path, bytes),
  // Sign in through the browser: resolves with the session for this app's key,
  // or "" if the window was closed or the attempt was replaced.
  signIn: (publicKey) => ipcRenderer.invoke("sign-in", publicKey),
});
