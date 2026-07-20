状态：superseded

> 2026-07-20：用户审核认为方案深度不足。本计划不再作为实施依据；替代方案将在完成页面、接口、服务、依赖、能力和删除影响面的深度审计后生成。

## 任务目标

用 `metadatamanagement` 完全替换本仓根前端，以未经结构性改造的 `lowcode-jdk17` 分布式微服务为唯一后端，并在全链路验收后移除本仓 `spark-ai-server` 及旧应用运行链路。

## 明确排除

- 不修改、复制或重组 `E:\lowcode-jdk17` 的微服务架构。
- 不把 lowcode 微服务合并成单体。
- 不迁移本仓后端数据库、种子配置、AI 会话或日志。
- 不保留本仓后端兼容层、反向适配服务或双写链路。
- 不在本任务内执行 commit、push、部署或真实 QYAPI 写入。

## 影响范围

### 迁入并成为根应用

- `C:\Users\lgf22\Documents\SPARKProject\apps\metadatamanagement\src` → `D:\SPARK_AppWorks\src`：替换根应用源码。
- `...\metadatamanagement\public` → `D:\SPARK_AppWorks\public`：迁入应用静态资源，逐项处理同名文件。
- `...\metadatamanagement\tests` → `D:\SPARK_AppWorks\tests\metadatamanagement`：迁入产品测试并保持领域分组。
- `...\metadatamanagement\index.html`、`vite.config.ts`、`vitest.config.ts`、`tsconfig.json`、`.eslintrc.cjs`：以目标仓工具链为约束合并，不直接覆盖。

### 按消费者迁入的公共包

- `SPARKProject\packages\platform\core` → `packages\platform\core`
- `SPARKProject\packages\platform\config` → `packages\platform\config`
- `SPARKProject\packages\platform\navigation` → `packages\platform\navigation`
- `SPARKProject\packages\platform\realtime` → `packages\platform\realtime`
- `SPARKProject\packages\data\qyapi` → `packages\data\qyapi`
- `SPARKProject\packages\data\ai` → `packages\data\ai`
- `SPARKProject\packages\ui\base\contracts` → `packages\ui\base\contracts`
- `SPARKProject\packages\ui\base\tokens` → `packages\ui\base\tokens`
- `SPARKProject\packages\ui\base\vue` → `packages\ui\base\vue`
- `SPARKProject\packages\ui\domain\organization` → `packages\ui\domain\organization`
- `SPARKProject\packages\ui\domain\qyapi` → `packages\ui\domain\qyapi`
- `SPARKProject\packages\ui\optional\ai` → `packages\ui\optional\ai`
- `SPARKProject\packages\ui\optional\graph` → `packages\ui\optional\graph`
- `SPARKProject\packages\ui\optional\report` → `packages\ui\optional\report`
- 每个包的传递依赖只有在存在真实编译或运行消费者时才追加到计划；发现新增包时必须暂停并修订本计划。

### 修改的根工程文件

- `package.json`：切换脚本和依赖到新根应用；移除 Java 构建入口。
- `pnpm-workspace.yaml`：支持分层包目录并统一依赖版本。
- `pnpm-lock.yaml`：由批准后的依赖安装机械更新。
- `vite.config.ts`：采用 metadata 根路径、按配置代理 lowcode gateway、保留必要分包策略。
- `vitest.config.ts`、`tsconfig.json`、`tsconfig.node.json`、ESLint 配置：适配迁入应用及公共包。
- `.env.example`：改为 gateway、API 前缀、认证、应用、导航、SSE、文件和 AI/MCP 的非秘密配置模板。
- `.gitignore`：移除本仓 Java 私有环境文件规则，保留前端本地配置保护。
- `README.md`、`CONTRIBUTING.md`：仅更新本次改变后失真的启动、构建和验证说明。

### 删除或退出运行链路

- `spark-ai-server/`：全目录删除。
- `src/`：旧根应用在新应用验收通过后整体由新源码替换，不混留旧页面。
- `packages/spark-*`：逐包反查消费者；无新应用消费者的包删除。
- `scripts/start-dev.mjs`：删除本仓 Java、Docker MySQL启动逻辑，改为前端启动与 gateway 健康检查。
- `scripts/build-all.mjs`、`scripts/build-shared.mjs`、`scripts/load-java-env.mjs`：移除或收束为纯前端/包构建逻辑。
- `.env.java`、`.env.java.example`：删除。
- `tools/`、`scripts/`、`tests/` 中所有仅验证 `spark-ai-server`、旧页面种子和旧后端协议的文件：按引用清单删除。
- `data/`、`config/`、`generated/` 中只供旧应用/旧后端使用的产物：消费者反查为零后删除。

