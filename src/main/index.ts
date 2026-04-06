import { app, BrowserWindow, shell, session, net } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { DatabaseService } from './services/database'

/** 主窗口引用 */
let mainWindow: BrowserWindow | null = null

/**
 * 确保 Chromium 存储路径干净，避免 quota_database 报错
 * 在 window 创建前调用，让 Chromium 有正确的存储目录
 */
function ensureStoragePaths(): void {
  const userData = app.getPath('userData')
  const storageDirs = ['Cache', 'GPUCache', 'Code Cache']
  for (const dir of storageDirs) {
    const fullPath = join(userData, dir)
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true })
    }
  }
}

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
  /* 确保 Chromium 存储目录就绪，抑制 quota_database 报错 */
  ensureStoragePaths()

  /*
   * 在主进程代理 HuggingFace 模型下载请求，彻底绕过 CORS 限制。
   * 渲染进程 fetch hf-mirror.com / huggingface.co 时，Chromium 的 CORS 策略
   * 可能拦截响应（尤其是重定向后 CDN 域名不符合允许来源时）。
   * 通过 session.protocol.handle('https') 将这些请求改为在主进程用
   * Node.js net.fetch 执行（不受 CORS 约束），并在响应头中注入
   * Access-Control-Allow-Origin: * 供渲染进程安全读取。
   * 非模型下载的 https 请求直接透传，不影响其它网络行为。
   */
  session.defaultSession.protocol.handle('https', async (request) => {
    const url = request.url
    const isHfRequest =
      url.includes('hf-mirror.com') ||
      url.includes('huggingface.co') ||
      url.includes('xethub.hf.co') ||
      url.includes('cdn-lfs')

    if (!isHfRequest) {
      /* 非 HF 请求：走 Electron 默认网络处理 */
      return net.fetch(url, {
        bypassCustomProtocolHandlers: true,
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.body
      })
    }

    try {
      /* HF 请求：在主进程通过 Node.js net.fetch 执行，绑定 bypassCustomProtocolHandlers 防递归 */
      const response = await net.fetch(url, {
        bypassCustomProtocolHandlers: true,
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.body
      })

      /* 注入宽松 CORS 头，确保渲染进程可以读取响应体 */
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      headers.set('Access-Control-Allow-Headers', '*')
      headers.set('Access-Control-Expose-Headers', '*')

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch (err) {
      console.error('[HF proxy] fetch error:', url, err)
      return new Response('Network error', { status: 503 })
    }
  })

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
