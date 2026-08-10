# 原 Java 服务端退役残留清理研读

## 用户确认的目标

- 删除 AppWorks 原系统 Java 服务端退役后的残留并清理现场。
- `D:\SPARK_AppWorks` 是本次唯一修改仓库。
- `E:\lowcode-jdk17` 永久只读，不修改其 Java、POM、配置、数据库或部署。
- 不删除 AppWorks 现有前端功能和前端代码；浏览器继续直接消费 lowcode-jdk17 公开接口。

## 当前仓库事实

- 当前分支为 `feat/agent-workflow-node-contract`，HEAD 为 `00e67c629dc3a04c0979f3125512037f47fc37a7`。
- `spark-ai-server/` 已在上一轮切换中物理删除；本轮不再有该目录可删。
- 根构建、Vite 代理与 `@spark-appworks/spark-lowcode-api` 已指向 lowcode 前端 API 路线。
- 当前工作树在本研读文件创建前为干净状态。

## 已证明的 Java 残留

### 可直接退出的退役资产候选

- `.env.java.example`：只描述已删除 Java 服务的 LLM、JDK 与端口配置。
- `dev-startup-pid.txt`：受 Git 跟踪的运行态 PID；记录的 25124 已不存在，当前前端进程不是该 PID。
- `scripts/app-sse-client.mjs`：全仓无消费者，属于原 APP SSE 工具残留。
- `scripts/migrate-pages-config-cleanup.d.mts`：全仓无消费者，只是旧页面配置迁移声明残留。
- `scripts/verify-ai-direct-turn-class-model.mjs`：无 package script、测试或文档消费者；仅能通过人工显式 URL 运行，是否作为低代码诊断工具保留仍需用户裁决。
- `scripts/build-all.mjs`：根 `build` 已直接执行 `build:packages` 与 `build:fe`，该兼容入口无 package script 消费；仍被脚本文档和 VS Code 示例引用。

### 必须纠偏而非机械删除的当前入口

- `.env.example`、`.env.local.example`：仍描述旧 Java 后端或不存在的环境变量，需改为 `LOWCODE_GATEWAY_URL` 等当前配置。
- `.gitignore`：仍含 `spark-ai-server/target`、H2、`.env.java`、旧探针页等已失效规则。
- `README.md`：仍说明不存在的 `pnpm run dev:fe`。
- `docs/build-pipeline-audit.md`：仍把 Docker MySQL、Maven、8180 当作当前构建链。
- `docs/guides/QUICKSTART.md`、`docs/guides/CONFIG_SYSTEM.md`：仍示例旧 `/api/navigation`、`/api/pages-config` 或原配置源。
- `knowledge/README.md`、`knowledge/java-backend.md`：仍将已删除 Java 服务作为当前产品知识入口。
- `.vscode/launch.json.example`：仍保留 “skip Java” 的旧构建配置。

### 不能直接删除的兼容或测试边界

- `tests/dev/dev-state-page-file-closed-loop.test.ts` 与 `tests/dev/use-dev-state-page-data-history.test.ts` 中的旧路径只存在于测试 gateway fixture；测试覆盖页面文件、项目蓝图和版本闭环，不能整文件删除，应按当前 lowcode gateway 合同改写 fixture 语义。
- `packages/spark-app/src/config/loader.ts` 与 `public/config/default.json` 仍被 `src/main.ts` 实际调用；其中旧配置字段可能过时，但属于运行合同收束，不是无消费者垃圾。

## 明确保留

- `backend-api-contracts/`：旧端点账本、characterization fixture 和新旧差分输入。
- `generated/dts-class-model/`：运行时 ClassModel 生成 SSOT。
- `ai-coding-kit/`：可移植 AI 编码治理底板。
- 已指定的受保护计划与研读文件。
- 所有现有 Vue 页面、组件、运行菜单与项目蓝图功能。
- `node_modules/`：当前构建、测试和运行所需依赖。
- `E:\lowcode-jdk17` 的全部内容。

## 本地现场

- 可再生成的忽略产物包括根 `dist/`、各包 `dist/`、`.eslintcache` 和空目录。
- `data/` 约 39.8 MB，尚未证明内容仅为垃圾；在完成来源、消费者和恢复性核对前不得删除。
- 当前 `127.0.0.1:5173` 前端仍在运行；本地缓存清理不能误杀或破坏该服务，除非用户明确选择停服清理。

## 验证基线

- 通过：`pnpm run typecheck`、`pnpm run lint`、`verify:arch`、`verify:deps`、`verify:docs`、`verify:pages-config`、`verify:workflow-designs`、`verify:lowcode-contracts`。
- 已知失败：`verify:ai-codegen` 有 6 项既有代码规则违规；它们不是 Java 残留，是否纳入本轮需单独决定。

## 复杂度与影响面

- 复杂度：复杂。
- 原因：范围同时涉及删除、根配置、构建脚本、知识文档、测试 fixture、本地产物和可能仍在运行的进程；错误删除会破坏发布、诊断或前端开发闭环。
- 建议按最小闭环实施：退役文件删除、环境与构建入口纠偏、文档知识收束、测试 fixture 语义修正、本地产物清理、全量验证。
