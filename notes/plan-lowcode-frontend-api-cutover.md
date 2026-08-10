状态：implementing

# AppWorks 前端 API 体系化对接 lowcode 与本仓后端退役计划

## 任务目标

在不修改 `E:\lowcode-jdk17`、不删除任何 AppWorks 前端功能或前端代码能力的前提下，新增可独立发布的 `@spark-appworks/spark-lowcode-api` 公共包，把 AppWorks 全部可达生产功能直接迁移到 lowcode 现有接口；不保留兼容层、薄壳转发或页面本地请求实现。完成资产迁移与全量 readback 后，物理删除 `spark-ai-server` 及其 Java 构建、启动、Docker 和旧代理链路。

## 已确认决策

1. `E:\lowcode-jdk17` 永久只读，不修改 Java、POM、Nacos、数据库和部署配置，不作为编译依赖。
2. AppWorks 不建设新后端；本仓 `spark-ai-server` 最终完整物理删除。
3. 不删除任何现有前端功能或前端代码能力；全部可达生产页面均需利用 lowcode 现有接口完成语义对接。
4. 新增公开包 `@spark-appworks/spark-lowcode-api`，它是 lowcode 前端合同与客户端的唯一 SSOT。
5. 不考虑向后兼容，不保留 `src/services` 薄适配层；必要时先用简短语义注释记录旧行为，再删除旧实现并修改消费者直接使用新公共包。
6. `backend-api-contracts` 升级为由 lowcode 源码和行为 characterization 生成或校验的旧端点账本、fixture 和差分索引；生成合同进入公共包，包内提供手写的稳定领域门面。
7. 开发环境由 Vite 将同源 `/api` 代理到单一 `LOWCODE_GATEWAY_URL`；生产继续使用同源 `/api`；变量缺失时启动 fail-fast。
8. `AuthService` 的业务语义保留，但旧实现和旧端点删除；新认证能力直接由公共包对接 `/api/LoginAuthority/*`。
9. 范围覆盖当前全部可达生产功能：平台管理、页面设计、导航、动态数据、DBMS、工作流、文件、AI/SSE 以及薪资客户 35 页。
10. `spark-ai-server/data` 的可达资产必须先绑定既有远端身份或迁入 lowcode，并通过 readback；未证明迁移完成的资产不得删除。

## 执行顺序裁决

用户选择了“完整物理删除后端”，同时确认“前端功能零删除、全面对接、资产先 readback”。仓库强制最小闭环又禁止首次修改后长期处于不可验证状态。因此：

- 后端退役是本计划的首要交付目标，不是保留选项。
- 物理删除作为退役波次的最后一个原子步骤，与消费者替换证明和资产 readback 绑定。
- 禁止先删除 258 个服务器文件、让全部前端请求失效，再跨多个未批准闭环补回。
- 任一 lowcode 等价能力或资产 readback 未闭合时，计划状态转为 `blocked`，不以 404、假数据、LocalStorage 或下线功能绕过。

## 目标层次

```text
AppWorks product / packages
  -> @spark-appworks/spark-lowcode-api
       -> LowcodeApi                        公共总门面
          -> LowcodePlatformApi             登录、身份、企业、应用、导航、平台配置
          -> LowcodeDesignApi               页面文件、版本、工作流设计、策划附件
          -> LowcodeDataApi                 QYAPI、数据空间、模型、字段、关系、DBMS、文件
          -> LowcodeRealtimeApi             SSE、消息、AI turn/agent-loop
       -> generated contracts               生成 DTO、端点、响应外壳；不作为业务门面
       -> injected transport/context        同源 HTTP、Token、企业、应用、账套上下文
            |
            +-- /api -> LOWCODE_GATEWAY_URL (dev)
            +-- /api -> same-origin reverse proxy (prod)
```

公共导出控制在总门面、四个领域门面及必要的配置/结果类型；内部 resolver、provider、generated helper 不从根 barrel 暴露。generated contracts 通过明确的 `./contracts` 子路径发布，禁止根入口 `export *`。

## 影响范围

### 新增公共包

