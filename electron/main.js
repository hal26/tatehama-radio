const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 650,
    title: "館浜電鉄無線交信部",
    resizable: false, // 画面サイズを固定して無線機っぽさを出します
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 先ほど build に成功した「dist/index.html」を直接読み込みます
  win.loadFile(path.join(__dirname, '../dist/index.html'));

  // デバッグしたい時だけ下の行のコメントアウト（//）を消してください
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});