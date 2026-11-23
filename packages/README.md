# 包目录索引

`packages/` 是 SPARK 的 monorepo 工作区。这里按“运行时包、AI 相关包、构建期包、插件包”分层组织，而不是把所有能力都堆在根应用里。

## 运行时主包

- [spark-app/README.md](spark-app/README.md)：应用壳启动、路由、插件、日志与页面宿主（壳导航消费形状）。
- [spark-component/README.md](spark-component/README.md)：组件系统、能力链、渲染容器。
- [spark-data/README.md](spark-data/README.md)：DataSet、DataView、关系、树、聚合与渲染侧权限快照形状。
- [spark-project-model/README.md](spark-project-model/README.md)：ProjectBlueprint、PageTool 三文件、ScenarioViewFile 和 PageRuntime 调用生命周期。
- [spark-lowcode-api/README.md](spark-lowcode-api/README.md)：**待语义退役的过渡适配层**；数据执行向 `spark-data` 迁移，平台/会话/特定服务向 `src/lowcode` 迁移，wire 向 `backend-api-contracts` 收束。
- [spark-json-document/API.md](spark-json-document/API.md)：JSON Schema / 文档树编辑（JSON 类型与校验 SSOT）。
- [spark-utils/README.md](spark-utils/README.md)：公共底层工具、HTTP、Logger transport、capability 原语。

## AI 与构建期

- [spark-ai/README.md](spark-ai/README.md)：Agent、Workflow、ClassModel 工具与知识运行时。
- [vite-plugin-spark-catalog/README.md](vite-plugin-spark-catalog/README.md)：组件扫描配置与命名工具。
- `scripts/generate-dts-class-model.mjs`：`.d.ts` → `generated/dts-class-model`。

## SSOT 分层（防双真源）

- JSON Schema / 值类型：仅 `@spark-appworks/spark-json-document`。
- `ProjectBlueprintNodeKind`：仅 `@spark-appworks/spark-utils`（中间包禁止 re-export）；由 `pnpm run verify:project-blueprint-ssot` 守门。
- lowcode 蓝图：只保留 `LowcodeProjectBlueprintRecord` + `readRecords` / `readNavigationAuthorization`；禁止 lowcode 内聚合类或 `BlueprintRuntimeNavigation*`。
- 运行菜单：壳唯一合同 `RuntimeNavigation*`（`spark-app`）；根装配 `src/lowcode/lowcode-runtime.ts#assembleLowcodeRuntimeNavigation`（记录 ∩ 授权证据 → 壳导航）。
- 权限展示三态：`PermissionMode` 仅 `@spark-appworks/spark-utils`。
- 运行导航表面：`RuntimeNavigationItemKind` / `NavigationPlacement` / `NavigationRootPlacement` / `NavigationLinkTarget` / `NavigationContextConfig` 仅 `@spark-appworks/spark-utils`（蓝图交付投影与壳导航共用，禁止包内同形别名；根布局是完整 placement 的子集，不可混用）。
- 验证码：`SendCodeType` / `SendCodeScene` 以 `backend-api-contracts` 为 wire 真源；迁移期间仍用 `verify:send-code-parity` 核对旧 lowcode 子包兼容面。
- 查询 wire 字面量：`OrderType` / `WireFilterOperator` / `GroupFunType` 以合同台账为真源；前端 `DataViewFilterOperator`/`SortDirection`/`AggregateType` 仅 spark-data。过滤公开树、存储文本与 wire 转换统一由 spark-data 的 `DataViewFilterCodec` 承接，宿主不另建过滤 mapper。
- 实现闸门：`ProjectBlueprintImplGate` 仅 `spark-project-model`；禁止宿主 `PageDesignImplGate` 与薄包再导出。
- DataSpace 资源类型：CN wire 映射仅 `data-space-resource-type-wire.ts`；目录为 `Extract<table|view>`；→ TableResourceType 仅宿主 frontend-model-adapter。
- 权限 → UI：唯一 mapper `src/lowcode/permission/lowcode-permission-to-data-permission.ts`。
- 平台数据定义 / 运行装配：SPARK Data 的 DataTable owner adapter + 宿主 `src/lowcode/data-space/*`。现有 `spark-lowcode-api` DataSpace 仅作迁移兼容层，不再新增并行 API。
- 页面工具：`spark-project-model` 的 `PageTool` 仅有 rule.json / script.js / style.css；`ScenarioViewFile` 独立持有场景视图配置。`PageRuntime` 按每次调用装配数据，工具 ID、蓝图节点 ID 与场景 ID 分离。

## 底座测试顺序

Monorepo 中 `spark-json-document` 依赖 `spark-utils`。包内 vitest 与根 `vitest.config.ts` 均按 **utils → json-document** 解析源码 alias；快速门禁：

```bash
pnpm run test:foundation:run
```

等价于依次执行 `@spark-appworks/spark-utils` 与 `@spark-appworks/spark-json-document` 的 `test:run`。

## 维护约束

- 新增工作区包时，必须同步更新这里和根 [../README.md](../README.md)。
- 运行时逻辑优先放进现有包，避免在根 `src/` 再长出平行基础设施。
- 构建期工具与运行时包分开维护，不把构建脚本塞进运行时源码目录。
- `backend-api-contracts/` 在仓库根目录：lowcode wire 与端点合同台账，不是可运行客户端。
- 独立 lowcode 包退役顺序见 `../notes/research-spark-lowcode-api-retirement.md` 与 `../notes/plan-spark-lowcode-api-retirement.md`。