- `packages/spark-lowcode-api/package.json`：公开包元数据、显式 exports、发布配置和依赖。
- `packages/spark-lowcode-api/tsconfig.json`：包内严格类型检查。
- `packages/spark-lowcode-api/tsconfig.build.json`：声明产物构建。
- `packages/spark-lowcode-api/vite.config.ts`：库模式 JS 构建。
- `packages/spark-lowcode-api/vitest.config.ts`：包级测试配置。
- `packages/spark-lowcode-api/eslint.config.js`：包级 lint 项目边界。
- `packages/spark-lowcode-api/README.md`：安装、注入、领域门面和发布使用说明。
- `packages/spark-lowcode-api/src/index.ts`：最小公共根入口。
- `packages/spark-lowcode-api/src/core/`：注入式 transport、请求上下文、Envelope/Jackson 解析和错误模型。
- `packages/spark-lowcode-api/src/contracts/`：由 characterization 生成的 DTO、端点元数据和显式子路径入口。
- `packages/spark-lowcode-api/src/platform/`：认证、企业、应用、导航和平台配置领域门面。
- `packages/spark-lowcode-api/src/design/`：页面文件/版本、工作流设计和策划附件领域门面。
- `packages/spark-lowcode-api/src/data/`：QYAPI、数据空间/模型/字段/关系、DBMS 和文件领域门面。
- `packages/spark-lowcode-api/src/realtime/`：lowcode SSE、消息和 AI agent-loop/turn 领域门面。
- `packages/spark-lowcode-api/src/tests/`：合同解析、端点构造、权限快照、身份上下文和领域门面测试；按领域分子目录，避免单目录超过 10 个源文件。

### Characterization 与生成

- `backend-api-contracts/README.md`：从静态手工说明升级为账本生成/校验入口说明。
- `backend-api-contracts/api-metadata.json`：补充来源证据、控制器覆盖和生成版本。
- `backend-api-contracts/common.ts`：迁入生成源或由生成器替代，不再作为根目录未纳入 TS project 的孤立源文件。
- `backend-api-contracts/endpoints.ts`：升级为可校验端点账本输入。
- `backend-api-contracts/index.ts`：停止作为产品运行时入口。
- `backend-api-contracts/lowcode-endpoint-ledger.json`：旧端点、源码证据、请求/响应、消费者、lowcode 等价和 gap 状态。
- `backend-api-contracts/appworks-consumer-ledger.json`：AppWorks 可达消费者与替换状态。
- `backend-api-contracts/legacy-asset-manifest.json`：118 个服务器数据资产的身份、消费者、目标引用和 readback 状态。
- `tools/lowcode-contracts/`：只读解析/生成/一致性校验脚本；不启动或修改 lowcode。
- `tests/lowcode-contracts/`：characterization fixture、大小写/Envelope/参数位置和生成稳定性测试。

### Workspace、构建和发布

- `package.json`：加入工作区依赖和包级命令；移除 Java server 构建/启动入口；根 build 只构建 packages 与前端。
- `pnpm-lock.yaml`：按新 workspace 包依赖机械更新。
- `tsconfig.json`：加入 `@spark-appworks/spark-lowcode-api` 源码路径。
- `tsconfig.typecheck.json`：将新包纳入根类型检查，消除当前 contracts ESLint/TS project 脱节。
- `vite.config.ts`：加入包 alias；`/api` 使用 `LOWCODE_GATEWAY_URL`，缺失时 fail-fast；保留 SSE 代理语义。
- `.env.example`、`.env.local.example`：记录变量名和非敏感示例，不保存真实地址或凭据。
- `.env.java.example`：随 Java 链路删除。
- `scripts/start-dev.mjs`：删除 Docker/MySQL/JDK/Maven 启动，改为验证 gateway 配置后只启动 Vite。
- `scripts/build-all.mjs`：删除或由根脚本移除引用，不保留“all”兼容入口。
- `scripts/load-java-env.mjs`：删除。
- `scripts/build-frontend.mjs`、`scripts/build-packages.mjs`、`scripts/publish-packages.mjs`：让新包进入现有自动发现、构建和 dry-run 发布验证。
- `README.md`、`scripts/README.md`：删除本仓 Java server 使用说明，改为 lowcode gateway 前置条件和纯前端交付说明。

### 旧前端服务实现与直接消费者

