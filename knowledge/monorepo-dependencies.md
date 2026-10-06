# Monorepo 依赖与跨包影响传播

### 公共包修改的跨包传播

- **场景**：修改 `packages/` 下任一包的公共导出
- **规则**：必须先确认有哪些包依赖该包，影响范围必须包含所有消费方。`spark-utils` 被 `spark-ai`、`spark-component`、`spark-data`、`spark-project-model` 同时依赖，改 `spark-utils` 的公共 API 等于同时影响这四个包。
- **违反后果**：消费方编译失败或运行时 import 错误，但 `verify:rules` 不一定捕获（仅检查跨包相对导入和显式导出约束）

### 跨包相对导入禁止

- **场景**：在 `packages/spark-ai/` 中引用 `packages/spark-utils/` 的导出
- **规则**：所有跨包引用必须走 `@spark-appworks/spark-utils` 包名导入，禁止 `../../spark-utils/src/xxx` 形式的相对路径
- **违反后果**：`verify:deps` 检查会失败；即使通过，不同构建环境下行为不一致

### catalog 版本管理

- **场景**：新增或升级依赖版本
- **规则**：工作区基础依赖版本真源在 `pnpm-workspace.yaml` 的 `catalog:` 段。子包用 `"catalog:"` 引用，禁止在子包 `package.json` 中写死版本号。新增依赖时先判断应加在哪个包，再判断版本号是否应走 catalog。
- **违反后果**：版本碎片化导致不同包用不同版本的同名依赖，运行时出现难以排查的类型/行为不一致

### 公共导出变更的四同步

- **场景**：修改包的 `index.ts` 公共 barrel 导出
- **规则**：必须同步更新四项：package.json 的 `exports` 字段、`tsconfig.json` 的 `paths`、Vite/Vitest 的 alias、import smoke test
- **违反后果**：`verify:deps` 失败，或运行时某些导入路径无法解析

### 目录文件数硬限制

- **场景**：在已有目录下新增 `.ts` 或 `.vue` 文件
- **规则**：单个目录下 `.ts`/`.vue` 文件不得超过 10 个（不含 `index.ts`）；同一级子目录不得超过 7 个。超过必须按领域拆分。
- **违反后果**：`verify:ai-codegen` 不会自动检测此项（它是代码风格规则），但违反后代码定位困难、AI 和人类都难以导航

### 规范文档跨项目移植的三层切分

- **场景**：需要把项目内 AI 编码规范抽取为可移植版本，拷贝到其他项目共享
- **规则**：抽取时做三层切分——①通用层（代码组织层次、命名字典式、函数签名、7 阶段流程）原样保留；②项目特有层（基类如 SparkAIModel、特定 subpath、namespace 类型、特定框架禁导）整段删除，不进入可移植版；③可配置层（验证命令、目录路径、提交 scope）写成通用示例值（如 `pnpm run typecheck`、`notes/`、`knowledge/`），不用 `{{占位符}}`，附录 A 给出各技术栈常见值表供接入时替换。产出物应是独立文件夹（如 `ai-coding-kit/`），可整体拷贝。
- **违反后果**：直接拷贝会让其他项目继承无关约束（如强制继承 SparkAIModel 协议），或留下硬编码命令（如 `pnpm run verify:rules`）导致新项目流程失效；用 `{{占位符}}` 会让 AI 在源项目内看到一堆未替换标记产生歧义
- **发现来源**：2026-06 创建 `ai-coding-kit/AGENTS.md` 可移植规范时；2026-06 去占位符改通用示例值

### verify-docs allowlist 反向校验

- **场景**：删除 `docs/` 下被 `tools/verify-docs.mjs` 的 `legacyMarkdownAllowlist` 收录的 markdown 文档
- **规则**：`legacyMarkdownAllowlist` 不仅是"放行非 kebab-case 文件名"的白名单，`checkLegacyAllowlist` 还会反向校验 allowlist 里的文件**必须存在**。删除任一 allowlist 文档时，必须同步从 `legacyMarkdownAllowlist` 集合中移除对应条目，否则 `pnpm run verify:docs` 报 `legacy markdown allowlist entry no longer exists; remove it from tools/verify-docs.mjs`。
- **违反后果**：`verify:rules` / `verify` 门禁失败，CI 红
- **发现来源**：2026-06 合并 AI 编码标准、删除 `docs/ai/AI_CODE_CHANGE_PROTOCOL.md` 等三个重复文档时

