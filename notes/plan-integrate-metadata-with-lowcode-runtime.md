状态：draft

# 元数据管理前端与 lowcode 分布式运行时直接集成方案

## 1. 任务目标

将 `C:\Users\lgf22\Documents\SPARKProject\apps\metadatamanagement` 及其真实公共包依赖迁入 `D:\SPARK_AppWorks`，完全替换本仓旧根前端；以 `E:\lowcode-jdk17` 的 gateway 和现有微服务为唯一后端运行时；完成端到端验收后，删除本仓 `spark-ai-server` 及所有仅服务旧产品的代码、构建、配置、测试和数据产物。

最终交付必须满足：

- 根目录只有一个可运行前端产品：元数据管理平台。
- 浏览器只访问 lowcode gateway，不直接发现 mainbody、file、MCP、IoT 等服务地址。
- `lowcode-jdk17` 不被复制进本仓，不被合并成单体，不因本次集成发生结构性重构。
- 本仓不再编译、启动、部署或探测 `spark-ai-server`。
- 本仓旧 MySQL、页面种子、项目数据、AI 会话和日志不迁移、不双写、不作为兜底。
- AI、MCP、SSE 使用 lowcode 现有公共契约，不保留本仓 AI Session/Host Run 兼容服务。

## 2. 范围裁决

### 2.1 产品页面范围

迁入并验收 `metadatamanagement` 已有页面能力：

| 能力族 | 页面/入口 | 后端主归属 | 验收级别 |
|---|---|---|---|
| 身份与会话 | 登录、SSO、刷新、退出、会话失效 | mainbody / gateway | 完整闭环 |
| 租户与应用 | 租户选择、应用目录、应用切换 | mainbody DataOperation | 完整闭环 |
| 动态导航 | 授权菜单、动态路由、页签 | mainbody FormDesign/QYAPI | 完整闭环 |
| 用户与组织 | 用户、组织、岗位/人员选择 | mainbody QYAPI | 完整闭环 |
| 角色与权限 | 角色、角色授权、用户应用授权、导航权限 | mainbody QYAPI | 完整闭环 |
| 应用管理 | 应用、应用功能、企业入口 | mainbody QYAPI + file | 完整闭环 |
| 数据库元数据 | 服务器、数据库、表、视图、字段、关系 | mainbody Db/Table/View | 完整闭环 |
| 数据服务 | 数据集、授权、JSON、逻辑视图、字典、编码 | mainbody DataOperation/JsonData | 完整闭环 |
| API 管理 | 提供者、接口、配置 | mainbody QYAPI/外部接口 | 完整闭环 |
| 文件 | 上传、下载、文本读取、Excel、设计文档 | file | 完整闭环 |
| 流程 | 设计、表单关系、运行、撤回、退回、加签、监控 | mainbody Flow/Workflow + file | 完整闭环 |
| 报表 | 管理、设计、预览、导出 | mainbody QYAPI + file | 完整闭环 |
| 平台运维 | 缓存、任务、脱敏、字段分类、Excel 配置 | mainbody/file | 完整闭环 |
| AI | 元数据页面内 AI 助手、流式消息 | mainbody/MCP client | 完整闭环 |
| MCP | AI 工具调用与 lowcode 能力编排 | MCP server/client | 完整闭环 |

### 2.2 非页面服务范围

以下服务不因“全量微服务”要求而凭空新增产品页面：

| 服务 | 本次处置 | 验收内容 |
|---|---|---|
| lowcode-license-center | 保持原运行边界 | gateway 路由、鉴权失败语义、服务不可用提示 |
| lowcode-ent-register | 保持原企业注册边界 | 已有登录/企业入口相关调用可达；不新增运维控制台 |
| lowcode-module-iot | 保持独立 IoT 产品边界 | gateway 可达性和路由隔离；不把 IoT 页面塞入元数据管理 |
| lowcode-mcp-server | 作为 AI 工具服务 | 工具发现、调用、错误、超时和审计链路 |
| lowcode-mcp-client | 作为 AI 会话/模型服务 | 会话、消息、流式响应、模型/工具调用 |

