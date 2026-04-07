## 打包说明

- 开发构建：`pnpm build`
- macOS DMG：`pnpm dist:mac`
- Windows EXE：`pnpm dist:win`
- 当前通用打包入口：`pnpm dist`

## 打包约定

- electron-builder 配置文件位于 `electron-builder.yml`
- macOS entitlements 位于 `build/entitlements.mac.plist` 和 `build/entitlements.mac.inherit.plist`
- 安装包只收录 `out/**` 和运行所需 package 元数据
- Whisper / 翻译模型不会打入安装包，继续按需下载到用户本地缓存目录
- `release/` 为打包输出目录，不纳入版本控制