### pnpm 11 要求 Node ≥22.13

- **场景**：升级 pnpm 10 → 11，或在 Node 20 环境运行 pnpm 11
- **规则**：pnpm 11.8.0 依赖 `node:sqlite` 内置模块，要求 Node.js ≥22.13。升级 pnpm 11 时必须同步升级 Node 并更新 `package.json` 的 `engines.node`（本项目改为 `>=22.13.0`）
- **违反后果**：Node 20 下运行 pnpm 11 报 `No such built-in module: node:sqlite`；corepack 启用 pnpm 11 报 `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`
- **发现来源**：2026-06 升级全部基础依赖时

### 源码删除后仍扫 tsconfig paths

- **场景**：已删除某包入口（如 `spark-ai/src/json`），但 typecheck 或 IDE 仍解析到旧路径
- **规则**：删除源码后必须同步删除各包 `tsconfig.json` / `tsconfig.build.json` / vite alias 中的对应 paths；再扫 `generated/` 残留 shard
- **违反后果**：留下死别名 → 消费方误以为入口仍在，或 typecheck 指向不存在文件
- **发现来源**：2026-08 SSOT G1

### 工具三文件名只认 PAGE_TOOL_FILE_NAMES

- **场景**：清除工具缓存、枚举 rule/script/style。
- **规则**：只使用 `@spark-appworks/spark-project-model` 的 `PAGE_TOOL_FILE_NAMES`；场景配置由 ScenarioViewFile 独立管理，不加入工具文件数组。
- **违反后果**：文件清单双真源，或把场景文件错误当成工具资产清理。
- **发现来源**：2026-08 SSOT G2；2026-10 随工具/场景分离同步正式常量。

### pnpm 11 不再读取 package.json 的 pnpm.overrides

- **场景**：从 pnpm 10 升级到 11，原有 `package.json` 的 `pnpm.overrides` 字段
- **规则**：pnpm 11 起，`overrides` 必须放在 `pnpm-workspace.yaml` 顶层 `overrides:` 字段。`package.json` 的 `pnpm.overrides` 会被静默忽略（启动时输出 warning）。迁移时版本号直接写死或用 `catalog:` 协议引用均可。同时应从 `package.json` 删除整个 `pnpm` 块避免误导
- **违反后果**：vue 全家桶、rollup 等版本锁定失效，子依赖可能拉入不一致版本
- **发现来源**：2026-06 升级全部基础依赖时

### pnpm 11 默认拦截依赖 postinstall 脚本

- **场景**：pnpm 11 install 后某些依赖（esbuild、vue-demi）的 postinstall 未执行
- **规则**：pnpm 11 默认 `strictDepBuilds` 为 true，需在 `pnpm-workspace.yaml` 的 `allowBuilds:` 块显式放行需要执行 postinstall 的依赖（设为 `true`）。pnpm 会在 install 时自动插入占位条目，需手动设为 `true`/`false`。`onlyBuiltDependencies`/`neverBuiltDependencies`/`ignoredBuiltDependencies` 等 v10 设置在 v11 已移除，统一用 `allowBuilds`
- **违反后果**：`ERR_PNPM_IGNORED_BUILDS` 退出码 1，esbuild 平台二进制未安装导致构建失败
- **发现来源**：2026-06 升级全部基础依赖时

### @types/node 主版本升级的适配成本

- **场景**：升级 @types/node 25 → 26（或其他主版本跳变）
- **规则**：@types/node 主版本跳变不一定导致 typecheck 失败。本项目 25→26 升级后 typecheck 一次通过，零代码适配。下次升级 Node 类型可降低风险预期，但仍需跑 typecheck 确认
- **违反后果**：无（记录此结论用于降低未来升级的风险预期）
- **发现来源**：2026-06 升级全部基础依赖时