如后端动态导航下发上述产品页面，而本仓没有对应组件，前端必须显示“该功能属于外部产品/当前未安装”的明确状态；禁止静默空白或错误映射到无关页面。

## 3. 当前事实与目标结构

### 3.1 当前本仓结构

```text
pnpm dev
  -> scripts/start-dev.mjs
     -> Docker MySQL 127.0.0.1:3406
     -> spark-ai-server Maven / 8180
     -> GET /api/config/default 健康检查
     -> Vite /api proxy -> 8180

pnpm build
  -> packages
  -> spark-ai-server JAR
  -> 当前 Vue 前端
```

### 3.2 目标结构

```text
Browser
  -> Metadata Vue App
     -> platform/config
     -> platform/core communication runtime
     -> platform/navigation
     -> platform/realtime
     -> data/qyapi + data/ai
     -> UI packages
        |
        +-- one configured API prefix
                |
                v
          lowcode-gateway
            +-- lowcode-mainbody
            +-- lowcode-file
            +-- lowcode-ent-register
            +-- lowcode-license-center
            +-- lowcode-mcp-server/client
            +-- lowcode-module-iot
            +-- Nacos / Redis / databases / existing infrastructure
```

目标仓库不拥有图中 gateway 以下任何服务的生命周期。

## 4. 协议替代矩阵

本仓旧端点不能按相同 URL 机械转发，必须按产品语义退出或替换：

| 本仓旧后端端点族 | 新归属 | 处置 |
|---|---|---|
| `/api/auth/*` | `/LoginAuthority/*` | 用 lowcode 登录、资料、刷新、退出协议替换 |
| `/api/platform/*` | DataOperation + 应用目录 | 由租户和应用上下文模型替换 |
| `/api/tenants/*/projects/*` | QYAPI 应用/功能/数据空间 | 不保留旧 project REST 兼容层 |
| `/navigation` | FormDesign 授权导航 | 后端授权树为唯一菜单真源 |
| `/pages-config/*` | QYAPI 表/表单/导航元数据 | 旧四文件页面配置产品语义删除 |
| `/workflow-designs/*` | `/File/GetFlowDesignInfo`、`SaveFlowDesignInfo`、`/Flow/*` | 使用 lowcode 流程模型替换 |
| `/data-model/*`、`/databases/*`、`/servers/*` | `/Db/*`、`/Table/*`、`/View/*` + QYAPI | 使用 lowcode 元数据注册模型替换 |
| `/data/{table}/*` | `/DataOperation/GetData`、`BatchTableOperateRequestByCRUD` | 使用 permission-aware QYAPI 模型替换 |
| `/planning-attachments/*` | `/File/*` | 按文件 facade 替换；旧策划附件语义不保留 |
| `/api/cache/stats` | `/sysCache/*` | 使用 lowcode 缓存管理能力 |
| `/api/logs` | lowcode 日志接口/前端错误通道 | 不保留旧日志存储协议 |
| `/api/ai/sessions/*` | lowcode AI conversation/message | 不兼容旧会话表 |
| `/api/ai/turns` | lowcode agent/chat stream | 替换 Posted Turn 帧协议 |
| `/api/ai/host-run/*` | MCP 工具调用 | 删除 Host Run 协议，不做兼容模拟 |
| `/api/events` | lowcode realtime/SSE | 使用共享 realtime deployment/session |
| `/api/openapi.json`、Swagger | lowcode 各服务现有文档 | 本仓不再聚合后端 OpenAPI |

## 5. 目标目录与文件影响范围

### 5.1 根应用替换

来源：`C:\Users\lgf22\Documents\SPARKProject\apps\metadatamanagement`

| 目标路径 | 操作 | 说明 |
|---|---|---|
| `src/` | 整体替换 | 迁入 metadata 的 app/config/features/pages/shared/widgets/styles |
| `public/` | 按文件合并后替换 | 保留新应用需要的运行时配置和静态资源 |
| `index.html` | 替换 | 使用 metadata 单入口 |
| `tests/metadatamanagement/` | 新建领域分组 | 迁入源应用测试，禁止把大量测试平铺到根 tests |
| `vite.config.ts` | 重写合并 | metadata base、插件、代理、chunk；移除旧页面/组件扫描插件 |
| `vitest.config.ts` | 重写合并 | 对齐新应用、公共包和 happy-dom/jsdom 选择 |
| `tsconfig.json` | 重写合并 | 新别名、工程引用、严格度和 Vue 类型 |
| `eslint.config.js` | 适配 | 把源 `.eslintrc.cjs` 规则迁入目标 flat config，不倒退配置格式 |

