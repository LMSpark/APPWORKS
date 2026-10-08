状态：superseded

# 数据空间原生设计页实施计划

用户最新要求先不做界面，先搭起“数据空间的数据空间”对应的原生 DataSet。本计划尚未开始生产代码实施，页面、导航和设计会话新增暂停；当前由 `notes/plan-data-space-metadata-dataset.md` 接续。后续界面必须消费该 DataSet，不能绕开它自行拼查询。下文为被替代的界面实施路径，不能据此开工。

## 任务目标

按用户最新授权，先用原生 Vue 系统页面交付一个层次清楚、业务语义完整的数据空间设计页，再据该样板推进四文件集成。由低阶模型实施，主控负责范围、结构和验收。

## 已确定的语义与技术方向

- 唯一业务输入是 URL `scenarioId`，值为被设计的数据空间 ID。应用和租户沿系统页请求上下文。页面注册路径为 `/features/data-platform/data-set-management/ui/data-set-design-page`，走已有 Vue system-page 注册，不进入 `__tool` 的 PageRuntimePool 自动场景加载。
- 数据结构依据 `packages/spark-data`：DataSet 包含 DataTable，DataTable 包含 columns 和多个 DataView。空间、模型、字段已在数据库；读取后装配，修改回到正式元数据 owner，不整体序列化空间/字段到文件。
- 设计器读取元数据所需的正式查询场景属于内部实现。可复用当前元数据 DataSet/DataView 装配和保存管线，其身份不出现在页面业务 URL 参数中；不得把目标空间伪装为含 Base_DataModel 的元数据空间。没有 pagedata 的目标空间也可打开设计器。
- 左侧导航：空间设置；各模型及其模型定义、字段、命名视图；模型关系；数据级联。右侧仅显示当前对象。新建来源操作独立进入，不将来源搜索、模型列表、模型表单同时平铺。模型关系和数据级联独立；两者都属于完整目标，不能以旧 viewCascades 查询依赖替代多父字段输入级联。
- 前端只消费本次查询的数据权限。可见、脱敏、隐藏、可写及必填分别处理；admin 不放行。视图编辑直接使用 ViewMetadata 对应配置，保存仍经 ScenarioViewFile/ProjectWorkspace。
- 四文件布局不再扩写。原生 Vue 直接编排当前组件与领域服务，禁止内嵌旧 SparkPageRenderer/旧 rule 来伪装成原生实现，也禁止导入参考仓完整 Vue 及其宿主。

## 完整功能与交付边界

原页依据为 `notes/research-data-space-page-semantics.md` D01—D15 及关联 C/S 用例。整页验收仍包含：完整加载；模型图及布局；六类来源创建；来源替换/同步；模型和字段全合同编辑；过滤/输入/业务标志/缓存/完成配置；当前设计预览；前端输出投影；数组模型；处理配置；模型关系；空间参数；布局保存；删除影响与部分成功；调用信息，以及本仓命名视图、多父字段级联和侧向配置入口。先前局部证据按实际适用范围复用，不能宣布全完成。

## 首轮影响范围与实施步骤

先完成真实系统页入口、内部元数据 owner、层次浏览及模型/字段编辑，作为完整页面的骨架；其余用例按同一页面继续恢复，不将本轮定义为整页完成。

1. 新增 `src/lowcode/data-space/design-session/lowcode-data-space-design-session.ts`：一个页面实例的设计会话，接收唯一目标 ID；从既有正式元数据查询/装配器读取目标空间及模型/字段/关系，复用 DataView 原查询权限和 DataSet 保存。封装对象归属、当前选择、局部编辑/取消、确切保存结果、异步代次和销毁；保持内部元数据空间与被设计空间分离。需完整研读原 script 对应加载/编辑/保存流程后再取舍，不复制巨量脚本或另造权限体系。
2. 新增 `src/views/app/control/data-platform/data-space/design/DataSpaceDesignPage.vue`：原生系统页入口，解析单个非空 scenarioId，监听目标改变并保护未保存编辑；显示左侧空间/模型层次与右侧当前对象。模型/字段面板若需要拆分，仅新增同目录 `workbench/DataSpaceModelPanel.vue`、`workbench/DataSpaceFieldsPanel.vue`，各自消费同一设计会话，不自行请求/保存。
3. 修改 `config/navigation/vue-pages.json`：注册 app scope、hidden 的上述系统页路径，使用现有注册器与系统页宿主，不改公共路由协议。
4. 修改 `config/pages/data-platform/data-space-catalog/script.js` 的 `openCatalogDesign`：导航到原生系统页，只传目标 scenarioId 和非业务返回位置 returnTo。其他目录行为保留。
5. 新增 `tests/runtime/auth-nav/data-space/design-session/lowcode-data-space-design-session.test.ts`、`tests/ui/views/data-space-design/data-space-design-page.test.ts`；更新 `tests/app/config/vue-page-registry.test.ts` 与 `tests/runtime/page/catalog/data-space-four-file.test.ts` 的实际受影响入口断言。

原生页面不必须等待目标业务 DataSet 可查询才能显示元数据；坏来源、未设输出字段等模型应能进入修复。局部参数缺失、接口失败、权限拒绝不能显示成空成功。前端空壳、假数据和仅树状截图不作为完成证据。

## 兼容性

原生页并行建立并验收后切目录入口；保留旧工具文件与现场字节，避免破坏既有数据及其他人的修改。最终当前设计入口只有原生路径，不维护双实现长期并行。主控将根据原生验收结果明确旧工具退出范围；本轮不删除全目录、不提交、不建分支。

## 验证计划

- 开工：git status、目标文件当前内容与 SHA256 字节前像、`pnpm run typecheck` 基线。已有本轮未改变类型基线可复用日志，发生类型变更后复验。
- 每次实改运行对应最小单元/组件验证；先证明无目标视图文件也能加载正式元数据，随后证明模型→字段归属、字段权限、编辑/取消/正式保存与回读、目标切换异步隔离。
- 收敛后根 typecheck、精确 lint、上述定向套件、系统页注册与目录跳转回归各一次；无新变更不重复大测试。
- 浏览器走真实系统页，仅单目标 URL，检查树导航、当前对象标题、表单范围、来源操作入口、错误/空态及不同宽度；沿已授权 admin 测试空间验证可逆操作，保留前像并核正式回读与重开。
- 未覆盖的 D/S 用例继续列明并实施；零回归和整页完成必须由全部实际影响面证明。

## 风险与处理

- 设计元数据场景与目标空间的混用：内部会话绑定正式查询身份，外部只有目标 scenarioId，目标变更重新建立会话。
- 元数据 DataView 多页：复用完整读取合同，分页/合并不冒充本次原查询权限；不可写原查询之外拼接的行。
- 已派发写入结果未知：保留对应 owner 与提交回执，核验前不重发、不宣称取消已撤销后端。
- 系统页关闭保护：核现有系统页宿主生命周期；需要新公共接口时先回报实际缺口，不绕过脏状态保护。
- 旧页面脚本有大量逐页逻辑：只移入有真实状态与不变量归属的领域会话，必要通用逻辑复用已有能力；不要把脚本搬成一个更大的 Vue。
