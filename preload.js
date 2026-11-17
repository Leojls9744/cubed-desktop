// The only bridge between the CUBED web app and the desktop shell.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cubedDesktop", {
  onOpenFile: (open) => ipcRenderer.on("open-file", (_event, file) => open(file)),
  ready: () => ipcRenderer.send("ready"),
  // The window is being closed: the app may ask about unsaved edits, then
  // answers with closeNow().
  onBeforeClose: (ask) =>
    ipcRenderer.on("before-close", () => {
      ipcRenderer.send("close-ack"); // the app is awake and will answer
      ask();
    }),
  closeNow: () => ipcRenderer.send("close-now"),
  saveFile: (path, bytes) => ipcRenderer.invoke("save-file", path, bytes),
  // Sign in through the browser: resolves with the session for this app's key,
  // or "" if the window was closed or the attempt was replaced.
  signIn: (publicKey) => ipcRenderer.invoke("sign-in", publicKey),
  // Printing without the system card: the printers, print (silent), save as PDF.
  printers: () => ipcRenderer.invoke("printers"),
  print: (job) => ipcRenderer.invoke("print", job),
  savePdf: (job) => ipcRenderer.invoke("save-pdf", job),
  // Updates: the installed version; what is waiting ({ state, version, url? }
  // or null); and "do it" (restart to install, or open the Mac download).
  version: () => ipcRenderer.invoke("version"),
  update: () => ipcRenderer.invoke("update"),
  applyUpdate: () => ipcRenderer.invoke("apply-update"),
});