迁入时以源工作树当前内容为候选，而不是直接采用源 HEAD；实施前生成文件清单和内容摘要，明确纳入源工作区现有改动。

### 5.2 公共包迁入闭包

| 包 | 目标路径 | 内部依赖 | 外部关键依赖 |
|---|---|---|---|
| `@spark-template/core` | `packages/platform/core` | 无 | axios |
| `config` | `packages/platform/config` | core | 无 |
| `navigation` | `packages/platform/navigation` | 无 | 无 |
| `realtime` | `packages/platform/realtime` | core | EventSource/fetch capability由core提供 |
| `qyapi` | `packages/data/qyapi` | core, navigation | 无 |
| `ai` | `packages/data/ai` | core, realtime | 无 |
| `ui-contracts` | `packages/ui/base/contracts` | 无 | 无 |
| `design-tokens` | `packages/ui/base/tokens` | 无 | CSS |
| `ui` | `packages/ui/base/vue` | core, ui-contracts | TipTap, DOMPurify, Vue/Router/Element peers |
| `organization-ui` | `packages/ui/domain/organization` | ui, ui-contracts | Vue/Element peers |
| `qyapi-ui` | `packages/ui/domain/qyapi` | qyapi, ui | Vue/Element peers |
| `ai-ui` | `packages/ui/optional/ai` | ai | Vue peer |
| `graph-ui` | `packages/ui/optional/graph` | 无 | LogicFlow peer |
| `report-ui` | `packages/ui/optional/report` | 无 | ExcelJS, Vue/Element peers |

明确不迁入：`pmp-data`、`zcppc-data`、`ui-taro`，除非实施时发现 metadata 的真实传递消费者；一旦发现必须暂停并修订计划。

### 5.3 根工程配置

| 文件 | 改动 |
|---|---|
| `package.json` | 改名/描述为 metadata 产品；脚本变为纯前端和工作区包；删除 Java、旧 class-model、旧页面设计验证脚本 |
| `pnpm-workspace.yaml` | workspace 扩展为 `packages/*/*`、`packages/*/*/*`；统一 catalog/overrides/allowBuilds |
| `pnpm-lock.yaml` | 由批准后的依赖安装生成；不得手工拼接 |
| `.env.example` | 采用 metadata 变量集合，不放 Token、密码、Nacos或数据库秘密 |
| `.env.java*` | 删除 |
| `.gitignore` | 去除本仓 Java 专属产物规则，保留通用 secret、dist、node_modules 规则 |
| `SPARK_AppWorks.code-workspace` | 移除 `spark-ai-server` 目录引用，加入分层 packages |
| `README.md` | 只描述 metadata 前端、lowcode gateway 前置条件和验证方式 |
| `CONTRIBUTING.md` | 更新真实命令和目录，不修改通用 7 阶段治理 |

### 5.4 脚本处置

| 当前文件/族 | 目标处置 |
|---|---|
| `scripts/start-dev.mjs` | 改为读取 runtime/env、探测 gateway 和关键端点、启动 Vite；不启动 Java/Docker |
| `scripts/build-all.mjs` | 删除；根 `build` 直接构建依赖包和 Vite |
| `scripts/build-shared.mjs` | 删除 Java/JAVA_HOME/Maven/compose 部分；若无前端消费者则全删 |
| `scripts/load-java-env.mjs` | 删除 |
| `scripts/build-frontend.mjs` | 如仍提供 metadata 构建价值则改造，否则用 Vite 标准命令替代 |
| `scripts/*page-design*`、`*project-planning*`、`*class-model*` | 随旧产品删除，先反查 package scripts/tests/docs 消费者 |
| `tools/verify-pages-config.mjs`、`verify-workflow-designs.mjs` | 删除旧协议验证 |
| `tools/verify-architecture.mjs`、依赖检查 | 改为新分层包与 metadata 架构门禁，不能直接删除所有治理 |

