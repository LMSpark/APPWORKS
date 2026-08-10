# AppWorks 前端直连 lowcode API 与本仓后端退役研读

## 已确认目标

1. `D:\SPARK_AppWorks` 是唯一可写交付仓，最终交付为 AppWorks 前端及其前端 API 适配能力。
2. 本仓现有 `spark-ai-server` 最终删除，不演化为新平台后端，也不新建 AppWorks 平台服务器。
3. 前端统一通过同源 `/api` 对接 `E:\lowcode-jdk17` 的既有公开能力；开发代理和生产反向代理只负责地址转发，不承载业务语义。
4. `E:\lowcode-jdk17` 永久只读。只允许研读 Controller、Service、DTO、权限、数据库和事务行为；禁止修改 Java、POM、Nacos、数据库或部署配置，禁止将其模块作为 AppWorks 编译依赖。
5. 不执行 QYAPI live 写入。已有 QYAPI 数据空间、模型、导航和业务数据身份必须保留，不能为迁移便利重建。

## 当前产品调用链

### 页面运行链

`lowcode/AppWorks 导航响应 -> DynamicRouter -> createRuntimePageNode(pageId) -> ConfigPageNode -> rule/pagedata/script/style -> SparkPageRenderer -> DataSet/DataTable/DataView -> CRUD endpoint`

当前问题：

- 动态路由只把 `pageId` 传给 `createRuntimePageNode`，完整导航节点没有进入页面运行闭包。
- `ProjectNodeData` 尚未表达真实导航 `conid`。
- 当前页面数据仍以 `pagedata.json` 构建通用 DataSet；真实 lowcode/QYAPI 页面需要按现有身份加载数据空间、模型、字段、关系和后端权限。
- Vue 路径只负责组件寻址，不能被当作场景或数据空间身份。

### 数据运行链

`DataSet -> DataTable -> DataView -> CrudService -> HttpClient -> 同源 API`

`packages/spark-data` 是框架无关的页面数据运行时，不是后端、持久化 owner 或平台 SDK。它可以承接经批准的前端消费合同，但不得用物理表名替代前端模型，也不得自行模拟后端事务、唯一性或权限裁决。

### AI 链路

当前 `spark-ai-server` 同时承担 AI 会话、LLM 传输、SSE 以及大量非 AI 后端能力；浏览器侧 ToolLoop 执行 ClassModel 工具。删除服务器前，所有仍有消费者的 AI 会话、SSE 和工具传输必须逐项找到 lowcode 现有公开替代或明确标记为 gap，不能目录级直接删除后再补救。

## lowcode 只读考古结论

- lowcode 通过 gateway 暴露认证、QYAPI/DataOperation、流程、文件、SSE、AI 等既有端点族；实际生产路由以部署环境 Nacos 为准。
- `backend-api-contracts/` 当前是旧端点 characterization 输入。它应继续升级为由 lowcode 源码和行为测试生成或校验的端点账本、fixture 和新旧差分索引，而不是新 API 的实现。
- Controller 中存在大小写、Envelope、path/query/header/body/form/file 等历史契约差异，前端适配层必须源忠实处理，不能统一猜测。
- 浏览器不能补造 lowcode 未保证的原子性、跨记录约束或授权语义；缺少安全公开能力时记为迁移 gap。

## 身份与数据边界

必须区分四层身份：

1. 物理数据资源：表、视图、字典或外部资源，只证明资源存在。
2. 数据空间：场景容器，组织前端模型及关系。
3. 前端模型：必须保留唯一 `modelId`，字段和关系按后端事实读回；物理表名不能冒充模型 ID。
4. 页面运行闭包：导航 `conid`、模型、输入、依赖和后端权限的组合。

导航真实语义：`conid` 就是场景 ID/FormKey。只有真实 Vue 运行页面才需要对账数据空间；模块、外链、动作等节点不能机械创建数据空间。`conid` 缺失时必须从对应 Vue 的真实 FormKey 或运行消费证据对账，禁止生成新身份。

