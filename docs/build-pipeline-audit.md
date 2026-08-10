# SPARK AppWorks 构建管线

> 当前事实源：根 `package.json`、`scripts/README.md`、各包 `package.json` 与 `generated/dts-class-model/`。

## 管线总览

AppWorks 是 pnpm 前端 monorepo，不编译、启动或部署服务端。

| 流水线 | 入口 | 作用 |
|---|---|---|
| 开发 | `pnpm run dev` | 启动 Vite；`/api` 代理到显式 `LOWCODE_GATEWAY_URL` |
| 前端生产 | `pnpm run build:fe` | 校验 ClassModel bundle 后构建根应用 |
| 包构建 | `pnpm run build:packages` | 按 workspace 依赖拓扑构建可发布包 |
| 完整构建 | `pnpm run build` | 依次执行包构建与前端构建 |
| 日常验证 | `pnpm run verify` | typecheck、Lint 与全部规则门禁 |
| 发布验证 | `pnpm run verify:dist` | 构建包后执行日常验证 |
| ClassModel | `pnpm run generate:class-model-surface` | 从源码投影 `generated/dts-class-model/` |

```text
Dev / build:fe / verify
  -> Vite 与 TypeScript alias 直接读取 packages/*/src

build:packages / publish:dry
  -> packages/*/dist

generate:class-model-surface
  -> generated/dts-class-model（入库 SSOT）
```

## 开发入口

开发态必须配置 gateway：

```powershell
$env:LOWCODE_GATEWAY_URL='http://127.0.0.1:8080'
pnpm run dev
```

变量缺失时 Vite fail-fast，防止 `/api` 被误发到未知宿主。浏览器产品代码继续只使用同源 `/api`。

## 包构建

`scripts/build-packages.mjs` 从 `packages/*/package.json` 推导依赖顺序，按需复用 `dist/.spark-build-stamp.json`。当前可发布主线为：

```text
spark-utils
  -> spark-json-document
  -> spark-ai
  -> spark-data
  -> spark-project-model
  -> spark-component
  -> spark-app
  -> spark-lowcode-api
```

`vite-plugin-spark-catalog` 没有 build script，只作为工作区源码工具被消费。

## ClassModel 生成与发布

- `generated/dts-class-model/manifest.json` 与 `files/**/*.json` 是浏览器运行时索引。
- `.dts-manifest.json` 是增量生成索引。
- `semantic-gaps.json` 是语义覆盖审计。
- `scripts/ensure-class-model-bundle.mjs` 在构建前验证 manifest 与 shard 完整性。
- `tools/vite-plugin-class-model-static.ts` 在开发态映射 `/dts-class-model/**`，生产构建时复制到根 `dist/`。

生成物是受版本管理的运行 SSOT，不属于可随意清理的缓存。

## 发布

`scripts/publish-packages.mjs` 先执行包构建，再按依赖顺序运行 `pnpm publish`，确保 `workspace:*` 被正确替换。

```bash
pnpm run publish:dry
pnpm run publish:packages
```

发布前至少运行：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:all
pnpm run verify:rules
pnpm run build
pnpm run publish:dry
```

## 可清理与不可清理

可再生成：根 `dist/`、各包 `dist/`、`.eslintcache`、`node_modules/`。

不可当作缓存删除：

- `generated/dts-class-model/`
- `backend-api-contracts/`
- `config/agent-workflows/`
- 源码、测试和公共包 manifest

删除 `node_modules/` 后必须重新执行 `pnpm install --frozen-lockfile` 才能开发或验证。
