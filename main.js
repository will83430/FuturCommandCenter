const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { fork, spawn } = require('child_process')
const crypto = require('crypto')

const BACKEND_TOKEN = crypto.randomBytes(32).toString('hex')

let mainWindow
let backendProcess
let whisperProcess

function startBackend() {
  const envPath     = app.isPackaged ? path.join(process.resourcesPath, '.env')            : path.join(__dirname, '.env')
  const garminPath  = app.isPackaged ? path.join(process.resourcesPath, '.garmin-session') : path.join(__dirname, '.garmin-session')
  backendProcess = fork(path.join(__dirname, 'backend/server.js'), [], {
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production', DOTENV_PATH: envPath, GARMIN_TOKEN_DIR: garminPath, BACKEND_TOKEN }
  })
  backendProcess.on('message', (msg) => {
    if (msg === 'ready') createWindow()
  })
  backendProcess.on('error', (err) => console.error('Backend error:', err))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, 'build/icon.png')
  })

  mainWindow.loadFile('frontend/index.html')

}

ipcMain.handle('get-backend-token', () => BACKEND_TOKEN)
ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow.close())

function startWhisper() {
  const venvPython = path.join(__dirname, 'whisper-env/bin/python3')
  const script     = path.join(__dirname, 'scripts/whisper_server.py')
  whisperProcess = spawn(venvPython, [script], { stdio: 'inherit' })
  whisperProcess.on('error', err => console.error('[Whisper] Erreur démarrage:', err.message))
}

app.whenReady().then(() => {
  startWhisper()
  startBackend()
})

app.on('window-all-closed', () => {
  if (backendProcess)  backendProcess.kill()
  if (whisperProcess)  whisperProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})
