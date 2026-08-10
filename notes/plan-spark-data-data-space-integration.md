状态：superseded

替代原因：本计划直接把 lowcode `Base_DataModel_Relation` 作为两类关系合同使用，未建立明确的前端反腐适配边界。用户已选择纯前端适配且不改变后端结构；关系部分由 `notes/plan-adapt-legacy-model-relations-in-frontend.md` 替代，后续完整数据空间运行计划必须基于新合同重写。

## 任务目标

在 AppWorks 内建立 lowcode 数据空间到 `spark-data` 的完整只读运行链，以 `DataSpace -> DataSet`、`DataResource -> DataTable`、`FrontendModel -> DataView` 为唯一语义，替换页面本地 `pagedata.json` 真源，并让项目蓝图、开发系统、页面渲染与 AI dry-run 共用同一后端事实。

## 明确排除

- 不修改 `E:\lowcode-jdk17` 的任何文件、配置、数据库或部署状态。
- 不执行普通业务数据、数据空间、蓝图、导航或权限 mutation。
- 不新增 AppWorks Java/Node 服务端或薄壳转发服务。
- 不重建、改名或猜测现有 dataSpaceId、resourceId、modelId、FormKey。
- 不要求模块、外链、动作页等非 Vue 页面建立数据空间。
- 不删除现有前端业务页面或组件功能；AI 数据设计由写本地文件改为只读诊断与 dry-run 建议。
- `backend-api-contracts/characterization-fixtures/pages-config/` 保留为旧行为 characterization 输入，不作为新运行真源。

## 影响范围

### 1. lowcode 公共前端 API

- `packages/spark-lowcode-api/src/catalog/lowcode-catalog-api.ts`
  - 增加按稳定 ID 解析数据资源及字段的只读能力；只接受目录 readback 返回的资源主键。
- `packages/spark-lowcode-api/src/catalog/lowcode-catalog-api.test.ts`
  - 覆盖精确资源解析、歧义、缺失和字段类型读取。
- `packages/spark-lowcode-api/src/platform/data-space/data-space.ts`
  - 将内嵌资源模型规范化为独立资源、模型字段投影和模型关系合同；`resourceId` 变为已解析资源的必备身份。
- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`
  - 完整读取并保留 Base_DataSet、Base_DataModel、Base_DataModel_Field、Base_DataModel_Relation 语义；用资源目录精确 readback 解析资源和字段身份。
- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts`
  - 覆盖一个资源多模型、字段投影、两层关系、主模型证据和未解析资源 fail-fast。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`
  - 接收 DataView 提供的模型投影和查询上下文，返回可由 spark-data 原子登记的数据、总数、原始行和权限快照。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts`
  - 覆盖 FormKey 请求头、模型字段、筛选分页排序、allowAdd、五稀疏集合、lingma_sys_key 和异常响应。
- `packages/spark-lowcode-api/src/platform/data-space/data-space-api.ts`
  - 收束设计读取和运行查询门面，不暴露内部 wire helper。
- `packages/spark-lowcode-api/src/index.ts`
  - 只导出新的稳定数据空间合同与门面，删除被新合同替代的旧碎片导出。
- `backend-api-contracts/` 与 `tools/lowcode-contracts/generate-ledgers.mjs`
  - 本计划保持只读；现有账本与 fixture 只参与 characterization 和差分验证，不覆盖当前用户改动。若新合同使现有校验要求更新受保护账本，立即停止并另行审核。

### 2. spark-data 领域层

- `packages/spark-data/src/types.ts`
  - 为 DataView 增加后端无关的字段投影合同；扩展查询结果合同以携带同一次查询的权限快照；让资源关系可携带稳定 relationId，让视图依赖显式携带 parentViewId/childViewId 并引用具体资源关系。
- `packages/spark-data/src/metadata.ts`
  - 校验和恢复 DataView 字段投影；禁止引用 DataTable 不存在的资源字段。
- `packages/spark-data/src/data-table.ts`
  - 强化数据资源职责；保留共享 `crudService`，确保一个资源可拥有多个模型视图。