- `src/services/auth.ts`：记录并删除旧 `/api/auth/*` 实现；消费者直接改用 `LowcodePlatformApi`。
- `src/services/http.ts`：删除旧应用级物理客户端 SSOT；在应用 composition root 创建并注入新包 transport/context。
- `src/services/api-paths.ts`：删除旧 `tenants/{tenant}/projects/{project}` 服务器路径实现；使用 lowcode 领域方法和稳定身份参数。
- `src/services/sse-events.ts`：删除旧 `/api/events` v4 server envelope 实现；改接 lowcode `/api/sse/connect` 及真实事件语义。
- `src/services/ai/ai-turn-bridge.ts`、`ai-host-run-bridge.ts`、`ai-host-run-smoke-launcher.ts`：删除本仓 server 专用传输，保留前端 AI/ToolLoop 功能并直接组合新 realtime/AI 门面。
- `packages/spark-app/src/auth/AuthService.ts` 及其公共导出/测试：删除旧实现，不提供兼容 class；应用直接使用新包平台门面。
- `src/main.ts`、`src/App.vue`：建立唯一 `LowcodeApi` 实例，注入认证/企业/应用/账套上下文，重接导航、页面和 SSE 生命周期。
- `src/views/platform/PlatformApps.vue`、`TenantConfigPanel.vue`、`src/views/tenant/AppList.vue`、`CacheManager.vue`：直接改用新平台/数据门面。
- `src/views/app/DBMS.vue`：直接改用 DBMS/Data 门面，保留全部页面功能和状态语义。
- `src/views/app/dev-system/DevDataSetDesigner.vue`、`useDevState.ts`：直接改用设计/数据门面。
- `src/services/project/project-shell.ts`、`project-settings.ts`：改用 new package navigation/project contract。
- `src/services/page-design/page-design-headless.ts`：改用设计门面。
- `src/services/project-planning/project-planning-headless.ts`、`project-planning-attachments.ts`：改用工作流/文件门面。
- `packages/spark-project-model/src/io/navigation-client.ts`、`page-content-loader.ts`、`page-file-api.ts`、`project-reference-client.ts`、`project/project-workspace.ts`：移除对旧服务器路径形状的所有权；领域模型继续只接收注入式 public client。

### 导航、数据空间和权限

- `packages/spark-project-model/src/navigation/project-node.ts`：加入真实 `conid`，不新增平行 scenario 身份。
- `packages/spark-app/src/router/dynamic.ts`：把完整导航节点传入运行页，Vue path 只负责组件寻址。
- `packages/spark-project-model/src/page/runtime-page.ts`、`config-page.ts`：页面运行闭包从真实 `conid` 对账数据空间/模型；模块、外链、动作页不创建数据空间。
- `packages/spark-data/src/types.ts`：增加源忠实的 QY 查询/权限快照合同，保留五个稀疏集合和独立读写通道。
- `packages/spark-data/src/data-table.ts`、`data-view.ts`、`dataset.ts`：增加原子 `execQueryResult` 注册、originalRows、总数、`allowAdd`、`lingma_sys_key` 和提交上下文。
- `packages/spark-component/src/permission/PermissionChecker.ts`、`PermissionResolver.ts`、`FieldRenderHelper.ts`、`PermissionFilter.ts`、`usePermission.ts`：删除 QY 场景的缺省放行，按后端最终权限、最小单元交集和业务可用性交集消费；不压缩 `r/e/h/m/d`。
- 所有动作容器和字段消费者：继续通过统一 permission 模块取值，不读取第二份页面权限状态。

### 服务器资产迁移与删除

- `spark-ai-server/data/pages-config/**`：逐项对账真实页面身份，通过 lowcode 页面/文件接口迁移或绑定后 readback。
- `spark-ai-server/data/workflow-designs/**`：通过 lowcode 现有流程设计文件接口迁移/绑定并 readback。
- `spark-ai-server/data/manifest.json`、删除页记录和 page meta：转化为 characterization/迁移证据，不作为运行时本地真源。
- `spark-ai-server/**`：258 个受管理文件在资产和消费者验收完成后整目录删除，包括 `src/`、`pom.xml`、`Dockerfile`、`docker-compose.yml`、README 和 data。
- 只服务本仓 server 的 smoke/迁移脚本：逐个改为 lowcode API 验证；无法表达前端生产功能且仅验证已删除 Java 实现的脚本随退役删除。

