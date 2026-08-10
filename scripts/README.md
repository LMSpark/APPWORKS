# 脚本目录索引

`scripts/` 存放面向仓库维护的命令行脚本，主要负责前端开发、构建、发布和验证，不承载运行时业务逻辑。

## 编译流水线（分层）

```text
开发 (pnpm run dev)
  Vite dev (alias → packages/*/src；/api 代理到 LOWCODE_GATEWAY_URL)

前端生产 (pnpm run build:fe)
  ensure:class-model-bundle → vite build (根应用；不预构建 packages dist)

完整发布 (pnpm run build)
  build-all.mjs → build-packages.mjs + build-frontend.mjs

npm 包 (pnpm run build:packages)
  build-packages.mjs → 按依赖拓扑串行构建 packages/* (vite JS + tsc/vue-tsc .d.ts)
  默认跳过未变更包（dist/.spark-build-stamp.json）；--force 全量重建

日常门禁 (pnpm run verify)
  typecheck → lint → verify:rules（alias 指向 packages/*/src，无需 dist）

发布/产物门禁 (pnpm run verify:dist)
  build:packages → typecheck → lint → verify:rules

ClassModel 编译 + 运行时 (generate:class-model-surface)
  L1：emit 前 mtime 规划 → manifest 全未变则跳过 emit+投影（~3s）；否则内存 emit → 仅 changed shard 投影
  诊断：node --import tsx scripts/generate-dts-class-model.mjs --plan-only
  → generated/dts-class-model/*.json
  → 浏览器 Worker (Comlink) 按需 fetch manifest/shard
  → refreshBundle 可触发 --model 增量编译 + loader.reload()
  详见 docs/build-pipeline-audit.md §五（官方 TS incremental / createIncrementalProgram）

ClassModel 全量门禁 (verify:class-model:full)
  generate:class-model-surface → verify-class-model-guide-json-schema.mjs → verify:class-model → typecheck
  （读 packages/*/src，无需先 build:packages）
```

**关键约定**

- 根 `vite.config.ts` 通过 alias 指向 `packages/*/src`；日常 dev / `build:fe` **不需要**先 `build:packages`。
- `packages/*/dist` 仅服务 npm 发布与消费者；`publish:packages` 会先跑 `build-packages`。
- 编译期 `.d.ts` 仅在内存存在（虚拟前缀 `class-model-emit/`）；落盘 manifest 键与 shard 使用源码 repo 相对路径（`packages/.../foo.ts` → `files/packages/.../foo.ts.json`）；产物目录为 `generated/dts-class-model/**/*.json`。
- `generated/dts-class-model/` 已入库（编译 SSOT，可人工评审）；Vite 插件 dev/build 映射到 `/dts-class-model/`。
- `ensure:class-model-bundle` 在 manifest 缺失时 generate，并 `assertClassModelBundleComplete`。
- ClassModel 运行时知识在 Web Worker 内按需加载；编译 refresh 见 `scripts/lib/class-model-knowledge-refresh.mjs`。
- `E:\lowcode-jdk17` 永久只读且不参与本仓构建；本仓只通过前端 API 合同消费其现有接口。

## 目录内容

- `build-shared.mjs`：`runCommand` 与构建路径常量。
- `build-all.mjs`：workspace 包 + 前端生产构建。
- `build-frontend.mjs`：根 Vite 生产构建。
- `build-packages.mjs`：workspace 包拓扑构建（`--only pkg1,pkg2` / `--dry-run`）。
- `publish-packages.mjs`：构建并发布 `@spark-appworks/*`。
- `verify-model-convergence-offline.mjs`：模型收敛离线验收。
- `generate-dts-class-model.mjs`：ClassModel 编译（内存 emit → JSON bundle；`--model` 增量）。
- `lib/class-model-knowledge-refresh.mjs`：Node 宿主 refreshBundle 回调（触发 targeted compile）。
- `lib/class-model-bundle-assert.mjs`：guide manifest + shard 完整性；`assertClassModelGuideExecutableSchemas` 供全量门禁。
- `verify-class-model-guide-json-schema.mjs`：`verify:class-model:full` 的 jsonSchema-only 校验。
- ClassModel 编译期 TS API：`packages/spark-ai/src/class-model/class-model/build-index.ts`（禁止浏览器 import）。

## 编译管线调试

关键步骤已埋 `buildDebugBreak()`（`scripts/lib/build-debug.mjs`）。**仅**在 Cursor/VS Code 通过调试器启动（Node inspector 已附加）时才会在 `debugger` 处停住；日常 `pnpm run build:*` 不受影响。

**推荐用法**

1. 打开 **Run and Debug**（复制 `.vscode/launch.json.example` → `.vscode/launch.json`）。
2. 选择配置，例如 `Build: packages (dry-run)` 或 `Build: ClassModel generate (full)`。
3. F5 启动；在 `[build-trace]` 日志对应步骤自动断点，或在脚本里自行加 IDE 断点。

| Launch 配置 | 对应流水线 |
|-------------|-----------|
| `Build: packages (dry-run)` | 拓扑顺序，不实际编译 |
| `Build: packages (force, spark-utils)` | 单包强制重建 |
| `Build: frontend pipeline` | ensure bundle → vite build |
| `Build: ensure ClassModel bundle` | manifest 检查 / generate / assert |
| `Build: ClassModel generate (full)` | 内存 emit → JSON bundle |
| `Build: vite build (root FE only)` | 仅根 Vite 生产构建（含 closeBundle 拷贝） |
| `Attach: Node (port 9229)` | 终端 `node --inspect-brk=9229 scripts/...` 后附加 |

仅看步骤日志、不断点：`SPARK_BUILD_TRACE=1 pnpm run build:packages`

## 放置原则

- 需要被仓库维护者显式执行的脚本放这里。
- 脚本以“可重复执行”和“命名可识别”为优先，避免出现语义不清的临时文件名。
- 一次性试验脚本如果要长期保留，应转成可维护的验证脚本；否则应删除。
- 本地调试、个人环境切换、恢复包、缓存、一次性视频/演示生成脚本不要提交到仓库。