## 技术方案

1. **冻结两个源快照**
   - 记录 `metadatamanagement` 当前文件状态和实际采用的未提交改动。
   - 记录 `lowcode-jdk17` 当前提交与环境变量名称，只读使用其接口和部署事实。
   - 不覆盖目标仓及源工作区当前未提交文件。

2. **建立可验证的依赖闭包**
   - 从新应用所有静态/动态 import 生成直接包清单。
   - 递归读取包 manifest，形成传递依赖 DAG。
   - 对每个包记录消费者；无消费者包不迁入。
   - 对 pnpm 9/11、Vue Router 4/5、Vite 6/8、Vitest 2/4、TypeScript 5/6 的版本冲突逐项选择目标版本，禁止混装两套运行时。

3. **先建立新根应用的离线编译闭环**
   - 将 metadata 应用入口、路由、配置、页面、组件和样式落到根 `src/`。
   - 迁入第一批基础包：core、config、navigation、contracts、tokens、Vue UI。
   - 修改 workspace、alias、构建配置，先通过 typecheck 和 build。

4. **接入 lowcode 统一通信边界**
   - 使用 `createPlatformCommunicationRuntime` 作为 HTTP、认证和响应包络入口。
   - API 请求只指向 lowcode gateway；应用代码不得持有各微服务物理地址。
   - 保留可配置的 API prefix、gateway target、超时、国密配置、文件基址。
   - 增加只读健康检查：gateway 可达性、认证端点、必要服务能力提示；不负责拉起 lowcode 服务。

5. **接入身份、租户、应用和导航闭环**
   - 使用 lowcode 登录、用户资料、刷新、退出接口。
   - 登录后加载租户和应用目录，再以当前应用 ID 加载动态导航。
   - 后端授权导航为唯一菜单事实源；前端路由表只提供组件绑定和明确兜底。
   - 验证 Token、租户、应用上下文、401 失效和重登录行为。

6. **迁入 QYAPI 与元数据业务能力**
   - 迁入 qyapi、qyapi-ui、organization-ui、graph、report 等实际依赖。
   - 按页面垂直闭环依次验证：数据库/服务器、数据表/字段/字典、数据集、流程、API、报表、权限、缓存、脱敏、文件。
   - 所有数据以 lowcode/QYAPI 返回为真源，不引入本仓种子或 mock 运行时兜底。

7. **迁移 AI、MCP 与实时通信**
   - 使用 `createLowcodeAiAgentRuntime` 接入 lowcode LLM/Agent 能力。
   - 使用平台 realtime 包管理 SSE 会话、重连和失效，不复用 `/api/ai/sessions`、Host Run 或本仓 `/api/events` 协议。
   - MCP 通过 lowcode 现有服务和 gateway 契约接入，不在浏览器绕过 gateway。
   - 对旧 AI 能力建立等价矩阵；lowcode 缺少公共能力的项目必须标记 gap，不在前端模拟后端不变量。

8. **切换开发、构建和部署链路**
   - `pnpm dev` 仅运行新前端并探测 gateway。
   - `pnpm build` 仅构建公共包和新前端。
   - 生产产物默认根路径；如部署要求 `/metadata/`，通过 `VITE_BASE_PATH` 配置，不保留第二应用入口。
   - 删除 Java 17、本仓 MySQL、8180 和 `spark-ai-server` JAR 相关假设。

9. **执行全链路验收**
   - 自动检查通过后，在稳定 lowcode 环境验证登录、导航、元数据 CRUD、文件、流程、报表、权限、AI/MCP、SSE。
   - 验证所有网络请求只流向 gateway，不访问本仓后端端点。
   - 验证空态、错误态、权限拒绝、Token 过期和服务不可用提示。

