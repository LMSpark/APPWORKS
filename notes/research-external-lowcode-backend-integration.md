# 外部 lowcode 后端与元数据管理前端集成研读

## 已确认目标

- 目标仓库：`D:\SPARK_AppWorks`。
- 后端运行时唯一来源：`E:\lowcode-jdk17`。
- 元数据管理前端来源：`E:\R\sparkproject\apps\metadata`。
- 最终不保留本仓 `spark-ai-server` 后端，不再由本仓开发、构建或部署链路启动、编译或依赖该后端。
- 不建立兼容性中转后端；前端通过目标公共契约直接接入 lowcode 后端。

## 当前仓库运行链路

- 根前端统一使用相对 `/api` 请求，并由 `vite.config.ts` 代理到默认 `127.0.0.1:8180`。
- `scripts/start-dev.mjs` 当前负责启动 Docker MySQL、启动 `spark-ai-server`、探测 `/api/config/default`，随后启动 Vite。
- `scripts/build-all.mjs` 当前同时构建本仓 Java JAR 和前端产物。
- 本仓认证、租户/项目、导航、页面配置、工作流、附件、缓存、AI Session、Host Run 和 `/api/events` SSE 均存在本仓后端契约依赖。

## 外部前端现状

- `metadatamanagement` 是 Vue 应用，默认部署基址 `/metadata/`、开发端口 `5300`。
- 使用 `@spark-template/*` 工作区公共包及 QYAPI 能力。
- API 基址、代理目标、认证路径、应用目录和导航参数通过环境变量配置。
- 已覆盖登录、租户、应用目录、动态导航、权限、数据集、流程、报表、API、缓存、脱敏和角色等功能。
- 未发现 Axios、裸 fetch 或产品自建 EventSource/WebSocket 作为主要传输边界。

## 外部后端现状

- `lowcode-jdk17` 是 Java 17 多模块工程，包含 gateway、mainbody、file、register、license、MCP、IoT 等模块。
- 运行依赖包含 Nacos、数据库、Redis及相关微服务配置，不能按本仓原有单体 8180 JAR 启动方式直接替换。
- 后续方案必须明确实际运行模块、网关入口、服务发现/配置、数据库、Redis、文件和实时通信依赖。

## 调用链与数据流

1. 浏览器应用通过共享 HTTP/QYAPI 能力发出认证、导航、元数据、流程、文件和权限请求。
2. 本地开发由 Vite 将统一前缀代理到 lowcode gateway；生产环境采用同源反向代理或明确的外部网关地址。
3. lowcode gateway 负责路由、认证与下游服务访问；业务数据不再进入本仓 `spark-ai-server` 或其 MySQL。
4. `metadatamanagement` 的动态导航及页面功能以 lowcode/QYAPI 返回数据为事实源。

## 影响面

- 删除或退出运行链路：`spark-ai-server/`、本仓 Java 环境文件、Java 构建和启动逻辑、本仓专用 MySQL 启动逻辑。
- 重接：根应用入口、路由、环境配置、Vite 代理、认证、租户/应用上下文、导航、HTTP/QYAPI、SSE、文件与错误模型。
- 重构构建/验证：根 `package.json` scripts、workspace 依赖、构建脚本、部署说明和依赖本仓后端的测试/架构规则。
- 需要逐项处置本仓独有的 AI、项目设计、页面配置和工作流设计能力：接入 lowcode 公共能力、前端保留、标记能力缺口或明确删除。

## 风险与现有工作保护

- `D:\SPARK_AppWorks` 当前分支为 `feat/agent-workflow-node-contract`，领先远端 1 个提交，并有多个未跟踪的 research/plan/report 文件。
- `metadatamanagement` 所属上层工作区存在大量未提交改动；其当前文件状态不能未经确认直接复制或覆盖。
- 后续实施必须按最小闭环执行，并在每轮修改前重新读取文件，避免覆盖用户现有工作。

## 当前未决事项

