// CUBED desktop app: a native window around the CUBED web app.
// - Registers CUBED for .docx/.xlsx/.csv/.pptx/.pdf/image files, so the OS can
//   use it as the default app. Files opened from the OS are handed to the app,
//   and Save writes back to the same file.
// - After the first launch the app works offline (it caches itself).
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

const APP_URL = process.env.CUBED_URL || require("./package.json").cubed.url;
const EXTENSIONS = new Set(
  "docx txt md html htm xlsx csv tsv xls ods pptx pdf tif tiff png jpg jpeg webp gif bmp".split(" "),
);
// Sign-in popups (Internet Identity, Google, Microsoft) are allowed to open in-app.
const SIGN_IN = ["https://id.ai", "https://identity.ic0.app", "https://identity.internetcomputer.org", "https://accounts.google.com", "https://login.microsoftonline.com"];

let win = null;
let rendererReady = false;
const pending = [];
// Only files the user opened through the OS in this session may be written.
const writable = new Set();

const filesIn = (argv) =>
  argv.filter((arg) => !arg.startsWith("-") && EXTENSIONS.has(path.extname(arg).slice(1).toLowerCase()));

async function deliver(file) {
  try {
    const bytes = await fs.readFile(file);
    writable.add(file);
    win.webContents.send("open-file", { name: path.basename(file), path: file, bytes });
  } catch (error) {
    console.error("Could not open", file, error.message);
  }
}
function open(file) {
  if (win && rendererReady) deliver(file);
  else pending.push(file);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: "#0B0D13",
    autoHideMenuBar: true,
    title: "CUBED",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  if (!APP_URL) {
    win.loadFile("offline.html");
    return;
  }
  const origin = new URL(APP_URL).origin;
  win.loadURL(APP_URL).catch(() => win.loadFile("offline.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origin) || SIGN_IN.some((host) => url.startsWith(host))) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 760, autoHideMenuBar: true } };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  win.webContents.on("did-start-loading", () => {
    rendererReady = false;
  });
  win.on("closed", () => {
    win = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch (double-clicking another file) reuses the running app.
  app.on("second-instance", (_event, argv) => {
    for (const file of filesIn(argv.slice(1))) open(file);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  // macOS delivers opened files through this event.
  app.on("open-file", (event, file) => {
    event.preventDefault();
    open(file);
  });
  app.whenReady().then(() => {
    pending.push(...filesIn(process.argv.slice(1)));
    createWindow();
    app.on("activate", () => {
      if (!win) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

ipcMain.on("ready", () => {
  rendererReady = true;
  for (const file of pending.splice(0)) deliver(file);
});
ipcMain.handle("save-file", async (_event, file, bytes) => {
  if (!writable.has(file)) throw new Error("CUBED can only save files it opened.");
  await fs.writeFile(file, Buffer.from(bytes));
});
