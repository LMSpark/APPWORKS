# 快速开始

## 环境

- Node.js 22.13+
- pnpm 11
- 可访问的 lowcode-jdk17 gateway

```powershell
pnpm install --frozen-lockfile
$env:LOWCODE_GATEWAY_URL='http://127.0.0.1:8080'
pnpm run dev
```

打开 Vite 输出的本地地址。AppWorks 只启动前端；开发态 `/api` 由 Vite 代理到显式 gateway。

## 验证

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:all
pnpm run verify:rules
pnpm run build
```

## 运行链

```text
lowcode session
  -> enterprise + active application
  -> complete project blueprint
  -> authorized runtime navigation
  -> Vue route or configuration page
  -> FormKey + data space + frontend model
  -> backend permission result
```

项目蓝图是项目策划事实，运行导航只是其授权输出。页面文件通过 `createLowcodeProjectGateways(projectId)` 注入 `ProjectWorkspace`，业务代码不拼接旧页面配置或导航端点。

## 包级验证

```bash
pnpm --filter @spark-appworks/spark-lowcode-api run typecheck
pnpm --filter @spark-appworks/spark-lowcode-api run test:run
pnpm --filter @spark-appworks/spark-project-model run typecheck
pnpm --filter @spark-appworks/spark-project-model run test:run
```

## 现场恢复

如果为了交付清理了 `node_modules/` 和 `dist/`：

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
```
