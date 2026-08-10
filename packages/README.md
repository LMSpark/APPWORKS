# 包目录索引

`packages/` 是 SPARK 的 monorepo 工作区。这里按“运行时包、AI 相关包、构建期包、插件包”分层组织，而不是把所有能力都堆在根应用里。

## 运行时主包

- [spark-app/README.md](spark-app/README.md)：应用壳启动、路由、插件、日志与页面宿主（壳导航消费形状）。
- [spark-component/README.md](spark-component/README.md)：组件系统、能力链、渲染容器。
- [spark-data/README.md](spark-data/README.md)：DataSet、DataView、关系、树、聚合与渲染侧权限快照形状。
- [spark-project-model/README.md](spark-project-model/README.md)：项目蓝图编辑树、页面四文件实现轴、脚本上下文。
- [spark-lowcode-api/README.md](spark-lowcode-api/README.md)：对接 lowcode-jdk17 的前端 API（后端记录与端点合同、数据空间、权限、会话、实时）。
- [spark-json-document/README.md](spark-json-document/README.md)：JSON Schema / 文档树编辑（JSON 类型与校验 SSOT）。
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
- 验证码：`SendCodeType` / `SendCodeScene` 台账与 `spark-lowcode-api` 同形（`verify:send-code-parity`）；门面子集 `LowcodeVerificationScene = Extract<…>`；禁止 `LowcodeVerificationChannel`。
- 查询 wire 字面量：`OrderType` / `WireFilterOperator` / `GroupFunType` 台账与 `spark-lowcode-api` 同形（`verify:wire-query-parity`）；前端 `FilterOperator`/`SortDirection`/`AggregateType` 仅 spark-data（`AggregateType` 额外含 `join`）；投影仅宿主 `lowcode-data-space-assembler`。
- 实现闸门：`ProjectBlueprintImplGate` 仅 `spark-project-model`；禁止宿主 `PageDesignImplGate` 与薄包再导出。
- DataSpace 资源类型：CN wire 映射仅 `data-space-resource-type-wire.ts`；目录为 `Extract<table|view>`；→ TableResourceType 仅宿主 frontend-model-adapter。
- 权限 → UI：唯一 mapper `src/lowcode/permission/lowcode-permission-to-data-permission.ts`。
- 平台数据定义 / 运行装配：`spark-lowcode-api` DataSpace + 宿主 `src/lowcode/data-space/*`（有 `PageDataSpaceBinding` 时运行真源）。
- 页面设计轴：`spark-project-model` 四文件（含 `pagedata.json`）；不得把 pagedata 当已绑定页面的运行数据真源。

## 维护约束

- 新增工作区包时，必须同步更新这里和根 [../README.md](../README.md)。
- 运行时逻辑优先放进现有包，避免在根 `src/` 再长出平行基础设施。
- 构建期工具与运行时包分开维护，不把构建脚本塞进运行时源码目录。
- `backend-api-contracts/` 在仓库根目录：lowcode 端点台账与 characterization 样本，不是可运行客户端；勿与 `spark-lowcode-api` 混淆。
