const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");

const APP_URL = "https://elbarzily-nrgb8tp6.manus.space/";
const APP_ORIGIN = new URL(APP_URL).origin;

function isTrustedHttps(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && url.origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function openExternalHttps(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:") {
      void shell.openExternal(rawUrl);
    }
  } catch {
    // Invalid or non-web URLs remain blocked.
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#080D0A",
    title: "البرازيلي",
    icon: path.join(__dirname, "assets", "brzly.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedHttps(url)) return { action: "allow" };
    openExternalHttps(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedHttps(url)) {
      event.preventDefault();
      openExternalHttps(url);
    }
  });
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  window.webContents.on("will-redirect", (event, url) => {
    if (!isTrustedHttps(url)) event.preventDefault();
  });

  void window.loadURL(APP_URL);
  return window;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    let origin = "";
    try { origin = new URL(details.requestingUrl || webContents.getURL()).origin; } catch { /* deny */ }
    const supportedPermission = permission === "geolocation" || permission === "media";
    callback(origin === APP_ORIGIN && supportedPermission);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return requestingOrigin === APP_ORIGIN && (permission === "media" || permission === "geolocation");
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