- `metadatamanagement` 在目标仓库中的产品落位方式。
- `lowcode-jdk17` 的标准运行拓扑和统一网关入口。
- 本仓现有前端能力的保留、合并、替换或删除范围。
- AI 能力在 lowcode 后端中的承载方式。
- URL、认证、租户、应用、权限、响应包络、SSE 和文件契约的最终映射。
- 源前端公共包的迁入方式及上层 workspace 依赖处置。
- 数据迁移、部署模式、兼容性窗口和验收策略。

## 用户确认的实施决策

1. `metadatamanagement` 完全替换本仓根前端，成为唯一产品入口。
2. `lowcode-jdk17` 保持微服务、分布式架构，通过 gateway 提供统一入口。
3. 首期覆盖 gateway、mainbody、file、register、license、MCP、IoT 及其基础设施。
4. 删除旧 `src/` 和仅服务旧应用的包，只保留新应用存在真实消费者的通用包。
5. `@spark-template/*` 按实际依赖闭包迁入，不复制整个上层 workspace。
6. AI 能力改接 lowcode 的 LLM、MCP 和 SSE 能力，不保留本仓 AI 后端协议。
7. 本仓后端数据库、种子配置、AI 会话和日志均不迁移；lowcode/QYAPI 数据是唯一事实源。
8. 不大幅修改或重新编排 `lowcode-jdk17`；本仓只承担前端配置、连接、健康检查和缺失服务提示。
9. 新前端通过登录、导航、核心元数据、文件、流程、AI/MCP、SSE 全链路验收后，统一删除旧前后端。

## 已确认的公共包依赖闭包

新应用源码直接使用以下公共包，迁入时还需按各包 `package.json` 继续计算传递依赖：

- `packages/platform/core`
- `packages/platform/config`
- `packages/platform/navigation`
- `packages/platform/realtime`
- `packages/data/qyapi`
- `packages/data/ai`
- `packages/ui/base/contracts`
- `packages/ui/base/tokens`
- `packages/ui/base/vue`
- `packages/ui/domain/organization`
- `packages/ui/domain/qyapi`
- `packages/ui/optional/ai`
- `packages/ui/optional/graph`
- `packages/ui/optional/report`

## 第二轮深度审计发现

### 新前端真实启动链

1. `src/main.ts` 必须先从环境变量与部署期 `runtime-config.json` 合并运行配置；存在 error 级配置问题时应用拒绝启动。
2. `app/bootstrap.ts` 创建 Pinia、Router、工作区页签、认证状态和 realtime，并监听登录、退出、SSO 和应用切换事件。
3. Router 在认证恢复后依次加载应用目录和后端授权导航，再把后端 `componentKey/path` 映射到本地 Vue 页面。
4. 动态导航无法识别时进入占位页；因此“导航存在”不能视为功能已经迁入。
5. HTTP、Token、刷新、国密、multipart、统一错误由 `platform/core` 的 `createPlatformCommunicationRuntime` 负责；产品层不直接管理物理传输。
6. QYAPI 的查询与写入分别集中到 `/DataOperation/GetData`、`/DataOperation/BatchTableOperateRequestByCRUD`，文件走 `/File/*`，流程设计走 `/File/GetFlowDesignInfo`、`/File/SaveFlowDesignInfo` 和 `/Flow/SaveFlowAndFormRelation`。
7. realtime 由共享 runtime 负责会话和重连；AI 由 `data/ai` 的 lowcode agent loop 组合 realtime，不兼容本仓 Host Run 协议。

### 页面能力实况

动态路由显式绑定的功能族包括：任务、缓存、脱敏、用户、用户应用授权、角色与权限、导航权限、应用与功能、请假、数据库/表/视图/字段关系、数据集、流程设计与运行、文件、组织、数据字典/编码/工作流/逻辑视图、报表、JSON 数据、Excel 导入、API 管理、企业入口等。

当前新前端没有对应的完整产品页面族：IoT 设备/产品/物模型/规则/OTA、license 中心、register 服务管理、MCP Server 运维。它们只能作为 lowcode 平台依赖被探测，不能仅凭“服务已启动”宣称已完成前端集成。

### 后端接口归属证据

