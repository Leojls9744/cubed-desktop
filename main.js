// CUBED desktop app: a native window around the CUBED web app.
// - Registers CUBED for .docx/.xlsx/.csv/.pptx/.pdf/image files, so the OS can
//   use it as the default app. Files opened from the OS are handed to the app,
//   and Save writes back to the same file.
// - After the first launch the app works offline (it caches itself).
// - Sign-in happens in the user's real browser (passkeys and Google sign-in do
//   not work inside an app window): see "Sign in through the browser" below.
// - Windows and Linux update themselves from this repo's GitHub releases. Macs
//   cannot (that needs a paid Apple certificate), so there the app is told when
//   a newer installer exists and shows a button: see "Updates" below.
const { app, BrowserWindow, dialog, ipcMain, net, screen, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { existsSync } = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const APP_URL = process.env.CUBED_URL || require("./package.json").cubed.url;
const EXTENSIONS = new Set(
  "docx txt md html htm xlsx csv tsv xls ods pptx pdf tif tiff png jpg jpeg webp gif bmp".split(" "),
);
// Sign-in popups (Internet Identity, Google, Microsoft) are allowed to open in-app.
const SIGN_IN = ["https://id.ai", "https://identity.ic0.app", "https://identity.internetcomputer.org", "https://accounts.google.com", "https://login.microsoftonline.com"];

let win = null;
let rendererReady = false;
// Set once the app has said it is fine to close (nothing unsaved, or the user chose).
let forceClose = false;
let closeTimer = null;
const pending = [];
// Only files the user opened through the OS in this session may be written.
const writable = new Set();

// Other apps open CUBED with a cubed:// link (cubed://open). A link only
// starts CUBED or brings its window to the front. Nothing else in the address
// is read, and a launch that carries a link never opens a file, whatever the
// address or the rest of the command line says.
const LINK = "cubed";
const isLink = (arg) => /^cubed:/i.test(String(arg));

const filesIn = (argv) =>
  argv.some(isLink)
    ? []
    : argv.filter((arg) => !arg.startsWith("-") && EXTENSIONS.has(path.extname(arg).slice(1).toLowerCase()));

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

/** Bring CUBED to the front, making its window again if it was closed. */
function showWindow() {
  if (!win) {
    if (app.isReady()) createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
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
  // Not ready again until the page itself is loaded afresh. (This used to be
  // "did-start-loading", which also fires for things inside the page, and then
  // files opened later waited forever for a "ready" that was never sent again.)
  win.webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) rendererReady = false;
  });
  // Closing the window: the app first gets to ask about unsaved edits.
  win.on("close", (event) => {
    if (forceClose || !rendererReady || !win) return;
    event.preventDefault();
    win.webContents.send("before-close");
    // If the page never answers (it hung), do not leave the window stuck.
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      forceClose = true;
      win?.close();
    }, 5000);
  });
  win.on("closed", () => {
    clearTimeout(closeTimer);
    forceClose = false;
    rendererReady = false;
    win = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Tell the system that cubed:// links belong to this app. Run from source
  // (npm start), the link has to name the script as well as Electron.
  if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient(LINK, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(LINK);
  }
  // A second launch (double-clicking another file, or a cubed:// link on
  // Windows and Linux) reuses the running app.
  app.on("second-instance", (_event, argv) => {
    for (const file of filesIn(argv.slice(1))) open(file);
    showWindow();
  });
  // macOS delivers opened files through this event.
  app.on("open-file", (event, file) => {
    event.preventDefault();
    if (isLink(file)) return showWindow();
    open(file);
  });
  // macOS delivers a cubed:// link through this one. The address is not read.
  app.on("open-url", (event) => {
    event.preventDefault();
    showWindow();
  });
  app.whenReady().then(() => {
    pending.push(...filesIn(process.argv.slice(1)));
    createWindow();
    watchForUpdates();
    app.on("activate", () => {
      if (!win) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

ipcMain.on("close-ack", () => clearTimeout(closeTimer));
ipcMain.on("close-now", (event) => {
  if (!win || event.sender !== win.webContents) return;
  forceClose = true;
  win.close();
});
ipcMain.on("ready", () => {
  rendererReady = true;
  for (const file of pending.splice(0)) deliver(file);
});
// Only the CUBED app itself may use the bridge, never a page it opened.
const fromApp = (event) => {
  try {
    return !!APP_URL && new URL(event.senderFrame.url).origin === new URL(APP_URL).origin;
  } catch {
    return false;
  }
};
ipcMain.handle("save-file", async (event, file, bytes) => {
  if (!fromApp(event)) throw new Error("Not allowed.");
  if (!writable.has(file)) throw new Error("CUBED can only save files it opened.");
  await fs.writeFile(file, Buffer.from(bytes));
});

// ---- Printing ---------------------------------------------------------------
// The app shows its own preview and print options, so the page is printed (or
// saved as a PDF) here without the system's print card.
/** "1-3, 5" -> [{from: 0, to: 2}, {from: 4, to: 4}] (Electron counts from 0). */
function pageRanges(text) {
  const out = [];
  for (const part of String(text || "").split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from >= 1 && to >= from) out.push({ from: from - 1, to: to - 1 });
  }
  return out;
}
ipcMain.handle("printers", async (event) => {
  if (!fromApp(event)) throw new Error("Not allowed.");
  const list = await event.sender.getPrintersAsync();
  return list.map((p) => ({ name: p.name, label: p.displayName || p.name, isDefault: !!p.isDefault }));
});
ipcMain.handle("print", (event, job) => {
  if (!fromApp(event)) throw new Error("Not allowed.");
  const ranges = pageRanges(job && job.pages);
  const options = {
    silent: true,
    printBackground: true,
    copies: Math.max(1, Math.min(99, Number(job && job.copies) || 1)),
  };
  if (job && job.printer) options.deviceName = String(job.printer);
  if (ranges.length) options.pageRanges = ranges;
  return new Promise((resolve) => {
    event.sender.print(options, (ok, reason) => resolve({ ok, reason: ok ? "" : reason || "Could not print" }));
  });
});
ipcMain.handle("save-pdf", async (event, job) => {
  if (!fromApp(event)) throw new Error("Not allowed.");
  const win = BrowserWindow.fromWebContents(event.sender);
  const base = String((job && job.name) || "Document").replace(/[\\/:*?"<>|]+/g, " ").replace(/\.[A-Za-z0-9]{1,5}$/, "").trim() || "Document";
  const pick = await dialog.showSaveDialog(win, {
    defaultPath: `${base}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (pick.canceled || !pick.filePath) return { ok: false, reason: "" };
  const ranges = String((job && job.pages) || "").replace(/[^0-9,\- ]/g, "");
  const data = await event.sender.printToPDF({
    preferCSSPageSize: true,
    printBackground: true,
    ...(ranges.trim() ? { pageRanges: ranges.trim() } : {}),
  });
  await fs.writeFile(pick.filePath, data);
  return { ok: true, reason: "", path: pick.filePath };
});

// ---- Updates ----------------------------------------------------------------
// What the app can show: null (up to date), { state: "ready", version } once a
// Windows or Linux update is downloaded (it installs when the app quits, or at
// once on "Restart to update"), or { state: "available", version, url } on a
// Mac, where the user downloads the new installer.
// "owner/repo" on GitHub. (The "build" section of package.json is not in the
// installed app, so this lives beside the app's address.)
const RELEASES = require("./package.json").cubed.releases;
const SIX_HOURS = 6 * 60 * 60 * 1000;
let update = null;

/** Is version `a` newer than `b`? Compares 1.2.3-style numbers. */
function newer(a, b) {
  const parts = (v) => String(v).replace(/^v/, "").split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) > (right[i] || 0);
  }
  return false;
}

/** Mac: ask GitHub for the latest release and remember its installer. */
async function checkMacRelease(fetchJson) {
  try {
    const release = await fetchJson(`https://api.github.com/repos/${RELEASES}/releases/latest`);
    const version = String(release.tag_name || "").replace(/^v/, "");
    const file = `CUBED-mac-${process.arch === "arm64" ? "arm64" : "x64"}.dmg`;
    const installer = (release.assets || []).find((asset) => asset.name === file);
    if (installer && newer(version, app.getVersion())) {
      update = { state: "available", version, url: installer.browser_download_url };
    }
  } catch (error) {
    console.error("Update check failed:", error.message);
  }
  return update;
}

function watchForUpdates() {
  if (!app.isPackaged) return;
  if (process.platform === "darwin") {
    const fetchJson = async (url) => {
      const reply = await net.fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "CUBED-desktop" } });
      if (!reply.ok) throw new Error(`GitHub answered ${reply.status}`);
      return reply.json();
    };
    const check = () => checkMacRelease(fetchJson);
    setTimeout(check, 8000);
    setInterval(check, SIX_HOURS);
    return;
  }
  // Windows and Linux: download in the background, install when the app quits.
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", (info) => {
    update = { state: "ready", version: info.version };
  });
  autoUpdater.on("error", (error) => console.error("Update failed:", error == null ? "" : error.message));
  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, 8000);
  setInterval(check, SIX_HOURS);
}

ipcMain.handle("version", () => app.getVersion());
ipcMain.handle("update", (event) => (fromApp(event) ? update : null));
ipcMain.handle("apply-update", (event) => {
  if (!fromApp(event) || !update) return false;
  if (update.state === "ready") {
    // Quit, install and start again.
    setImmediate(() => require("electron-updater").autoUpdater.quitAndInstall());
  } else if (update.url && update.url.startsWith("https://github.com/")) {
    shell.openExternal(update.url);
  }
  return true;
});

// ---- Sign in through the browser -------------------------------------------
// The app makes a key pair and gives the public half to main. Main opens a
// small browser window on the CUBED sign-in page (the request after the "#")
// and waits on a loopback address (127.0.0.1, this computer only). The page
// signs in with Internet Identity, extends the session to the app's key, and
// sends it back here.
// Main checks the one-time code and passes the answer to the app. The private
// key never leaves the app, so the answer is useless to anything else.

const SIGN_IN_MINUTES = 10;
let attempt = null; // the sign-in in progress: { finish }

/** A Chromium browser that can open a small app-style window, or null. */
function findBrowser() {
  const candidates = [];
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    for (const exe of ["Google\\Chrome\\Application\\chrome.exe", "Microsoft\\Edge\\Application\\msedge.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe"]) {
      for (const root of roots) candidates.push(path.join(root, exe));
    }
  } else if (process.platform === "darwin") {
    const roots = ["/Applications", path.join(app.getPath("home"), "Applications")];
    for (const name of ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"]) {
      for (const root of roots) candidates.push(path.join(root, `${name}.app`, "Contents", "MacOS", name));
    }
  } else {
    const dirs = (process.env.PATH || "").split(":").filter(Boolean);
    for (const name of ["google-chrome", "google-chrome-stable", "microsoft-edge", "brave-browser", "chromium", "chromium-browser"]) {
      for (const dir of dirs) candidates.push(path.join(dir, name));
    }
  }
  return candidates.find((file) => existsSync(file)) || null;
}

/** Middle of the app's window (or of the screen), where the sign-in card opens. */
function centerOfApp() {
  const box = win && !win.isDestroyed() && !win.isMinimized() ? win.getBounds() : screen.getPrimaryDisplay().workArea;
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** Open the sign-in page in a small browser window (or a normal tab). */
function openSignInWindow(url) {
  const browser = findBrowser();
  if (!browser) return shell.openExternal(url);
  const width = 460;
  const height = 700;
  const args = [`--app=${url}`, `--window-size=${width},${height}`];
  // A browser that is already running often ignores these; the page moves and
  // sizes itself from the "at" in its address as well.
  const middle = centerOfApp();
  args.push(`--window-position=${Math.max(0, Math.round(middle.x - width / 2))},${Math.max(0, Math.round(middle.y - height / 2))}`);
  try {
    const child = spawn(browser, args, { detached: true, stdio: "ignore" });
    child.on("error", () => shell.openExternal(url));
    child.unref();
  } catch {
    return shell.openExternal(url);
  }
}

// The loopback page: reads the answer from its address, posts it back to this
// app, then closes. A nonce keeps any other script from running on it.
const donePage = (nonce) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CUBED</title>
<style nonce="${nonce}">
  html, body { height: 100%; margin: 0; background: #000; color: #fff; font: 600 17px/1.5 Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 24px; }
  small { display: block; margin-top: 6px; font-weight: 400; font-size: 13px; color: #94a3b8; }
</style>
</head>
<body>
<p id="status">Signing in…</p>
<script nonce="${nonce}">
  const status = document.getElementById("status");
  const answer = location.hash.slice(1);
  history.replaceState(null, "", "/done");
  fetch("/token", { method: "POST", body: answer })
    .then((reply) => {
      if (!reply.ok) throw new Error("refused");
      status.innerHTML = "Signed in<small>You can close this window.</small>";
      setTimeout(() => window.close(), 700);
    })
    .catch(() => {
      status.innerHTML = "This sign-in has expired<small>Go back to CUBED and choose Sign in again.</small>";
    });
</script>
</body>
</html>`;

const sameText = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

ipcMain.handle("sign-in", (event, publicKey) => {
  if (!fromApp(event)) throw new Error("Not allowed.");
  if (typeof publicKey !== "string" || !/^[A-Za-z0-9_-]{40,400}$/.test(publicKey)) {
    throw new Error("Sign-in could not start.");
  }
  // Choosing Sign in again replaces the attempt in progress.
  attempt?.finish("");

  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(24).toString("base64url");
    let port = 0;
    let settled = false;
    const server = http.createServer((request, response) => {
      const send = (code, type, body) => {
        response.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
        response.end(body);
      };
      // Only this computer, by its loopback address, may talk to this server.
      if (request.headers.host !== `127.0.0.1:${port}`) return send(400, "text/plain", "Bad request");
      const route = (request.url || "").split("?")[0];
      if (request.method === "GET" && route === "/done") {
        const nonce = crypto.randomBytes(16).toString("base64");
        response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
        return send(200, "text/html; charset=utf-8", donePage(nonce));
      }
      if (request.method === "POST" && route === "/token") {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
          if (body.length > 200_000) request.destroy();
        });
        request.on("end", () => {
          try {
            const answer = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
            if (!sameText(answer.state, state)) return send(403, "text/plain", "Refused");
            send(204, "text/plain", "");
            finish(body);
          } catch {
            send(400, "text/plain", "Bad request");
          }
        });
        return;
      }
      send(404, "text/plain", "Not found");
    });
    const timer = setTimeout(() => finish(""), SIGN_IN_MINUTES * 60_000);
    function finish(answer) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (attempt?.finish === finish) attempt = null;
      // Let the reply reach the browser before the server goes away.
      setTimeout(() => {
        server.close();
        server.closeAllConnections?.();
      }, 1500);
      resolve(answer);
      if (answer && win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    }
    attempt = { finish };
    server.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (attempt?.finish === finish) attempt = null;
      reject(new Error(`Sign-in could not start (${error.code || error.message}).`));
    });
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      // The request rides after the "#": a browser never sends that part to a
      // server, so the one-time code stays on this computer.
      const page = new URL(APP_URL);
      page.search = "?desktop-signin=1";
      const middle = centerOfApp();
      page.hash = new URLSearchParams({ pk: publicKey, state, port: String(port), at: `${middle.x},${middle.y}` }).toString();
      Promise.resolve(openSignInWindow(page.toString())).catch(() => finish(""));
    });
  });
});

// For tests.
module.exports = { newer, checkMacRelease, filesIn, isLink };
