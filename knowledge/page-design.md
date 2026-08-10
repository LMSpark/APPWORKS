# 页面设计

### 四文件内存编辑——不直接操作文件

- **场景**：AI 修改页面设计内容（规则、数据集、脚本、样式）
- **规则**：通过 `model_script` 调用 `editDataSet` / `editNodeTree` / `editRule` 等方法操作内存模型，不直接读写磁盘文件。四文件（rule.json + dataSet.json + script.ts + style.css）是落盘产物，不是编辑入口。
- **违反后果**：直接操作文件 → 绕过内存模型，丢失运行时状态，与 Vue 响应式脱钩，用户看到的内容与磁盘不一致

### 落盘由 ProjectWorkspace 编排

- **场景**：AI 完成编辑后想确认数据已持久化
- **规则**：落盘由 `ProjectWorkspace.save*` 系列方法编排，不是模型自身的方法。AI 不应假设 save 时机，也不应在未调用 save 的情况下通知用户"已完成"。
- **违反后果**：假设 save 时机 → 数据未持久化就通知完成，用户刷新页面丢失改动

### ConfigPageNode 是配置页入口

- **场景**：AI 需要操作某个页面的配置
- **规则**：通过 `ProjectModel.openPageDesign(pageId)` 获取 `ConfigPageNode` 实例。它包含 rule、dataSet、script、style 四个子模型。不要尝试从其他路径获取页面配置。
- **违反后果**：绕过 `openPageDesign` 获取的实例可能缺少闸门初始化，导致权限检查或状态同步失败

### 树结构用 items[] + parentId

- **场景**：AI 需要操作节点树（如添加、移动、删除节点）
- **规则**：树结构用 `items[]` + `parentId` 平铺表示，不用嵌套 `children` 当真源。所有树操作通过 `SparkNodeTree` 的方法（`addNode`、`removeNode`、`moveNode`），不要自己组装 children 结构。
- **违反后果**：用嵌套 children 当真源 → 树操作（移动、插入）复杂度爆炸，与现有工具链不兼容，操作后 parentId 与 children 不一致

### AI 与 Vue 共享同一实例

- **场景**：AI 修改模型字段后，用户界面需要立即反映
- **规则**：AI 与 Vue 共享同一模型实例，写字段或调 API 即可，不需要 draft、不需要 projection DTO、不需要手动触发 UI 更新。
- **违反后果**：创建副本/draft 修改 → 修改不会反映到 UI，用户看不到变化；手动触发更新 → 与 Vue 响应式系统冲突

### rule.json 的特殊结构

- **场景**：AI 修改页面规则配置
- **规则**：`rule.json` 不是自由结构，有严格的 schema 约束（条件表达式、权限规则、联动规则各有固定格式）。修改 rule 时应通过 `ConfigPageNode` 的 rule 子模型 API，不要直接拼 JSON。
- **违反后果**：拼出的 JSON 不符合 schema → 前端解析报错或运行时行为异常

### 有 PageDataSpaceBinding 时运行 DataSet 不以 pagedata 为真源

- **场景**：配置页蓝图节点带齐 `formKey + dataSpaceId + modelId`（`PageDataSpaceBinding`），运行态打开该页
- **规则**：运行态 DataSet 只经宿主 `loadBoundDataSpaceDataSet`（DataSpace 设计 + `PermissionRuntimeSnapshot` → `LowcodeDataSpaceAssembler`）装载。`pagedata.json` 仅属设计/AI 轴与无绑定预览；`SparkPageRenderer` 在 binding 存在时必须调用注入的 `loadRuntimeDataSet`，禁止再用四文件 hydrate 当运行数据。
- **违反后果**：设计器草稿与平台权限/模型双真源并行 → UI 授权与查询结果和平台不一致；缺装载器时 fail-closed 抛错
- **发现来源**：2026-08 系统结构 SSOT 归并（批次 F）