### 动态 import() 在 eslint strict 下的类型接收约束

- **场景**：在 eslint strict 配置（`no-unsafe-assignment: error`）下用 `await import()` 动态加载模块并接收导出
- **规则**：`await import()` 返回 `Promise<any>`，用显式类型注解（如 `const x: Record<string, unknown> = await import(...)`）会触发 `no-unsafe-assignment`。必须用类型守卫函数接收 `unknown` 参数窄化（如 `isModuleExports(value: unknown): value is Record<string, unknown>`），或局部 `eslint-disable-next-line`（项目有先例 `state.ts:65`、`zero-code.ts:15`）
- **违反后果**：typecheck 或 lint 失败；用 `as` 断言虽能消 `no-unsafe-assignment` 但会触发 `verify:ai-codegen` 的 type assertion 禁令
- **发现来源**：2026-06 修复 verify:ai-codegen 违规时

### 工作目录清理时的进程句柄锁定

- **场景**：深度清理项目工作目录中被 `.gitignore` 忽略的本地产物（`.vs/`、`*.log`、`.eslintcache`、`dist/`、`target/`、`node_modules/` 等）
- **规则**：删除 `dev-setup.*.log` 等开发进程日志前，必须先确认没有运行中的 dev/setup 长驻进程持有文件句柄。用 `Get-Process node`（PowerShell）排查活跃 node 进程，先停进程再删日志。`Remove-Item -Force` 无法绕过操作系统级文件锁，重试无效。另外：`%SystemDrive%` 在 PowerShell 中是字面量目录名（不会展开环境变量），可直接 `Remove-Item '%SystemDrive%' -Recurse -Force` 删除该误生成目录
- **违反后果**：`Remove-Item` 报 "文件被另一进程使用"，删除失败；强行 kill 进程可能中断用户正在进行的开发会话
- **发现来源**：2026-06 深度清理项目垃圾文件时（dev-setup.err.log、dev-setup.out.log 被 node PID 20668/21028/23292 锁定）

### verify:deps 不管 workspace 包声明，verify:docs 不管类名与路径

- **场景**：新增 workspace 包之间的 import，或重命名、删除类和文件后核对文档
- **规则**：`verify:deps` 只校验第三方运行时依赖的归属，不校验 `@spark-appworks/*` 是否写进 `package.json` 的 `dependencies`；`verify:docs` 只校验文件名、位置、`.dm` 头和退役标记，不校验文档里的类名、函数名、路径是否存在。新增跨包 import 要手动补 `dependencies`（根应用目前 import 了 `spark-ai`、`spark-utils` 却未声明，靠 Vite alias 才能解析）；改名或删除符号后要 grep `docs/` 与各包 README。
- **违反后果**：未声明的 workspace import 在换解析方式或发布时才失败；文档里留着不存在的类名而门禁全绿（2026-10 时 `docs/` 里仍有 18 处 `ProjectEditor` / `ProjectDesign` 等旧名）。
- **发现来源**：2026-10-05 架构文档对照源码重写

### verify:lowcode-contracts 依赖盘外 lowcode-jdk17 源码

- **场景**：`verify:lowcode-contracts` 报 `lowcode-endpoint-ledger.json is stale`，但本次没改任何 API 调用
- **规则**：端点台账由 `tools/lowcode-contracts/generate-ledgers.mjs` 扫描 `LOWCODE_JDK17_ROOT`（默认 `E:\lowcode-jdk17`）下的 `*Controller.java` 生成，`--check` 只读比对。后端源码一变台账就过期，与 AppWorks 代码无关。用 `pnpm run generate:lowcode-contracts` 重新生成后，先对比新增和删除的接口（尤其是前端正在调用的路径），再提交。该目录永久只读，只读取不修改。
- **违反后果**：误以为是自己的改动引起而到处排查；或盲目重新生成，漏看前端依赖的接口已被后端删除（2026-10-05 `GET /api/LoginAuthority/GetUserInfo` 即如此）。
- **发现来源**：2026-10-05 `verify:rules` 在干净 HEAD 上同样失败时