### 5.5 最终删除集合

删除动作仅在全链路验收通过后执行：

- `spark-ai-server/` 全目录。
- 旧 `src/` 内容（由新应用完整替换）。
- 所有 `packages/spark-*`，前提是新应用 import 图中消费者为零。
- 旧 `data/`、`config/`、`generated/` 中只服务旧项目模型、ClassModel、页面配置的内容。
- 旧 `docs/` 中描述已经删除产品的材料；同步维护文档 allowlist。
- 旧 `tests/` 中只验证本仓后端端点、页面四文件、旧项目模型、Host Run 的测试。
- `dev-startup*.log/pid` 等旧启动产物；删除前检查进程句柄。

不删除：`AGENTS.md`、`ai-coding-kit/`、`knowledge/`、仍有效的通用治理脚本和本任务 notes。

## 6. 配置设计

### 6.1 浏览器可见配置

保留并统一以下非秘密配置：

```dotenv
VITE_APP_CODE=metadatamanagement
VITE_APP_TITLE=元数据管理平台
VITE_DEPLOYMENT_ID=metadata-local
VITE_SERVER_TIMEZONE=Asia/Shanghai
VITE_API_BASE_URL=
VITE_API_PREFIX=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:<gateway-port>
VITE_REQUEST_TIMEOUT=15000
VITE_ENABLE_GM_ENCRYPT=false
VITE_ENABLE_GM_AAD=false
VITE_FILE_BASE_URL=
VITE_AUTH_LOGIN_PATH=/LoginAuthority/UserLoginByEnt
VITE_AUTH_PROFILE_PATH=/LoginAuthority/GetUserInfo
VITE_AUTH_REFRESH_PATH=/LoginAuthority/refresh
VITE_AUTH_LOGOUT_PATH=/LoginAuthority/UserLogoutByEnt
VITE_TENANT_CATALOG_PATH=/DataOperation/GetBaseData
VITE_APPLICATION_CATALOG_PATH=/DataOperation/GetData
VITE_SSE_ENABLED=true
VITE_SSE_AUTH_PATH=/sse/connect
VITE_SSE_SCOPE=user
VITE_BASE_PATH=/
```

实际 gateway 端口必须从 lowcode 当前配置或部署环境确认，不在代码中猜测。生产环境优先同源 `/api` 反向代理；浏览器不得看到 Nacos、Redis、数据库或下游服务地址。

### 6.2 部署期配置

- `public/runtime-config.json`（或等价部署注入文件）覆盖环境相关值。
- 配置解析记录字段来源：应用默认、构建环境、部署运行时。
- error 级缺失配置阻止启动；warning 只用于可选能力。
- API base URL 与 prefix 规范化，避免 `/api/api`、丢斜线或跨域凭证错误。

## 7. 运行契约设计

### 7.1 HTTP与认证

- 唯一实例：`createPlatformCommunicationRuntime`。
- Token profile：`metadata-management`。
- 认证请求、刷新并发、401 失效、GM、multipart、文件下载全部归 core。
- feature/page 层只能通过 `communicationRuntime.api`、QYAPI facade 或文件 facade 调用。
- 禁止新增 Axios 实例、裸 fetch、手写 Authorization、产品级 EventSource。

### 7.2 QYAPI

- 查询：`/DataOperation/GetData`；租户基础数据按配置使用 `GetBaseData`。
- 写入：`/DataOperation/BatchTableOperateRequestByCRUD`。
- 批量写必须检查响应 extras 中的部分失败，不能只看 HTTP 200。
- 更新/删除必须携带原查询上下文和后端权限投影；禁止前端聚合角色后自行放权。
- 文件、流程、接口等专用操作仍通过 QYAPI client 的 endpoint 方法，保持统一错误与审计元数据。

### 7.3 动态导航

