<div align="center">

# Transformer

**On-device AI real-time conversation translation app**

Voice recognition + offline translation, no internet, no uploads

[中文](./README.md) · [English](#english)

</div>

<img src="./product.webp" />

---

### What It Does

- **🎙️ Voice to Text** — Hold the mic, speak, Whisper transcribes in real time
- **🌐 Offline Translation** — Marian MT / NLLB run locally, 9 languages
- **🔒 Privacy First** — All AI inference on-device, nothing leaves your machine
- **🎨 Liquid Glass UI** — macOS native vibrancy, dark / light themes
- **💬 Chat History** — Local SQLite storage, browse past translations anytime
- **🌍 Bilingual UI** — Interface switches between Chinese and English

### Supported Languages

+ Chinese
+ English
+ Japanese
+ Korean
+ French
+ German
+ Russian
+ Spanish
+ Italian

### AI Models

> Models download on demand to local cache

| Type | Model | Size |
|------|-------|------|
| Speech | Whisper Tiny | ~55 MB |
| Speech | Whisper Base (default) | ~150 MB |
| Speech | Whisper Small | ~280 MB |
| Translate (standard) | Opus-MT (12 directions) | ~105 MB each |
| Translate (JA/KO) | NLLB-200-Distilled-600M | ~900 MB |


### Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | **Electron** |
| Frontend | **React 19** + **TypeScript** |
| Build | **electron-vite** + **Vite 7** |
| Styling | **TailwindCSS 4** + CSS Modules |
| State | **Zustand 5** |
| AI Inference | **@huggingface/transformers** + **ONNX Runtime Web** |
| Database | **sql.js** (SQLite WASM) |
| i18n | **i18next** + **react-i18next** |
| Non-blocking | **Web Workers** (Whisper Worker + Translate Worker) |
| Package Mgr | **pnpm** |

### Quick Start

```bash
# Install dependencies
pnpm install

# Dev mode
pnpm dev

# Production build
pnpm build
```

### Build & Distribute

```bash
# macOS DMG (ARM64)
pnpm dist:mac

# Windows NSIS installer (x64)
pnpm dist:win

# Current platform
pnpm dist
```

Config in `electron-builder.yml`, output goes to `release/`

### Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts       # Window creation, CORS proxy, shortcut intercept
│   ├── ipc/           # IPC handlers
│   └── services/      # Database, model download, Whisper service
├── preload/           # Preload script
├── renderer/          # React renderer
│   └── src/
│       ├── pages/         # Chat / Settings pages
│       ├── components/    # Glass-style component library
│       ├── services/      # Translation routing, Whisper, model management
│       ├── workers/       # Whisper Worker + Translate Worker
│       ├── stores/        # Zustand state (messages, settings, models)
│       ├── i18n/          # Chinese & English resources
│       ├── hooks/         # Custom React Hooks
│       ├── utils/         # Shared utilities
│       └── types/         # TypeScript type definitions
└── shared/            # Shared types between main & renderer
```