10. **统一退休旧代码**
    - 只有第 9 步全部通过后，删除 `spark-ai-server`、旧根应用、旧专用包、旧脚本、旧测试和旧配置。
    - 删除后再次执行完整验证，并用 `rg` 门禁确认不存在 `spark-ai-server`、`BACKEND_PORT`、`AI_BACKEND_URL`、`build:java`、旧 8180 健康检查和旧 AI 端点引用。

## 最小闭环实施波次

1. 工具链与基础包可编译。
2. 新根应用可离线构建。
3. gateway 通信与登录闭环。
4. 租户、应用和动态导航闭环。
5. QYAPI 核心元数据只读闭环。
6. 元数据写操作、权限和文件闭环。
7. 流程、报表和高级页面闭环。
8. AI、MCP、SSE 闭环。
9. 全链路验收。
10. 旧前后端统一删除及删除后回归。

每个波次首次修改后立即执行对应最小验证；前一波次未通过不得启动依赖波次。

## 关键设计决策及理由

- **lowcode gateway 是唯一后端入口**：保持微服务内部拓扑稳定，避免前端耦合服务发现。
- **不改造 lowcode**：本任务重点是替换目标仓运行边界，不把稳定源系统变成迁移施工面。
- **新前端完全替换旧根应用**：避免双路由、双认证、双导航和双配置长期共存。
- **公共包按消费者迁入**：获得独立构建能力，同时避免复制整个源 workspace。
- **验收后统一删除**：在满足“不保留本仓后端”的最终目标下保留可验证的安全切换点。
- **不迁移旧数据**：lowcode/QYAPI 是唯一事实源，避免双数据库与语义不一致。

## 兼容性

- 根前端产品、路由结构、依赖包命名和构建工具链将发生破坏性变更。
- 本仓原 `/api/tenants/.../projects/...`、页面配置和旧 AI Session/Host Run 契约不再兼容。
- 对外只承诺 metadata 应用与 lowcode gateway 的契约；不提供旧后端兼容层。
- `lowcode-jdk17` 的现有调用方和服务拓扑不应因本次集成发生结构性变化。

## 验证计划

- 基线检查：`git status --short --branch`。
- 依赖安装：`pnpm install --frozen-lockfile`；首次生成新锁文件时使用经过审核的非 frozen 安装。
- 类型检查：`pnpm run typecheck` 或迁入后统一为 `pnpm run type-check`，必须先通过。
- Lint：`pnpm run lint`。
- 单元测试：`pnpm run test`。
- 构建：`pnpm run build`，产物中不得包含本仓 Java JAR 或旧应用入口。
- 传输治理：检查产品代码无 Axios、裸 fetch、裸 EventSource/WebSocket 和微服务物理地址。
- 后端退役门禁：搜索并拒绝 `spark-ai-server`、`build:java`、`BACKEND_PORT`、`AI_BACKEND_URL`、`127.0.0.1:8180`、`/api/config/default`、旧 AI Session/Host Run 端点。
- 人工验收：登录/刷新/退出、租户与应用切换、动态导航、元数据 CRUD、文件上传下载、流程、报表、权限、缓存、脱敏、AI 对话、MCP 工具调用、SSE 重连、401、403、服务不可用。
- 分布式验收：gateway 统一入口有效，全量服务在其现有部署方式下可被需要的页面访问。

## 回滚策略

- 每个波次开始前记录精确文件状态，不处理任务外未提交内容。
- 波次失败时只回退该波次文件，不使用 `git reset --hard`。
- 旧前后端统一删除属于最后波次；删除前必须形成可恢复快照或由 Git 中现有提交保证可恢复。
- 删除后验证失败时，恢复最后删除波次，不扩大修改范围。

## 风险项

- 源 `SPARKProject` 工作区存在大量未提交改动：实施前必须确认本次采用的精确文件快照。
- 两仓工具链版本差异大：必须先解决 pnpm、Vite、Vue Router、TypeScript 和 Vitest 的单版本选择。
- 全量 lowcode 服务依赖 Nacos、数据库、Redis 等外部环境：健康检查通过不等于业务全链路可用。
- 旧 AI 与 lowcode AI 契约可能不等价：必须以能力矩阵明确 gap，不能用前端兜底伪造等价性。
- 动态导航可能包含尚未迁入的组件键：必须显示“不支持页面”错误，不能静默空白。
- 直接物理删除范围很大：必须等全链路验收通过后一次执行，并立即完成删除后回归。