- 顺序固定：恢复认证 → 加载应用 → 加载授权导航 → 注册组件路由。
- 应用切换必须撤销旧动态路由、缓存和页签，再加载新树。
- 每个 componentKey 必须属于：本地页面、外部产品、明确不支持三类之一。
- fallback 页面显示 componentKey/path/applicationId 和处置原因，不能冒充迁移完成。

### 7.4 文件

- 上传：`/File/UploadFile`。
- 下载：`/File/DownFile`。
- Excel：`/File/ExportExcel`。
- 文本内容：`/File/content/text`。
- 文本上传：`/File/uploadFileByStr`。
- 文件大小、类型、权限、超时、进度、中止和错误包络必须纳入测试。

### 7.5 流程

- 设计读取：`/File/GetFlowDesignInfo/{flowId}`。
- 设计保存：`/File/SaveFlowDesignInfo`。
- 表单关系：`/Flow/SaveFlowAndFormRelation/{flowId}`。
- 运行操作使用 lowcode Flow/Workflow 的真实接口；不映射到旧 workflow-designs 文件协议。
- 撤回、强撤、退回、强退、转发起人、加签属于真实业务状态改变，人工验收前必须单独确认测试数据范围。

### 7.6 AI、MCP与实时通信

- AI 使用 `createLowcodeAiAgentRuntime`，依赖 core + realtime。
- 会话与消息采用 lowcode conversation/message 接口；不导入旧会话数据。
- 流式响应可由 lowcode SSE 或 stream endpoint 提供，具体路径以现有 runtime 配置和源码为准。
- MCP 工具必须通过 gateway 和 MCP 服务；浏览器不直连 MCP server。
- 工具调用验收覆盖：发现、参数校验、成功、业务失败、超时、断线、取消、重复提交。
- 删除旧 `ai-host-run-request/result`、`llm-frame` 等协议消费者前，建立等价能力矩阵；无等价需求的旧能力明确删除，不做兼容层。

## 8. 开发与部署行为

### 8.1 `pnpm dev`

执行顺序：

1. 读取 `.env.local`/环境变量。
2. 校验 API prefix 和 gateway target。
3. 只读探测 gateway；不启动或停止 lowcode 进程。
4. 探测认证、DataOperation、文件、AI/MCP 路由的可达性；未登录返回 401/403 也可证明路由存在，不能一律要求 200。
5. 输出按能力分组的诊断，不输出秘密或完整 Token。
6. 启动 Vite。

### 8.2 `pnpm build`

执行顺序：

1. 构建/类型检查公共包。
2. 根应用 typecheck。
3. 根应用 Vite build。
4. 检查 manifest、动态 chunk 和部署 base。
5. 检查产物不存在 Java JAR、旧页面种子和后端环境文件。

### 8.3 部署

- lowcode 继续由现有 Nacos/微服务部署体系管理。
- 前端静态产物由 Web 服务器托管。
- Web 服务器把统一 API prefix 反向代理到 gateway。
- SSE 路径禁用缓冲和不合适的压缩；超时大于业务流式会话需求。
- SPA history fallback 仅作用于前端路由，不吞掉 `/api` 和 SSE。

## 9. 实施波次与最小验证

### 波次 0：冻结与基线

修改：仅研究/清单文件。

- 记录三个根的 branch、HEAD、dirty files。
- 对 metadata 源文件和14个候选包生成内容摘要。
- 跑当前目标 `pnpm run typecheck`，记录既有失败。
- 跑源 workspace 的 metadata type-check/test/build，记录源基线。
- 不启动 lowcode，不执行业务写入。

退出条件：源快照和目标回滚边界可追踪。

### 波次 1：workspace与核心通信包

修改：`package.json`、`pnpm-workspace.yaml`、lockfile、platform/core/config/navigation/realtime。

最小验证：核心包 typecheck + unit test + import smoke。

退出条件：单一 Vue/Router/TypeScript/Vite 版本解析，无重复 Vue runtime。

### 波次 2：根应用静态启动

修改：`src/main.ts`、config、bootstrap、App、基础样式、index、Vite/TS config。

最小验证：配置单测、typecheck、离线 build。

退出条件：无后端时显示可理解的启动/连接错误，而非白屏。

### 波次 3：认证与应用上下文