- `packages/spark-data/src/data-view.ts`
  - 以 viewId 承载 modelId；构造查询参数时带出字段投影和视图配置；识别查询结果快照并通过 `ingestPermissionSnapshot` 原子登记。
- `packages/spark-data/src/dataset.ts`
  - 修正现有 `ViewDependency` 在展开时硬编码 `default` 视图的限制；按显式 parentViewId/childViewId 绑定 modelId，按 relationId 精确绑定资源关系，并验证目标 DataView 已存在；显式依赖列表不再自动补造未声明的 default 依赖。
- `packages/spark-data/src/dataset-crud-tool.ts`
  - 让视图依赖的查询、更新和删除选择器覆盖父子 viewId 与资源关系 ID；歧义时 fail-fast，不按父子表返回第一条。
- `packages/spark-data/src/crud-service.ts`
  - 实际执行现有 `transformRequest/transformResponse` 策略，使 DataTable 共享 CRUD 定义能根据 DataView 参数构造后端请求并规范化响应。
- `packages/spark-data/src/index.ts`
  - 显式导出新的 DataView 投影与查询结果类型。
- `packages/spark-data/src/tests/data-table-responsibilities.test.ts`
  - 证明 DataTable 对应资源且可承载多个 modelId 视图。
- `packages/spark-data/src/tests/data-architecture-refactor.test.ts`
  - 固化 DataSet/DataTable/DataView 三层映射。
- `packages/spark-data/src/tests/dataset-request-orchestration.test.ts`
  - 验证 DataView 参数进入共享 CrudService、显式 modelId 父子视图依赖、真实异步父视图等待和请求次序。
- `packages/spark-data/src/tests/dataset-relation-rebuild.test.ts`
  - 验证命名 DataView 级联订阅按 parentViewId/childViewId 建立，default 视图不接收 lowcode 模型依赖。
- `packages/spark-data/src/tests/dataset-structure-crud.test.ts`
  - 验证同一资源对上的多模型依赖和多资源关系可精确增删改查，歧义选择器显式失败。
- `packages/spark-data/src/tests/dataset-crud-tool.test.ts`
  - 验证 CRUD 门面的完整视图依赖选择器与 relationId 定位。
- `packages/spark-data/src/tests/metadata-schema.test.ts`
  - 验证字段投影序列化、反序列化和非法引用失败。
- `packages/spark-data/src/tests/permission/runtime-permission-snapshot.test.ts`
  - 验证一次查询的数据、原始行、权限、总数与身份原子一致。
- `packages/spark-data/README.md`
  - 更新 DataSpace/DataSet、DataResource/DataTable、FrontendModel/DataView 的公共语义。

### 3. AppWorks lowcode 装配层

- 删除 `src/lowcode/lowcode-data-space-runtime.ts`
  - 删除只能加载单个模型、由调用方预建 DataTable 的旧桥接实现。
- 新增 `src/lowcode/data-space/lowcode-data-space-assembler.ts`
  - 将完整数据空间快照装配为一个 DataSet；按稳定 resourceId 去重 DataTable，按 modelId 建立 DataView，并分别装配两层关系。
- 新增 `src/lowcode/data-space/lowcode-data-space-crud-config.ts`
  - 为每个 DataTable 建立共享只读 CrudService 配置；通过 DataView 查询参数选择模型投影，构造 lowcode 请求与响应转换。
- 新增 `src/lowcode/data-space/lowcode-data-space-runtime.ts`
  - 以 `FormKey + dataSpaceId + modelId` 为入口读取设计、目录和运行数据，返回装配完成且目标视图已加载的 DataSet。
- `src/lowcode/lowcode-runtime.ts`
  - 在蓝图和运行导航转换中完整保留 formKey/dataSpaceId/modelId；只对真实 Vue 页面构造数据空间闭包。
- `tests/auth-nav/lowcode-data-space-runtime.test.ts`
  - 改为完整 DataSet 装配测试，覆盖资源去重、多视图、两层关系、权限与 fail-fast。