- `lowcode-mainbody`：`/api/LoginAuthority/*`、`/api/DataOperation/*`、`/api/Flow/*`、`/api/Workflow/*`、`/api/Db/*`、`/api/Table/*`、`/api/View/*`、`/api/JsonData/*`、`/api/sysCache/*`、`/api/ai/*` 等核心业务接口。
- `lowcode-file`：`/api/File/*` 上传、下载、文本内容、Excel、流程设计文件和设计文档导出。
- `lowcode-mcp-client`：`/api/ai/chat/*`、模型、工具、工作流及流式 AI 接口。
- `lowcode-mcp-server`：通过 Feign 聚合 mainbody/file 能力，是 MCP 工具服务边界。
- `lowcode-ent-register`：企业注册和企业登录相关接口。
- `lowcode-license-center`：许可服务，当前 metadata 页面未形成直接消费者。
- `lowcode-module-iot`：独立 IoT 产品、设备、规则、OTA 等 API，当前 metadata 页面未形成直接消费者。

### 公共包依赖 DAG

- `config -> core -> axios`
- `realtime -> core`
- `ai -> core + realtime`
- `ai-ui -> ai`
- `qyapi -> core + navigation`
- `qyapi-ui -> qyapi + ui`
- `organization-ui -> ui + ui-contracts`
- `ui -> core + ui-contracts + TipTap + DOMPurify`
- `graph-ui` 额外需要 LogicFlow peer。
- `report-ui` 额外需要 ExcelJS，并在开发期需要 Sass。

这意味着迁入不能按 14 个目录机械复制；必须同时统一 Axios、TipTap、DOMPurify、LogicFlow、ExcelJS、Sass、Vue、Router、Element Plus 和测试工具链版本。

### 本仓后端并非只包含 AI

本仓后端还提供认证、租户/项目、导航、页面配置及版本、工作流设计、数据源/数据库/表关系、动态 CRUD、文件附件、缓存、日志和 OpenAPI。删除时必须为每个端点族记录 `lowcode 等价替代`、`由新产品语义取代` 或 `明确删除`，不能仅做目录级删除。

## 2026-08-03 当前三项目快照校正

本节基于用户确认的当前三项目关系，优先于上文引用旧 `C:\Users\...\SPARKProject` 快照的历史描述：

- 可写交付仓：`D:\SPARK_AppWorks`。
- 只读 Metadata 来源：`E:\R\sparkproject\apps\metadata` 及其真实工作区依赖闭包。
- 只读唯一后端：`E:\lowcode-jdk17`；本任务不修改 Java、POM、Nacos 配置、数据库或部署配置。
- 用户确认的总体链路：`Metadata 前端 -> 同源 /api -> lowcode-gateway -> mainbody / file / register / license -> QYAPI、流程、文件、SSE、AI`。

当前源码证据：

1. `E:\R\sparkproject\apps\metadata` 当前基址为 `/metadata`，开发端口为 `3000`；应用直接从构建期环境和浏览器同源解析 API 根地址，当前没有旧快照所述的部署期 `runtime-config.json` 启动门禁。
2. Metadata 的真实工作区闭包为 21 个包：`admin-shell`、`ai-ui`、`auth-api`、`auth-ui`、`business-table-ui`、`communication`、`config`、`core`、`design-tokens`、`graph-ui`、`http`、`navigation`、`organization-ui`、`qyapi`、`qyapi-ui`、`realtime`、`report-ui`、`security`、`ui`、`ui-contracts`、`vue-runtime`。
3. Metadata 生产构建通过；测试基线为 43 个测试文件中 40 通过、2 失败、1 跳过，171 个测试中 168 通过、3 失败。失败项来自参考快照已有的架构边界和基础 UI 契约，不得在迁入时当作新增回归，也不得带病升级为新基线。
4. Metadata 已直接使用 lowcode 的登录、刷新、QYAPI DataOperation、文件、流程、`/api/sse/connect` 和 `/api/sap/agent-loop` 契约。
5. 当前公共认证实现的登出是 `POST /system/auth/logout`，而 lowcode-mainbody 实际公开 `GET /api/LoginAuthority/UserLogoutByEnt`；后端不改，必须由目标前端认证适配层消除错配。
6. `lowcode-jdk17` 根 Reactor 当前聚合 gateway、framework、mainbody、file、license、register；MCP client/server 和 IoT 在根 `pom.xml` 中被注释，不得仅凭源码目录或 gateway 示例路由宣称随根构建可交付。
7. gateway 示例路由仍引用 MCP 服务和 `lowcode-api-dotnet` 等外部服务；实际运行路由以部署环境 Nacos 为准，本仓不接管这些服务生命周期。
8. QYAPI 权限继续以后端返回为唯一事实源；页面只消费表、行、字段权限，不新增本地角色合并或权限推断。
9. 三个工作树均有既存未提交内容：目标仓的 `backend-api-contracts/`、参考仓的 ERP/冒烟脚本改动、lowcode 仓的 docs/tools 等；全部视为受保护用户工作。