修改：core runtime 接线、auth、applications、登录页和路由守卫。

最小验证：mock contract tests；经授权的 lowcode 环境只读登录冒烟。

退出条件：登录、恢复、刷新、退出、401、并发刷新、应用加载均可判定。

### 波次 4：动态导航和应用壳

修改：navigation、shell、workspace-tabs、全部 route resolver。

最小验证：导航 fixture、动态注册、切应用、未知组件测试。

退出条件：所有后端导航节点都有明确 disposition。

### 波次 5：QYAPI只读能力

修改：qyapi、基础页面、数据库/表/视图/用户/组织等查询链。

最小验证：QYAPI transport/normalizer tests + 只读页面人工冒烟。

退出条件：加载、空态、分页、筛选、权限字段和错误态完整。

### 波次 6：QYAPI写入、权限和文件

修改：CRUD、批量保存、权限组件、文件和Excel。

最小验证：请求形状测试、部分失败测试、权限测试、受控测试数据人工操作。

退出条件：新增/更新/删除/上传/下载均保留原查询与权限语义；真实写入需用户另行授权。

### 波次 7：流程、报表和高级编辑器

修改：graph、report、TipTap相关UI、流程页面。

最小验证：设计读写 contract tests、chunk build、非破坏性读取冒烟。

退出条件：保存、运行类真实状态改变尚未获授权时标记待人工验收，不伪造通过。

### 波次 8：AI、MCP、SSE

修改：data/ai、ai-ui、realtime、页面AI接线。

最小验证：流帧组装、重连、取消、工具调用、重复请求和超时测试。

退出条件：不再请求旧 AI Session/Host Run/Event 端点。

### 波次 9：构建与部署切换

修改：dev/build脚本、env模板、README、workspace文件、部署配置样例。

最小验证：clean install、dev探测、production build、preview和反向代理检查。

退出条件：目标仓运行不要求 JDK、Maven、Docker MySQL 或 8180。

### 波次 10：旧系统退休

修改：删除 `spark-ai-server`、旧 src、旧 packages、旧 scripts/tests/docs/data/generated/config。

最小验证：每个删除组后立即 typecheck 或对应治理检查；禁止一口气删完再定位。

退出条件：完整验证通过，残留扫描为零。

## 10. 验收矩阵

### 10.1 自动验证

按顺序执行：

1. `pnpm run typecheck`
2. `pnpm run lint`
3. `pnpm run test`
4. 公共包定向测试
5. `pnpm run build`
6. 架构、依赖、secret、API transport、目录层次和bundle预算检查

必须新增或保留的门禁：

- 产品代码禁止裸网络出口。
- 浏览器配置禁止微服务物理地址和秘密。
- 每个 workspace 包公共出口可解析。
- 动态导航组件映射有覆盖报告。
- QYAPI操作存在 operationId/请求证据。
- 单目录文件和子目录数量满足治理限制。
- 构建产物不含旧后端或源工作区绝对路径。

### 10.2 人工只读验收

- gateway 可达。
- 登录页租户目录加载。
- 登录、刷新页面、恢复会话、退出。
- 应用列表、应用切换、导航刷新。
- 各页面查询、分页、筛选、空态和权限态。
- 文件列表/下载、流程与报表读取。
- AI 流式响应、MCP只读工具、SSE断线重连。
- license/register/IoT 服务路由隔离与不可用提示。

### 10.3 真实状态变更验收

以下动作必须使用授权测试租户/数据，并在执行前再次确认：

- 用户、角色、权限、应用、导航的创建或删除。
- 数据库/表/视图注册及关系修改。
- 批量数据保存和删除。
- 文件上传和删除。
- 流程发起、撤回、强撤、退回、强退、加签。
- 报表/流程设计保存。
- AI/MCP 中可能写入业务数据的工具调用。

## 11. 退休残留门禁

最终必须对全仓执行残留扫描，以下内容除历史迁移记录外均应为零：

```text
spark-ai-server
build:java
JAVA_HOME
BACKEND_PORT
AI_BACKEND_URL
127.0.0.1:8180
/api/config/default
/api/ai/host-run
/api/ai/sessions
/api/events
seed-pages-config
pages-config/routes.json
```

