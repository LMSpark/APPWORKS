# Contributing to SPARK AppWorks

感谢你的贡献！本文件包含提交流程、代码质量要求和提交信息规范的快速说明。

## 开发准备

- 克隆仓库并安装依赖：
  ```bash
  git clone <repo>
  pnpm install
  ```
- 本地开发：
  ```bash
  pnpm run dev
  ```

## 质量检查（必须通过）

在提交或打开 PR 之前，请确保：

- 类型检查：`pnpm run typecheck`
- 静态检查（ESLint）：`pnpm run lint`
- 单元测试：`pnpm run test`

## 提交信息规范（Conventional Commits）

本仓库约定使用 Conventional Commits 格式。

格式：
```
<type>(<scope>): <short description>

<body> (可选)

<footer> (可选)
```

- 常用 `type`：`feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `style`, `ci`, `build`, `revert`
- 允许的 `scope`（仓库约定）：
  - `deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-ai`, `spark-component`, `spark-utils`, `spark-project-model`

示例：
```
feat(spark-data): add createDataView factory

- add factory wrapper for DataView
- update API docs and tests
```

## Pull Request 指南

- 将变更推送到 feature 分支并发起 PR 到主分支或目标分支
- PR 描述应包含变更说明、关联 Issue（如有）、兼容性与迁移信息（若破坏性变更）
- 添加或更新相应的测试和文档

## 其他约定

- 提交前请运行 `pnpm run verify`（typecheck + lint + verify:rules；不预构建 packages dist）
- 发布 npm 包或验证 dist 产物前运行 `pnpm run verify:dist`（含 `build:packages`）
- 对于 Breaking Change，请在 PR 标题或正文中明确标注并在 CHANGELOG 中记录

感谢你的贡献 — 任何问题请先在 Issue 中讨论。