当前总体方案已经确认，但“Metadata 是完全替换旧根产品，还是与旧 AppWorks 页面设计能力并存”仍需在新计划前按当前表述再次裁决；它会决定删除集合、目录拓扑和验证矩阵。

## 2026-08-03 用户最终方向裁决

以下决策替代本文前部“Metadata 完全替换 AppWorks 根产品”的旧判断：

1. `D:\SPARK_AppWorks` 是唯一前端工程、主应用和主包体系；`E:\R\sparkproject` 只作为 Metadata 源码与公共包的只读来源，不形成独立子应用或第二套部署物。
2. AppWorks 保留主壳、主路由和 `@spark-appworks/*` 公共面；Metadata 全部页面、菜单、路由、组件及其真实依赖能力按 AppWorks 分层整合，不以 `@spark-template/*` 平行包长期并存。
3. 同名或同职责能力以 AppWorks 实现和公共接口为主体，逐项吸收 Metadata 缺失能力；如语义冲突，先在迁移清单中裁决，不直接覆盖目标文件。
4. 登录会话由 AppWorks 统一接入 lowcode `/api/LoginAuthority/*`，全应用共享 Token、用户、企业、租户和应用上下文。
5. 菜单、路由由 AppWorks 统一管理；字段、行、表及操作权限只消费 lowcode/QYAPI 后端结果，不在页面本地合并角色或推导权限。
6. Metadata 需要的应用、企业、租户和接口配置由 AppWorks 适配层读取 AppWorks 运行时，不新增 Metadata 私有运行时配置体系。
7. `D:\SPARK_AppWorks\spark-ai-server` 最终删除；删除前必须完成前端切换、残留扫描和独立确认。本次方案阶段不执行删除。
8. 发布采用统一目录、前后端独立构建：AppWorks 生成前端静态产物和同源 `/api` 代理配置，`E:\lowcode-jdk17` 原地 Maven 构建并将现有 Reactor 模块 JAR汇入发布目录；两仓源码不互相复制。
9. 先形成完整方案再实施。未确认的真实环境端到端验证不阻塞方案编写，自动化离线验收作为最低门槛，连接 Nacos/真实租户后的验证作为环境具备后的追加门槛。

### 包级归并边界

Metadata 真实依赖闭包中的 21 个 `@spark-template/*` 包不按原目录一比一落地，按职责归并到 AppWorks 现有包：

- `spark-utils`：无业务状态的 HTTP、安全和底层通信原语。
- `spark-app`：运行配置、通信组合、认证、导航、实时会话、应用壳和 Vue 运行时接线。
- `spark-data`：QYAPI 查询、写入、权限结果和数据资源适配。
- `spark-component`：设计令牌、UI 契约、基础控件、认证/组织/QYAPI/业务表格/图形/报表/AI 展示组件。
- `spark-ai`：lowcode AI/SSE 调用契约和 AppWorks AI 领域能力；删除旧 Host Run 后端耦合，但不把纯 UI 塞入该包。

最终迁入前必须生成逐文件、带摘要的合并清单；任何目标文件在清单生成后发生变化都停止该项合并并重新裁决。

## 2026-08-03 数据、身份与文件边界深挖

### AppWorks DataSet 与 QYAPI 数据空间不是同一个对象