另需验证：

- package scripts 不调用 Maven或本仓 Docker compose。
- Vite proxy 只指向 gateway。
- dist 不含旧应用 chunk。
- tests 不再启动或模拟本仓 Java 服务。
- docs 不再把本仓后端描述为当前架构。

## 12. 兼容性与破坏性变更

- 删除本仓全部后端公共面，属于明确破坏性变更。
- 删除旧根产品、路由、项目模型、页面四文件、ClassModel运行入口。
- 不提供 `/api/tenants/{tenant}/projects/{project}` 的兼容 API。
- 不迁移旧用户和 Token；所有用户重新通过 lowcode 身份体系登录。
- 不迁移旧 AI 会话；历史对话不可从新产品查询。
- metadata 现有 URL 和动态导航语义成为新基线。

## 13. 风险与缓解

| 风险 | 证据 | 缓解 |
|---|---|---|
| 源 workspace 大量未提交改动 | source audit git status | 冻结内容摘要，不按 HEAD盲拷贝 |
| pnpm/Vite/TS/Vitest大版本冲突 | 两仓 manifests | 波次1先完成工具链单版本化 |
| Vue Router 4与5差异 | 源/目标 catalog | 以 metadata 路由行为测试决定版本，不机械升到5 |
| 动态导航有未知组件 | router fallback存在 | 生成组件映射覆盖报告和明确外部页 |
| QYAPI HTTP 200但部分保存失败 | transport显式解析extras | 保留部分失败检查测试 |
| lowcode服务可达但依赖未就绪 | Nacos/Redis/DB分布式依赖 | 健康检查分为路由、认证、业务能力三级 |
| SSE代理缓冲 | 流式AI/realtime | 部署配置专门验证压缩、缓存和超时 |
| AI协议不等价 | 旧Host Run vs MCP | 明确删除旧协议，按用户可见能力验收新链路 |
| 删除传播面大 | 后端端点与旧包众多 | 删除作为最后波次，分组删除并即时验证 |
| 真实业务写入风险 | QYAPI/流程/权限 | 自动测试优先，真实写入逐项再授权 |

## 14. 回滚策略

- 不创建或切换分支，除非用户另行授权。
- 不使用 `git reset --hard` 或对整个目录执行盲目恢复。
- 每个波次记录修改文件、基线摘要和验证输出。
- 波次失败只恢复该波次明确文件；源工作区保持只读。
- 旧后端物理删除前确认其内容已在现有 Git 提交中可恢复；若存在未跟踪后端内容，先停下报告。
- 最终删除后失败，先恢复最近删除组，再判断是修订方案还是继续。

## 15. 开工检查

收到明确批准后，开始任何生产代码修改前必须：

1. 将本计划状态改为 `approved`，实施前再改为 `implementing`。
2. 运行三个工作树的 `git status`，列出与本任务重叠的用户改动。
3. 确认当前目标分支是否允许承载此次大规模替换。
4. 检查运行中的 Node/Java/Maven进程和锁文件。
5. 执行目标仓 typecheck 基线。
6. 执行 metadata 源应用 type-check/test/build 基线。
7. 只读确认 lowcode gateway 的实际地址、profile和健康端点；不启动、不修改服务。
8. 向用户对齐本轮仅执行“波次0”，涉及文件和验证动作。

## 16. 完成定义

只有同时满足以下条件才能宣称完成：

- 所有在范围内的 metadata 页面有真实组件与真实 lowcode 数据。
- 所有动态导航节点有接受的处置。
- HTTP、QYAPI、文件、流程、AI、MCP、SSE 验收通过。
- license、register、IoT 按本计划完成平台级可达性和隔离验收。
- 自动验证和经授权的人工验收均有结果记录。
- `spark-ai-server` 及其运行、构建、配置、测试依赖已删除。
- 本仓无需 JDK、Maven、本仓 MySQL和8180即可开发及构建前端。
- 残留门禁通过。
- 阶段7知识候选已经展示并由用户决定是否沉淀。
- 度量已追加，完成计划按治理要求删除。
