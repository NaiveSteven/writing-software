import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { DatabaseService } from './services/database'

/** 主窗口引用 */
let mainWindow: BrowserWindow | null = null

/** 创建主窗口 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  /* 窗口准备好后再显示，避免白屏闪烁 */
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  /* 外部链接用系统浏览器打开 */
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  /* 开发环境加载 dev server，生产环境加载打包文件 */
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/* 应用就绪后初始化 */
app.whenReady().then(async () => {
  try {
    /* 初始化数据库 (异步 WASM 加载) */
    const db = DatabaseService.getInstance()
    await db.ready()
    /* 注册 IPC 通信处理器 */
    registerIpcHandlers()
  } catch (err) {
    console.error('Service init failed:', err)
  }

  /* 创建窗口 */
  createWindow()

  /* macOS 点击 dock 图标重新创建窗口 */
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

/* 非 macOS 平台, 所有窗口关闭时退出应用 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
