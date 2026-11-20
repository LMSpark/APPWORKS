---
name: appworks-verify-change
description: 当 SPARK AppWorks 的变更已实现，需要决定该跑哪些 typecheck、lint、vitest、verify:* 检查，用户要求验证、"跑一遍检查"、"确认改动没问题"，或要做阶段 6 出口验证、核对验证计划是否全部完成时使用。
---

# 验证 AppWorks 变更（只读）

按真实影响面选择检查，证明已批准的范围，并列出未验证项。不得用一个窄的绿色测试冒充整体完成。

## 边界

- 只读：除被 ignore 的测试/构建产物外不改任何文件；不修失败、不 commit、不清理用户文件。
- 没有"修改前同命令同范围同错误签名"的证据，不得标 `pre-existing-failure` 或 `introduced-failure`，只能标 `failed`。
- 适用但没跑的检查必须标 `not-run` 并写具体原因，不得隐藏。
- 验证中途发现要修复，停下来回到根 `AGENTS.md` 流程，验证保持只读。

## 状态词汇

| 状态 | 条件 |
| --- | --- |
| `passed` | 命令成功 |
| `failed` | 命令失败且归因未证明，或没有基线 |
| `not-run` | 适用但未运行，写明原因 |
| `pre-existing-failure` | 有修改前同命令、同范围、同错误签名的证据 |
| `introduced-failure` | 修改前通过，或当前改动能因果解释新错误签名 |

总体结论：存在 `failed` / `introduced-failure` → 失败；否则存在必需项 `not-run` 或 `pre-existing-failure` → 部分通过（partial）；全部必需项 `passed` 且无未验证项 → 通过。全量门禁被已证明的既有失败阻断时，即使聚焦检查全绿，也保持 partial。

## 流程

1. **建立范围与基线**：读对应 `notes/plan-*` 的影响范围、验证计划和验收标准；`git status`、`git diff --stat` 看实际改动；需要基线时，只在用户同意后用干净 worktree 或原提交复跑同一命令；不得为取基线而 stash、回滚用户的改动。
2. **映射影响面**：把每个改动的包、公共出口、消费者、运行边界映射到下表检查。
3. **按固定顺序运行**（`knowledge/testing.md`）：`typecheck` → `lint` → `test`，再跑定向 `verify:*`。禁止跳过 typecheck 直接跑测试。
4. **归类每项结果**，对失败项对比基线再分类。
5. **输出报告**。

## 影响面 → 最小验证

| 影响面 | 最小验证 | 扩展验证 |
| --- | --- | --- |
| 单个函数/文件 | 对应 focused 测试 `pnpm exec vitest run <path>` + `pnpm run typecheck` | `pnpm run lint` |
| 单个包 | 先看该包 `package.json` 的 scripts。多数包用 `pnpm --filter @spark-appworks/<pkg> run test:run`，再加该包 typecheck/lint。`spark-json-document` 没有 `test`/`test:run`；`vite-plugin-spark-catalog` 没有 `test`/`test:run`/`lint`，这两包只跑它们实际声明的脚本 | `pnpm run build:packages` |
| 公共包 API / 包导出 | 包级 typecheck + test，消费者冒烟 | `pnpm run verify:arch`、`pnpm run verify:deps` |
| `packages/spark-ai`（Agent Workflow） | 包级 typecheck/lint/test | `pnpm run verify:class-model`、`pnpm run verify:workflow-designs`、`pnpm run verify:ai-business-boundaries`、`pnpm run verify:ai-model` |
| ClassModel / 模型 class 字段或 JSDoc | 先 `pnpm run generate:class-model-surface`，再 `pnpm run verify:class-model` | `pnpm run verify:class-model:full` |
| 页面设计 / 页面配置 | `pnpm run verify:page-design`、`pnpm run verify:pages-config` | 相关 focused 测试 |
| 项目规划 / 导航 / 项目模型 | `pnpm run verify:project-planning`、`pnpm run verify:model-convergence` | `pnpm run verify:project-blueprint-ssot` |
| `spark-lowcode-api` / 契约 | 包级 test | `pnpm run verify:lowcode-contracts`、`pnpm run verify:ajax-result-parity`、`pnpm run verify:wire-query-parity`、`pnpm run verify:send-code-parity` |
| 新增/移动文件、命名、接口 | `pnpm run verify:ai-codegen`、`pnpm run verify:arch` | `pnpm run verify:rules` |
| 仅文档 | `pnpm run verify:docs` | 人工预览 |
| 跨包 / 架构 | focused 测试 + `pnpm run typecheck` | `pnpm run verify`（typecheck + lint + verify:rules），必要时 `pnpm run verify:dist` |
| 前端运行行为 | 相关 vitest | 浏览器验证：直接 URL、关键状态、安全交互（无业务副作用） |

要点：
- `verify:rules` 可能被既有 `verify:arch` 问题提前阻断；此时记录 arch 的阻断项，再对本次触及的规则域跑定向命令，确认没有新增违规（见 `knowledge/testing.md`）。
- 新增测试文件时，检查目录文件数是否超过 10 个。
- 不要为拉长报告而跑无关命令。

## 输出

```markdown
## 验证报告
- 范围：方案文件 / 改动包与文件
- 基线：既有失败（命令 + 错误签名）或"无可比较基线"
- 检查表：
  | 检查 | 命令 | 状态 | 证据（退出码/关键输出） | 归因 |
- 未验证项：适用但未运行的检查及原因
- 总体结论：passed / partial / failed
- 未被支持的完成声明：哪些说法目前缺证据
```

只有"总体 passed 且未验证项为空"才满足验证出口。验证报告交回根 `AGENTS.md` 阶段 6/7；需要审查时再用 `appworks-review-change`。