1. AppWorks `packages/spark-data/src/dataset.ts` 中的 `DataSet` 是页面运行时对象，负责表、视图、主从关系、视图依赖、编辑态、选择态、自动加载和保存编排。
2. 现有 `pagedata.json` 只是把该运行时对象的构造元数据序列化到页面文件；`dataSetName/pageId` 不是 QYAPI 数据空间 ID。
3. QYAPI 数据空间的持久事实位于 `Base_DataSet`、`Base_DataModel`、`Base_DataModel_Field`、`Base_DataModel_Relation`。稳定标识分别是数据空间 `rowid` 和模型 `rowid`；查询时 `formKey` 使用数据空间 ID。
4. QYAPI 查询结果除数据行外还包含原始行基线、`lingma_sys_key`、`allowAdd` 和 `lingma_sys_params` 权限集合；更新必须基于原始行只发送真实变更，不能由通用 REST CRUD 猜测请求形状。
5. 用户进一步确认：接入后数据层不再使用文件。因此 QY 页面运行链必须取消 `pagedata.json`，以导航节点的 `dataSourceId` 绑定 datasource，读取对应 QY 数据空间元数据并构造 AppWorks `DataSet`。`scenarioFormKey` 是独立场景上下文，不能代替 `dataSourceId`。禁止把 QY datasource 复制或镜像到 lowcode-file。
6. AppWorks `DataSource` 必须与 QY 接口结果直接看齐，而不是只在 adapter 内部保留 QY 权限。现有 DataSource 直接承载 `rows`、`originalRows`、`total`、`allowAdd`、表级 `lingma_sys_key`，行继续保留 `lingma_sys_key` 和 `lingma_sys_params.{r,e,h,m,d}`；由 AppWorks `DataTable.execQueryResult` 原子注册到对应 DataSource，UI 派生权限和保存请求都从同一 DataSource 读取。
7. 用户最终确认三层直接对接，不建立平行 QY 领域模型：`Base_DataSet -> AppWorks DataSet`；QY 前端模型 `Base_DataModel -> AppWorks DataTable`；QY 接口 datasource -> AppWorks DataSource。因此一个 `Base_DataModel` 对应一个 AppWorks `DataTable`，字段对应 columns，模型关系由其所在 DataSet 组织；DataView/DataSource 是该 DataTable 对 UI 的运行时视图。同一物理资源如果被后端定义为多个前端模型，必须保留多个 DataTable，不能按物理表名合并。

### 页面运行链的具体替换点

当前链路为：

`DynamicRouter -> createRuntimePageNode -> ConfigPageNode.load -> rule/pagedata/script/style 四文件 -> toRenderConfig -> SparkPageRenderer -> PAGE_DATASET`

目标 QY 链路应为：

`QY Base_NavigationInfo.dataSourceId/scenarioFormKey -> ProjectNodeData 直接字段 -> createRuntimePageNode(node) -> 三个表现文件 + QY 元数据 loader -> AppWorks DataSet/DataTable/DataSource -> SparkPageRenderer -> PAGE_DATASET`

已识别的代码影响：

