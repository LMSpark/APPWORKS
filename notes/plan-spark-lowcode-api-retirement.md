状态：draft

# spark-lowcode-api 语义退役计划

## 任务目标

删除独立 `packages/spark-lowcode-api/` 项目，将能力按语义并入 SPARK Data、正式领域包与宿主适配层；所有业务查询、保存和 owner 执行只经 SPARK Data。

## 阶段与业务语义

### G0：冻结边界

- 固定 DataTable owner adapter 合同。
- 明确 `spark-lowcode-api` 不得继续新增公共 API。
- 生成完整 import/consumer 清单并登记迁移目标。

### A：数据空间并入 SPARK Data

- DataTable 拥有资源、模型、接口、CRUD 和 owner adapter。
- DataView 持有查询上下文、权限、dirty、保存和 receipt。
- 迁入 query/save/runtime owner、permission baseline、save order/guard/result。
- 低代码 wire adapter 仅把协议封装为 DataTable/DataView owner。

### B：wire 与平台合同分离

- AjaxResult、SendCode、WireFilterOperator、GroupFunType 等归 `backend-api-contracts`。
- parity scripts 改验证新归属，不再以 `spark-lowcode-api` 为事实源。
- consumer ledger 生成路径改指目标源码。

### C：领域包合并

- 蓝图领域/验证归 `spark-project-model`。
- Agent turn/config/data-entry 编排归 `spark-ai`。
- 通用 HTTP/error/cache 原语归 `spark-utils`。
- 只保留跨边界必要导出。

### D：宿主适配迁移

- 会话、应用上下文、平台/权限设计、目录、文件上传和特定业务资源归 `src/lowcode`。
- 这些服务不得向页面开放第二套数据查询/保存。
- 每个 adapter 通过 `DataSet/DataTable/DataView` 装配后消费。

### E：兼容桥与消费者切换

- 必要时短期保留仅类型/重导出的兼容入口。
- 禁止保留第二套 runtime/query/save 实现。
- 按消费域批量改 import 和测试内部路径。

### F：删除项目

- 删除 `packages/spark-lowcode-api/`。
- 清理根 package、pnpm lock、TS/Vite/Vitest/ESLint alias。
- 重新生成 consumer ledger、ClassModel 与相关产物。
- 全仓搜索包名引用归零；仅允许明确历史文档。

## 影响范围

### 进入 spark-data

- `packages/spark-lowcode-api/src/platform/data-space/runtime/**`
- 相关 query/save/protocol/permission 实现与测试
- DataTable owner adapter、DataView owner 生命周期、request scope

### 进入 spark-project-model

- `platform/project-blueprint/**` 中的领域模型、归一化、版本与验证
- 仅保留宿主 adapter 在 `src/lowcode`

### 进入 spark-ai

- `realtime/ai-turn-*`
- `realtime/agent-config/**`
- `realtime/data-entry/**`
- realtime 中 Agent 事件/ack/session 部分

### 进入 src/lowcode

- `lowcode-api.ts` 中需拆分的宿主装配
- `platform/lowcode-platform-api.ts`
- session/application store
- catalog/design/permission/resources
- upload、enterprise initialization、workflow、cache/data recovery、PDF 等服务 adapter

### 进入 backend-api-contracts

- `contracts/**`
- 平台 wire 类型与 parity 对照事实

### 删除/更新

- `packages/spark-lowcode-api/package.json`
- package `README/tsconfig/vite/vitest/eslint`
- 根 `package.json`、`pnpm-lock.yaml`
- `tsconfig*.json`、`vite.config.ts`、`vitest.config.ts`、`eslint.config.js`
- `generated/dts-class-model/**`
- `backend-api-contracts/appworks-consumer-ledger.json`
- `.cursor/skills/appworks-verify-change`
- `AGENTS.md`、`README.md`、架构文档

## 技术方案

1. 为 spark-data 增加稳定 owner adapter 接口，按 DataTable 绑定、按 DataView 隔离状态。
2. 迁移 DataSpace runtime owner，不迁移低代码 `LowcodeApi` 门面。
3. 将 backend query/save request scope 从宿主注入，不让 spark-data 依赖平台会话包。
4. 按资源族迁移资源 owner，先保留现有 wire 兼容。
5. 将公开导出按领域替换为目标包/宿主导入。
6. 建立全仓 import 计数基线，每阶段要求相关域引用归零。
7. 最后删除项目并重新生成派生。

## 验证计划

### 每个迁移阶段

```powershell
pnpm run typecheck
pnpm --filter @spark-appworks/spark-data run test:run
pnpm --filter @spark-appworks/spark-project-model run test:run
pnpm --filter @spark-appworks/spark-ai run test:run
pnpm exec vitest run <迁移域测试>
pnpm run verify:ajax-result-parity
pnpm run verify:send-code-parity
pnpm run verify:wire-query-parity
pnpm run verify:lowcode-contracts
```

### 删除包前

```powershell
rg -n "spark-lowcode-api" --glob "!generated/**" --glob "!notes/**"
pnpm run verify:deps
pnpm run verify:arch
pnpm run generate:class-model-surface
pnpm run verify:class-model
pnpm run verify:rules
pnpm run test:all
git diff --check
```

包名字符串引用需归零，保留的历史记录须明确标注且不参与构建。

## 兼容性

- 旧公开导入可短期通过只读重导出桥过渡。
- 禁止兼容桥继续实现 query/save/runtime。
- `DataSpaceRuntimeApi` 迁移完成前不得删除原测试。
- 平台会话、导航与应用目录不迁入 spark-data。
- 领域数据不因包删除而改变 scenario、model、view 或 row key。

## 风险项

- 160 个文件、数百个消费者，跨包迁移面广。
- 当前工作树有大量未提交底座改动与生成物。
- session/application scope 及 owner recovery 容易被错误搬到错误层。
- wire parity 与 consumer ledger 必须同步。
- 不能仅删除包名而把实现散落成多个业务旁路。

## 停止条件

1. 某能力找不到唯一目标归属。
2. 页面或宿主需要直接调用迁移后的非 SPARK Data 数据接口。
3. 同一 query/save/permission 语义出现第二实现。
4. spark-data 被迫依赖 Vue、平台会话或特定业务资源。
5. 测试只通过兼容导入，真实消费者未切换。
6. 删除包后 alias、ledger、ClassModel 或 lockfile 仍保留真实构建依赖。