- `tests/auth-nav/lowcode-runtime-navigation.test.ts`
  - 验证运行菜单是蓝图输出，且不会为非 Vue 节点生成数据空间绑定。
- `tests/auth-nav/dynamic-router-platform-pages.test.ts`
  - 验证完整身份闭包进入 Vue 页面路由 meta。

### 4. 页面运行与组件

- 新增 `src/views/app/lowcode-page/LowcodePageRuntime.vue`
  - AppWorks 专属页面运行容器：解析路由闭包、加载数据空间 DataSet，并把成品 DataSet 交给通用渲染器。
- `src/main.ts`
  - 将平台页面默认运行容器切换为 `LowcodePageRuntime`，不再让通用渲染器读取本地 pagedata。
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`
  - 接收已经装配的 DataSet；移除从 `nodeProps.data` 初始化本地 DataSet 的路径；继续提供 PAGE_DATASET 和组件权限消费。
- `packages/spark-component/src/page/renderer/usePageDataSet.ts`
  - 从“解析 pagedata”改为管理外部 DataSet 生命周期、自动加载和自动选择，不包含 lowcode 依赖。
- `packages/spark-component/src/page/README.md`
  - 更新渲染器数据输入边界。
- `packages/spark-component/API.md`
  - 更新公开页面运行合同。
- `tests/page/spark-page-renderer-binding.test.ts`
  - 验证外部 DataSet 注入、DataViewKey、权限快照和缺失 DataSet 的显式错误。
- `tests/auth-nav/cross-project-ref-page.test.ts`
  - 验证跨项目引用页仍使用目标项目身份闭包加载数据空间。

### 5. 项目模型与 pagedata 真源退场

- 删除 `packages/spark-project-model/src/page/content/dataset-file.ts`
- 删除 `packages/spark-project-model/src/page/canonicalize-page-data.ts`
- `packages/spark-project-model/src/page/page-file.ts`
  - 从页面文件合同中删除 `pagedata.json`，只保留真实页面交付文件。
- `packages/spark-project-model/src/page/compile-files.ts`
  - 删除 pagedata 编译入口，只编译页面规则、脚本与样式。
- `packages/spark-project-model/src/page/config-page.ts`
  - 删除 `PageDataSetFile/editDataSet/getDataSetTool`；保留并严格校验数据空间绑定。
- `packages/spark-project-model/src/page/runtime-page.ts`
  - 运行页面不再加载 pagedata 文件。
- `packages/spark-project-model/src/project/project-types.ts`
  - 删除 pageDataJson 投影字段，增加只读数据空间状态投影所需的后端无关类型。
- `packages/spark-project-model/src/project/project-model.ts`
  - 删除本地 DataSet 编辑/解析/dirty API；页面仍保留规则、脚本、样式和蓝图能力。
- `packages/spark-project-model/src/project/project-workspace.ts`
  - 删除 pagedata 加载、保存和版本链；不新增本地数据空间持久化。
- `packages/spark-project-model/src/project/project-design.ts`
  - 从 AI 可调用项目模型中删除本地 DataSet mutation 能力。
- `packages/spark-project-model/src/index.ts`
  - 收窄公共导出，删除旧本地 DataSet 编辑合同。
- `packages/spark-project-model/src/MODEL-HIERARCHY.md`
  - 更新项目模型层级说明。
- `packages/spark-project-model/tests/project-model.test.ts`
  - 验证三文件页面合同和数据空间绑定，不再验证 pagedata dirty/save。
- `packages/spark-app/src/navigation/page-cache.ts`
  - 页面缓存不再读取 pagedata。
- `tests/page/transaction-config-pages.test.ts`
  - 更新页面文件事务边界。
- `tests/page/verify-rules.test.ts`
  - 删除 pagedata 文件规则，增加数据空间闭包规则。

### 6. 开发系统数据空间工作面

- 删除 `src/views/app/dev-system/DevDataSetDesigner.vue`
- 新增 `src/views/app/dev-system/data-space/DevDataSpaceExplorer.vue`
  - 展示 DataSet、资源/DataTable、模型/DataView、字段投影和两层关系，突出当前页面 modelId；首阶段没有保存按钮。
- `src/views/app/dev-system/DevSystem.vue`
  - 用数据空间工作面替换 pagedata 页签入口。
- `src/views/app/dev-system/DevFileEditor.vue`
  - 删除 pagedata 文本/可视化双模式及旧设计器绑定。
- `src/views/app/dev-system/DevPreviewTab.vue`
  - 通过数据空间运行容器预览，不再监听 pagedata 文本。
- `src/views/app/dev-system/useDevState.ts`
  - 增加只读数据空间加载、选中与错误状态；删除 pageData dirty/parse/history 状态。
- `src/views/app/dev-system/composables/useDevFileEditor.ts`
  - 页面文件编辑器只管理剩余交付文件。
- `src/views/app/dev-system/project-model-dev-bindings.ts`
  - 删除本地 DataSet 编辑绑定，提供数据空间只读投影。
- `tests/dev/dev-dataset-designer-projection.test.ts`
  - 改为数据空间资源/模型层次投影测试。
- `tests/dev/dev-preview-tab-loop.test.ts`
  - 验证预览从后端数据空间 DataSet 启动。
- `tests/dev/dev-state-page-file-closed-loop.test.ts`
  - 验证三文件闭环和数据空间只读状态互不混淆。
- 删除 `tests/dev/use-dev-state-page-data-history.test.ts`
  - 旧 pagedata 历史已无产品语义，不保留兼容测试。

### 7. AI 数据设计语义替换

- 删除 `src/services/page-data-design/page-data-design-agent-run-provider.ts`
- 新增 `src/services/data-space-design/data-space-design-agent-run-provider.ts`
  - 读取当前蓝图页面闭包和真实数据空间，输出结构化诊断与 dry-run 建议，禁止写文件和调用 mutation。
- `src/services/ai/agent-workflow-bindings.ts`
  - 将旧 pageDataDesign 写文件绑定替换为 dataSpaceDesign 只读能力。
- `src/services/page-design/page-design-agent-workflow-binding.ts`
  - 删除 `editDataSet/pagedata.json` 提示，页面设计只处理页面交付；数据设计转交 dataSpaceDesign。
- `src/services/page-design/page-design-gates.ts`
  - 删除本地 DataSet mutation operation，加入只读数据空间分析 operation。
- `src/services/project-model-artifacts/page-data-designer.ts`
  - 删除 pagedata JSON Schema，改为 dataSpaceDesign dry-run 输出 Schema。
- `src/services/project-planning/project-planning-agent-workflow-binding.ts`
  - 删除 `editDataSet` 能力提示，引用数据空间诊断能力。
- 删除 `tests/services/page-data-design-agent-run-provider.test.ts`
- 删除 `tests/services/page-data-design-preset.test.ts`
- 新增 `tests/services/data-space-design-agent-run-provider.test.ts`
  - 验证只读输入、结构化建议、无文件保存和无 mutation。
- `tests/page/page-design-gates.test.ts`
- `tests/page/page-design-sop.test.ts`
  - 验证页面设计与数据空间设计职责分离。
- `packages/spark-ai/src/tests/ai-api-script-context.test.ts`
- `packages/spark-ai/src/tests/function-call-recovery-enricher.test.ts`
- `packages/spark-ai/src/class-model/tests/read-dts-class-model-bundle-json.test.ts`
  - 删除 editDataSet 公共模型假设，验证新的只读数据空间能力表面。

### 8. 生成物、文档与验收报告

- `generated/dts-class-model/manifest.json`
- `generated/dts-class-model/.dts-manifest.json`
- `generated/dts-class-model/files/packages/spark-project-model/src/page/config-page.ts.json`
- `generated/dts-class-model/files/packages/spark-project-model/src/project/project-model.ts.json`
- `generated/dts-class-model/files/src/main.ts.json`
  - 仅通过现有生成命令更新；删除已不存在源码对应的生成文件。
- `docs/architecture/DATAFLOW_ARCHITECTURE.md`
- `docs/architecture/PERMISSION_SYSTEM.md`
- `docs/architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md`
- `README.md`
  - 更新唯一数据真源、身份闭包和权限消费说明。
- 新增 `notes/test-spark-data-data-space-integration.md`
  - 记录逐导航、逐 Vue 主页面、逐只读按钮的黑盒测试矩阵、问题、修复复验与仍被阻断的身份闭包。

## 技术方案

1. **合同 characterization**：先用现有生成器和包级测试固定资源目录、数据空间设计、运行查询和权限响应；任何与 Java 源码或真实只读响应不一致的字段立即 fail-fast。
2. **规范化数据空间**：把设计响应拆成 DataSet 身份、稳定资源、前端模型投影和关系；数据库资源必须通过目录主键解析，其他资源没有稳定公共 ID 时阻断。
3. **补齐 spark-data 语义**：DataSet 主体不重写；DataTable 成为资源，DataView 成为模型视图；共享 CrudService 实际应用请求/响应转换，DataView 提供查询上下文并原子接收权限快照。
4. **建立 AppWorks 装配器**：从完整页面闭包读取数据空间并构造 DataSet；相同 resourceId 只建一个 DataTable，每个 modelId 只建一个 DataView；关系两层分别解析验证。
5. **接入页面运行**：AppWorks 专属容器加载 DataSet，通用 SparkPageRenderer 只消费成品 DataSet；缺失绑定、资源 ID、模型 ID或权限快照均显示显式错误。
6. **接入开发系统**：新增只读数据空间资源/模型树，当前页面 modelId 高亮；预览和运行页面共用同一装配器。
7. **关闭本地真源**：新链的最小验证通过后，删除 pagedata 文件类型、内存模型、保存、缓存、设计器、AI 写入和相应测试，不保留兼容分支。
8. **AI dry-run**：保留数据设计入口，但只读取真实快照、生成结构化建议；建议不得冒充已执行变更。
9. **分层验证与黑盒循环**：每个最小闭环先跑对应包测试；全链完成后按真实蓝图遍历所有具有完整绑定的 Vue 页面，逐页、逐只读按钮测试并记录问题，再按批准范围逐个修复和复验。

## 关键设计决策及理由

- `DataSet` 与数据空间同层，避免重造已成熟的关系和视图编排能力。
- DataTable 使用后端稳定 resourceId 去重；物理名称只作展示/定位证据，不作生成身份。
- modelId 就是 DataView 的稳定视图身份；同一资源的不同模型不能互相覆盖字段投影或权限。
- DataTable 继续定义共享 CrudService，DataView 提供模型参数，符合用户确认的运行边界。
- 权限快照归 DataView，查询数据和权限必须同批原子登记；组件不推导后端授权。
- 资源关系与模型依赖分别进入 tableRelations/viewDependencies；显式模型依赖不从资源关系自动补造，且通过稳定 relationId 精确关联，避免同资源对多关系覆盖。
- 首阶段严格只读；后端现有批量 CRUD 不足以证明平台 metadata mutation 的治理闭环。
- 不保留 pagedata 双真源；旧 fixture 只作 characterization，不进入产品运行链。

## 兼容性

- 这是有意的破坏性语义变更：`pagedata.json`、`PageDataSetFile`、`editDataSet`、旧 pageDataDesign 写入能力及相关公共导出会删除。
- 不提供兼容别名、读取回退、自动迁移或薄壳转发。
- 页面规则、脚本、样式、组件、导航和业务页面不删除；其数据输入切换为后端数据空间 DataSet。
- 数据空间身份不完整的 Vue 页面会显式阻断并进入测试报告，而不是回退到本地空数据或 pagedata。
- 非 Vue 蓝图节点继续参与蓝图和对应输出，但不会被强制装配 DataSet。

## 验证计划

### 开工基线

1. `git status --short --branch`
2. `pnpm run typecheck`
3. 记录现有失败，不把用户未提交改动回滚或混入本计划。

### 每个最小闭环

1. `pnpm --filter @spark-appworks/spark-lowcode-api run typecheck`
2. `pnpm --filter @spark-appworks/spark-lowcode-api run test:run`
3. `pnpm --filter @spark-appworks/spark-data run typecheck`
4. `pnpm --filter @spark-appworks/spark-data run test:run`
5. `pnpm --filter @spark-appworks/spark-project-model run typecheck`
6. `pnpm --filter @spark-appworks/spark-project-model run test:run`
7. 对应根测试使用 `pnpm exec vitest run <精确测试文件>`。

### 全链验证

1. `pnpm run verify:lowcode-contracts`
2. `pnpm run generate:class-model-surface`
3. `pnpm run typecheck`
4. `pnpm run lint`
5. `pnpm run verify:arch`
6. `pnpm run verify:deps`
7. `pnpm run verify:pages-config`
8. `pnpm run verify:ai-codegen`
9. `pnpm run test:all`
10. `pnpm run build`

### 浏览器黑盒

- 使用现有已授权会话，只进行读取和非 mutation 交互；不在日志或报告中记录密码、Token 或签名行。
- 从项目蓝图生成页面矩阵，仅测试真实 Vue 页面；模块、外链、动作页单独验证其输出语义，不强制数据空间。
- 对每个完整闭包页面验证：路由落地、DataSet、资源/DataTable、模型/DataView、字段投影、关系、首屏查询、分页/筛选/排序、权限渲染、只读按钮和错误状态。
- 不完整闭包页面必须显示准确阻断原因并写入 `notes/test-spark-data-data-space-integration.md`。
- 以测试员角色记录问题，再以程序员角色仅在本计划范围内修复；每个问题完成最小复验后再继续下一项。

## 风险项

- **资源身份缺失**：当前只有数据库目录具备稳定表/字段 ID；字典、接口、JSON、文件资源若没有公共稳定 ID，首阶段将阻断而非推断。
- **当前工作树较脏**：多个计划相关文件可能已有用户改动；实施前逐文件重读，发生重叠即暂停，不使用 reset/checkout 覆盖。
- **治理目录缺口**：当前仓库没有 `workspace.catalog.json`，无法生成 skill 所述机器 ownerKey 绑定；本计划按现有 package/source 边界列出文件，实施前若仓库补入 catalog，必须先回到 draft 绑定 owner 后再开工。
- **传播面大**：pagedata 同时影响项目模型、渲染器、开发系统、AI、生成物和测试；严格按九个最小闭环推进，每轮首次修改后立即执行对应测试。
- **已确认的计划外源码外溢**：实施中发现 `packages/spark-data/src/dataset.ts` 把所有 ViewDependency 展开为 default→default；若不修改该文件，后端 modelId 关系会错误落到空默认视图。该文件已补入影响范围，须重新批准后继续。
- **关系表达漂移**：后端 relation 同时含表和模型信息；不完整的一层不能由另一层补造。
- **异步父依赖竞态**：现有 DataView 首次子查询未等待父查询完成；修正后必须用真实异步测试固定“父完成后再生成子过滤”的次序。
- **权限误用**：必须保持 r/e/h/m/d 五稀疏集合和独立读写通道；批量交互继续按所有选中最小单元取交集。
- **只读阶段功能观感**：开发系统和 AI 可查看、诊断、生成建议但不能保存数据空间；UI 必须明确标识 dry-run，不伪装成功。
- **后端接口能力不足**：任何需要新增后端能力的缺口记录为 blocked evidence，不修改 lowcode-jdk17，也不以本地 mock 冒充完成。

## 回滚策略

- 不以整仓回滚处理失败；每个最小闭环只操作计划列出的文件，并保留修改前 diff。
- 最小验证失败时停止扩散，记录失败文件和输出；只回退本轮由实施者产生且可确认归属的改动。
- 若发现实现必须新增计划外公共 API、依赖、文件或身份规则，立即把计划标为 blocked 或返回 draft 修订并重新审核。
