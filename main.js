/* ==========================================================================
   main.js - the desktop app shell.
   Opens Burger Munch in its own window: no address bar, no tabs, no browser.
   The game itself is untouched; this only gives it a window to live in.
   ========================================================================== */
const { app, BrowserWindow, Menu, globalShortcut } = require('electron');
const path = require('path');

// The board is 28 x 31 tiles, so the window is shaped to suit it.
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 1000;

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: 480,
    minHeight: 560,
    backgroundColor: '#0d1411',
    title: 'Burger Munch',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // the game is local and self-contained: it needs no node access
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile('index.html');

  // wait for the first paint so the window never flashes empty
  win.once('ready-to-show', function () {
    win.show();
    win.focus();
  });

  // Keep the app inside itself: anything trying to open a browser window or
  // navigate away is refused.
  win.webContents.setWindowOpenHandler(function () {
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', function (event) {
    event.preventDefault();
  });

  win.on('closed', function () { win = null; });
}

app.whenReady().then(function () {
  createWindow();

  // F11 for full screen, Ctrl+Q to quit - the game keeps its own keys
  globalShortcut.register('F11', function () {
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', function () {
  globalShortcut.unregisterAll();
});