首个 characterization/迁移样本是当前薪资客户升级：35 个导航页面、旧 Word/原系统截图、功能描述、HTML 原型和 11 个历史 MSSQL 数据库；QYAPI 已有的真实数据空间、模型、导航和数据写入证据必须纳入对账。

数据库路线为 `MSSQL 来源 -> QY 后端 MySQL -> 后续人工迁达梦`。公共前端合同只使用普通字符串、整数、定点小数、布尔、日期/时间和受控 JSON 文本，不暴露数据库专有类型。

## 权限不可变合同

- 后端运行响应是唯一权限决策出口，页面不得合并角色或推断授权。
- `r/e/h/m/d` 是五个独立稀疏集合，不是单选枚举或三态压缩。
- 字段读写是独立通道；`visible = NOT h AND NOT m`，`r` 表示必填且可写，`e` 表示可写。
- 表级新增消费 `allowAdd`；行删除消费后端 `d`；更新和删除保留原始行基线及 `lingma_sys_key`。
- 批量操作对全部选中最小决策单元取权限交集，再与业务可用性相交。
- QY 权限缺失时必须 fail-closed。当前 `_modelPerm/_perm` 的缺省放行语义不能直接作为 QY 页面权限实现。

## mutation 与治理边界

前端适配不能削弱后端治理。任何经现有公开接口执行的 mutation 都必须在迁移方案中验证：写前镜像、幂等、短事务、journal、readback 和可执行补偿。若 lowcode 现有公开接口不能提供所需保证，则记录 gap，不在浏览器伪造保证。

ACS 自动化只适用于低风险、写前有快照且可补偿的开发态变更；人工批准绑定计划和风险边界，不逐个重复批准技术调用。生产高风险动作继续受风险门禁。

## 建议迁移顺序

1. 建立现有 AppWorks 后端端点消费者清单与 lowcode 等价/差异/gap 台账。
2. 选择一个真实垂直页面切片，完成登录上下文、导航 `conid`、数据空间、模型、查询、权限与保存的前端闭环。
3. 扩展到薪资 35 页并对账 11 个 MSSQL 来源及现有 QY 身份。
4. 逐族切换页面文件、导航、动态数据、工作流、文件、SSE 和 AI 消费者。
5. 用残留扫描证明前端不再调用 `spark-ai-server` 专有端点，构建和启动链不再依赖 Maven/JDK/本仓后端。
6. 在独立批准的最后闭环删除 `spark-ai-server`、Java 构建脚本、Docker 资产和代理配置，并验证纯前端构建、运行及回退方案。

## 预计影响面

- 根构建和启动：`package.json`、`scripts/start-dev.mjs`、`scripts/build-all.mjs`、Docker/README/环境配置。
- 应用传输与身份：`src/services/http.ts`、`src/services/auth.ts`、`src/services/api-paths.ts`、SSE/AI bridge。
- 导航和页面运行：`packages/spark-app`、`packages/spark-project-model`。
- 数据与权限消费：`packages/spark-data`、`packages/spark-component`。
- 页面与业务域：薪资 35 页及 Metadata 迁移页面。
- Characterization：`backend-api-contracts/`、契约生成/校验脚本、行为 fixture 和差分测试。
- 最终退役：`spark-ai-server/` 及所有仅服务该后端的构建、开发、部署与文档入口。

## 当前工作状态

- 分支：`feat/agent-workflow-node-contract`。
- 研读前既有研究和 characterization 已提交为 `ab176adc276abbebff38a4a4e1b906e7952766ff` 并推送。
- 本文件是最新方向的上下文锚点；旧的“新 AppWorks 平台 API server”方向不再成立。
- 任务定级：复杂。进入实施前需要完成 8 至 10 个基于真实歧义的一问一答，生成并审核新的正式计划。