## 技术方案

1. **基线与账本闭环**
   - 从 Git、路由和 import 图生成 AppWorks 消费者台账。
   - 从 `E:\lowcode-jdk17` 只读源码与已有行为证据生成/校验端点账本。
   - 生成 118 个 data 资产的迁移清单；记录稳定身份、内容摘要和目标 readback 条件。
   - 任一可达功能没有 existing lowcode 等价时标为 `blocked`，不得自行新增后端。

2. **可发布公共包闭环**
   - 建立总门面、四个领域门面、generated contracts 子路径和注入式 transport/context。
   - generated DTO 保留 Jackson 字段大小写与参数位置；领域门面把历史协议归一为清晰的前端语义结果。
   - canonical 字段类型限定为字符串、整数、定点小数、布尔、日期/时间和受控 JSON 文本。
   - 运行 `build`、包级 typecheck/lint/test、`pnpm pack` 和根 `publish:dry`，证明包可发布。

3. **启动、认证与唯一上下文闭环**
   - 先建立 `LOWCODE_GATEWAY_URL` fail-fast 代理和 composition root。
   - 对接 LoginAuthority 登录、用户、Token、刷新、退出、企业、应用和可选账套。
   - 修改全部认证消费者直接使用公共包，然后删除旧 AuthService/auth/http/api-paths 实现。

4. **导航、页面与 QY 数据闭环**
   - 后端导航是唯一树事实；`conid = 场景 ID/FormKey`。
   - 只有真实 Vue 运行页建立数据空间闭包；物理资源、数据空间、modelId 和页面闭包四层不混同。
   - 查询响应通过一个原子快照进入 DataTable/DataView；权限与数据不得分步写入。
   - 更新只发送真实差异并携带 originalRows/`lingma_sys_key`；所有 mutation 验证现有接口的 preimage、幂等、短事务、journal、readback 和补偿能力。

5. **全产品领域消费者闭环**
   - 按平台管理、页面设计、DBMS、工作流、文件、AI/SSE 的顺序，每轮只替换一个明确领域及其对应验证。
   - 删除各领域旧实现，不保留 facade-to-facade 转发。
   - 薪资 35 页作为首个真实业务 characterization 集，保留现有 QY 身份并对账 11 个 MSSQL 来源。

6. **资产迁移和 readback 闭环**
   - 对每个页面/工作流资产计算写前摘要，使用现有 lowcode 接口迁移或绑定。
   - live mutation 必须另行取得明确授权；未授权时只生成待执行清单和只读对账，不伪造完成证据。
   - readback 内容、身份和摘要一致后，资产项才标为 completed。

7. **后端物理退役闭环**
   - 运行消费者残留扫描、资产状态检查和纯前端构建基线。
   - 删除 `spark-ai-server/**`、Java env、Maven/Docker 启动和根脚本引用。
   - 首次删除后立即执行最小验证：配置加载、Vite 启动、认证 API probe 和根 typecheck；失败只在退役闭环内修复。
   - 完成全套自动化、浏览器验收和回退说明后才宣告退役完成。

## 实施进度

- 已完成公共包首个最小闭环：建立 `@spark-appworks/spark-lowcode-api` 的独立发布配置、稳定根入口、显式 `contracts` 子路径、注入式 `HttpClientBase` transport、`LowcodeApiError` 和 `LowcodePlatformApi.getCurrentUser()`。
- `getCurrentUser()` 已按只读 Java 源码中的 `AjaxResult`、`LoginController.GetUserInfo()`、`LoginServiceImpl.GetUserInfo()` 与 `LoginUserOutput` 对齐；wire 合同保留 `Code/Message/Result/Type/Extras/Time` 大小写，领域结果归一为稳定 nullable 字段并在畸形响应时 fail-closed。
- 已通过包级 typecheck、lint、3 个 characterization 测试、build、`npm pack --dry-run`、构建产物导出冒烟、根 typecheck、架构检查和依赖目录检查。
- `verify:ai-codegen` 仍仅报告实施前已知的 6 个无关违规；本闭环未新增规则违规。能力目录 `workspace.catalog.json` 与 `docs/platform-capabilities.generated.json` 仍不存在，无法执行 capability owner 的机器查询。
- 下一最小闭环：完整对齐 LoginAuthority 登录/刷新/退出与可选国密协议，再在公共包内建立认证会话语义；尚未修改现有消费者或删除任何后端文件。

