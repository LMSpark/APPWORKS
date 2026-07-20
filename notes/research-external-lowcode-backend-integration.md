# 外部 lowcode 后端与元数据管理前端集成研读

## 已确认目标

- 目标仓库：`D:\SPARK_AppWorks`。
- 后端运行时唯一来源：`E:\lowcode-jdk17`。
- 元数据管理前端来源：`C:\Users\lgf22\Documents\SPARKProject\apps\metadatamanagement`。
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
