# 项目蓝图模型收敛验收

本清单验证 AppWorks 已把项目设计事实收敛到项目蓝图，并把运行菜单限定为蓝图的一种授权输出。AppWorks 不拥有数据库迁移宿主，也不直接执行 MySQL、达梦或容器内 SQL。

## 1. 离线门禁

```bash
pnpm run verify:model-convergence
pnpm run typecheck
pnpm run test:run
```

期望：不存在旧项目根模型、旧导航真源、独立子页面类型或页面本地权限决策。

## 2. 身份与迁移边界

- 既有项目、节点、FormKey、数据空间和前端模型身份由 lowcode 平台数据库保持。
- AppWorks 只生成只读审计、characterization 和待执行差异，不生成新身份补齐缺口。
- 数据库迁移由平台运维流程执行，不能通过 AppWorks 构建或启动过程隐式触发。
- 业务 mutation 必须使用原 query context 的凭据与权限；文件保存必须明确报告读回结果，不能承诺后端没有提供的事务或补偿。

## 3. DevSystem 项目蓝图

前置：`pnpm run dev`，登录后打开 DevSystem 并加载一个真实项目。

| 步骤 | 操作 | 期望 |
|------|------|------|
| 3.1 | 查看左侧结构 | 显示项目蓝图层级，不把全部节点称为菜单 |
| 3.2 | 选择模块、需求、原型、数据空间、页面或报表节点 | 基本信息与该节点 capability 对齐 |
| 3.3 | 选择真实页面 | PageTool 与场景独立；PageRuntime 只消费声明场景，正式 modelId/模型Name 由装配校验 |
| 3.4 | 选择子页面 | 子页面属于蓝图层级；是否输出到运行菜单由运行投影决定 |
| 3.5 | 尝试无治理写能力的保存 | 明确报错并保留本地 dirty 状态，不静默成功 |

## 4. 页面设计门禁

| 步骤 | 操作 | 期望 |
|------|------|------|
| 4.1 | 页面有效描述为空时启动 AI 编辑 | mutation 被 gate 拒绝 |
| 4.2 | 补齐描述后重试 | 经 ProjectWorkspace 编辑 PageTool 三文件；场景编辑必须明确 scenarioId |
| 4.3 | `implGate=closed` | 页面设计 mutation 拒绝 |
| 4.4 | 检查数据绑定 | 页面不直接引用物理表名，不拥有第二份数据定义 |

离线覆盖：`pnpm run verify:page-design`。

## 5. 项目策划与 AI

| 步骤 | 操作 | 期望 |
|------|------|------|
| 5.1 | 运行 `pnpm run verify:project-planning` | 离线验证通过 |
| 5.2 | 查看策划输入 | 输入和产物统一使用 blueprint 语义 |
| 5.3 | 执行 Agent run | 使用传输中立的 `ai-agent-run`；不依赖本仓后端 |
| 5.4 | 请求保存蓝图 | 缺少受治理 mutation capability 时 fail-closed |

## 6. 运行导航

| 步骤 | 操作 | 期望 |
|------|------|------|
| 6.1 | 加载应用壳 | 只消费后端授权后的 `RuntimeNavigation` |
| 6.2 | 访问普通 Vue 页面 | Vue 路径只负责组件寻址，场景身份来自真实 FormKey |
| 6.3 | 查看模块、外链或动作页 | 不机械创建数据空间 |
| 6.4 | 后端权限快照缺失 | 页面字段和动作 fail-closed |

离线覆盖：`packages/spark-app` 运行导航测试及 `packages/spark-component` 权限测试。

## 7. Characterization

- `backend-api-contracts/lowcode-endpoint-ledger.json` 由 lowcode 只读源码生成。
- `backend-api-contracts/appworks-consumer-ledger.json` 记录 AppWorks 直接消费者。
- `backend-api-contracts/characterization-fixtures/` 仅用于旧行为对账，不是运行时回退源。
- `E:\lowcode-jdk17` 永久只读，不作为编译依赖。

全部门禁通过且浏览器逐导航验收无阻断缺陷后，项目蓝图模型才可视为可交付。