## 关键设计决策及理由

- **新包而非散落 service**：用户要求可发布、体系化、层次化；公共包是唯一合同与客户端 SSOT。
- **生成合同 + 手写领域门面**：生成层保证源忠实，手写门面隔离历史 Endpoint/Jackson 细节，避免业务代码消费 `unknown` registry。
- **不保留兼容层**：旧 imports 和实现直接删除，所有消费者在同一领域闭环改到新门面。
- **物理删除在替换/readback 后执行**：这是“完整删除”与“前端功能零删除、资产不丢失”同时成立的唯一可验证顺序。
- **浏览器不补造后端保证**：lowcode 不具备的原子性、权限或补偿能力必须阻塞，不以客户端技巧冒充。

## 兼容性

- 这是明确的破坏性内部重构：旧 `src/services`、旧 `AuthService`、旧服务器端点和 Java 开发入口全部删除，不提供 deprecated 转发。
- 前端用户可见功能、路由和业务语义不得减少；调用源由本仓 server 改为 lowcode gateway。
- 公共包作为新发布面使用 semver；首版 API 在本次迁移完成前可处于 `0.x`，但同一版本内不同时维护新旧协议。
- `E:\lowcode-jdk17` 和现有 QY 身份不发生代码或结构性修改。

## 验证计划

- 编译基线：实施前先运行 `pnpm run typecheck` 并记录现有结果。
- 包级检查：`pnpm --filter @spark-appworks/spark-lowcode-api run typecheck`。
- 包级 lint：`pnpm --filter @spark-appworks/spark-lowcode-api run lint`。
- 包级测试：`pnpm --filter @spark-appworks/spark-lowcode-api run test:run`。
- 类型检查：`pnpm run typecheck`，必须先通过。
- Lint：`pnpm run lint`。
- 规则检查：`pnpm run verify:rules`；当前已知的 6 个非本任务规则违规需作为基线单独裁决，不混入本计划顺手修复。
- 单元测试：`pnpm run test` 与 `pnpm run test:packages:run`。
- 构建：`pnpm run build:packages`、`pnpm run build:frontend`。
- 发布验证：`pnpm run publish:dry`，检查 tarball、exports、声明和 workspace 依赖替换。
- 合同验证：生成稳定性、端点覆盖、Jackson 大小写、参数位置、Envelope、错误和二进制/SSE fixture。
- 残留扫描：禁止出现 `spark-ai-server`、Maven/JDK、8180、`AI_BACKEND_URL`、旧 `/api/auth/*`、旧 `/api/events` 和旧 tenant/project server 路径消费者。
- 资产验证：118 个现有资产逐项具备目标身份和 readback 摘要；未闭合数必须为 0 才能删除源目录。
- 浏览器人工验证：全部可达生产导航、35 个薪资页面、平台管理、页面设计、DBMS、工作流、文件和 AI/SSE 的 loading/error/empty/success 状态。
- live 写入验证：需另行授权；无授权时仅完成只读 probe、dry-run 清单和阻塞报告。

## 风险项

- **lowcode 无等价接口**：立即阻塞对应领域和后端删除，不下线功能、不造假接口。
- **生产 Nacos 路由与源码示例不一致**：以授权环境的只读 discovery/probe 为准，记录差异，不修改 Nacos。
- **资产身份不明或 `conid` 缺失**：从真实 Vue FormKey/运行消费证据对账，禁止生成新身份。
- **旧权限缺省放行**：QY 页面必须在原子后端快照缺失时 fail-closed；通用 demo 权限与 QY 权限分清来源。
- **浏览器无法保证 mutation 不变量**：把能力标为 blocked，禁止用长事务、LocalStorage 或假 journal 冒充。
- **一次性影响面过大**：按领域最小闭环顺序实施，每轮首次修改后立即执行对应最小验证；任何新范围返回计划修订。
- **后端删除不可逆**：删除前以已推送 Git 提交和资产 readback 为恢复依据；禁止使用破坏性 Git 命令扩大回滚范围。