- `packages/spark-app/src/router/dynamic.ts` 当前创建运行页时没有把完整导航节点传入 `createRuntimePageNode`，会丢失 `scenarioFormKey/dataSourceId`。
- `packages/spark-project-model/src/navigation/project-node.ts` 当前没有后端导航已有的 datasource/场景字段，需要直接增加 `dataSourceId` 和 `scenarioFormKey`，原样区分二者，不再包一层平行 QY 页面模型。
- `packages/spark-project-model/src/page/runtime-page.ts` 当前并发读取固定四文件；QY 页面必须改为只读 `rule.json/script.js/style.css`，同时调用数据空间加载器。
- `packages/spark-project-model/src/page/config-page.ts` 当前把 `PageDataSetFile` 作为必备子模型；需要拆成 legacy 四文件页面和 QY 三文件+运行时数据空间两种明确 profile，QY profile 不允许读写 `pagedata.json`。
- `packages/spark-data/src/types.ts` 的现有 `DataSource` 只有 rows/columns/状态和通用 `_modelPerm`，尚未承载 QY originalRows、`allowAdd`、表级 `lingma_sys_key` 和行级 `lingma_sys_params`；这是必须补齐的正式契约面。
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue` 已经消费编译好的 `DataSet`，不应直接调用 QYAPI；正确适配点在 project-model/data 层，渲染层继续只注入 `PAGE_DATASET`，组件从其中的 DataView/DataSource 消费 QY 结果。

### QY 绑定的稳定键

- 企业：登录请求使用企业名称，Token 和文件分区使用企业短名；企业 `rowid`、名称、短名必须分别保存，不能互相覆盖。
- 应用：`Base_AppSystemList.rowid` 是导航 `Base_NavigationInfo.sysid` 的筛选键；`AppName` 是应用代码，两者必须分别保存。
- 账套：来自用户上下文的独立可选维度，不得代替企业或应用。
- 页面导航：`Base_NavigationInfo.rowid/prowid` 形成树，`sysid` 绑定应用，`dataSourceId` 绑定 datasource，`scenarioFormKey` 保留独立场景上下文。
- 数据空间：`Base_DataSet.rowid`。
- 数据模型：`Base_DataModel.rowid`；模型 Name/MetaName/DbName 仅为语义和查询参数，不能代替稳定 ID。

据当前源码推断，AppWorks URL 的 `tenantId` 应映射企业短名，`projectId` 应映射应用 `rowid`；这是待真实登录和应用目录只读回读验证的推断，不作为未经验证的后端事实。运行时同时保留 enterpriseId、enterpriseShortName、applicationId、applicationCode 和 accountSetId，避免旧 `tenant/project` 两字段丢失语义。

### 权限适配不能沿用现有通用快照

AppWorks 当前 `_modelPerm/_perm` 模型无法完整表达 QYAPI：它缺少行内必填字段集合，且通用检查器在权限缺失时倾向放行。QY 页面必须：

- 先由 `DataTable.execQueryResult` 注册后端权限结果，键为 `FormKey + model Type + model Name`。
- 表级只消费 `allowAdd`。
- 字段读通道：`h` 隐藏、`m` 脱敏、其余可见；字段写通道：`r` 必填且可写、`e` 可写、其余只读。
- 行删除只消费 `lingma_sys_params.d`；提交保留后端签名的 `lingma_sys_key` 和原始行基线。
- QY 权限缺失时 fail-closed；批量操作对所有选中最小决策单元取交集。
- 页面和组件不得合并角色或重新计算授权，只把业务可用性与后端权限相交。

### 文件系统边界

lowcode-file 的 `appType` 决定物理根目录，`isCrossEnt=false` 时服务端按企业短名分区。它适合保存文件内容，但不是数据空间持久层。

目标分层：

1. QY 数据层：无页面数据文件；业务数据、模型、字段、关系、权限均走 QYAPI。
2. 页面表现层：仅 `rule.json`、`script.js`、`style.css` 走 lowcode-file，建议 `appType=designfile`、`isCrossEnt=false`，路径由应用 ID 和页面 ID 确定；最终路径格式必须用真实环境读写回执验证。
3. 数据空间设计器画布布局：如需保存，只是设计态 layout artifact，不是数据空间 SSOT；必须与 `Base_DataSet/Base_DataModel*` 分开命名和校验。
4. 普通业务附件：二进制放 lowcode-file；可搜索、归属、版本和软删除等业务元数据必须来自已存在且经回读确认的 QY 资源，不能继续使用 Metadata 当前 `sessionStorage` 目录。
5. 流程设计文件：继续使用 `/api/File/GetFlowDesignInfo/{flowModId}` 和 `/api/File/SaveFlowDesignInfo`，属于流程领域，不与页面表现文件或普通附件混用。

现有 Metadata 文件管理页只把本次浏览器会话上传结果写入 `sessionStorage`，虽然后端存在 `/api/File/list`，该接口返回字段和目录语义有限。因此迁入时必须把它标为待替换实现，不能宣称已有持久文件目录。`RemoveFile` 的 `customPath/fileName` 组合也必须使用上传/列表回执构造，不能把完整文件路径再次当目录传入。
