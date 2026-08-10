# 原 spark-ai-server 深度残留清理研读

## 用户确认目标

- 深度清理 `D:\SPARK_AppWorks` 当前可交付产品中与原 `spark-ai-server` Java 服务端有关的代码、配置、脚本、测试语料、陈旧生成物和安全临时残留。
- 不删除仍被页面设计、项目策划、ClassModel 和 lowcode AI bridge 消费的前端 `packages/spark-ai`。
- 不删除受保护的旧端点考古合同、已标记失效的计划和外部 lowcode 集成研读。
- 不改写 Git 提交历史，不强推远端，不删除可能承载其他工作恢复价值的共享 Git 恢复对象。
- `E:\lowcode-jdk17` 永久只读；不执行任何 QYAPI live 写入。

## 当前工作树事实

- 唯一实施目标为 `D:\SPARK_AppWorks`，分支 `feat/agent-workflow-node-contract`，HEAD `00e67c629dc3a04c0979f3125512037f47fc37a7`。
- HEAD 已删除整个 `spark-ai-server/`，当前物理目录不存在。
- 当前树无 `.java`、`pom.xml`、Gradle 文件、`.env.java.example`、`public/config/default.json`、`scripts/load-java-env.mjs` 或 `scripts/start-dev.mjs`。
- 排除受保护历史材料、旧 API characterization、生成目录和依赖目录后，对 `spark-ai-server`、8180、旧配置端点和旧 Java 环境变量的精确扫描结果为零。
- 当前未提交工作树包含上一轮已审核的退役残留清理；不得覆盖或丢失这些改动。

## 仍需处理的真实残留

### 陈旧 ClassModel 生成物

- `generated/dts-class-model/manifest.json` 仍索引已删除的 `packages/spark-app/src/config/loader.ts` 与 `packages/spark-app/src/config/types.ts`。
- 对应 shard 文件仍存在：
  - `generated/dts-class-model/files/packages/spark-app/src/config/loader.ts.json`
  - `generated/dts-class-model/files/packages/spark-app/src/config/types.ts.json`
- 这些文件是当前生成快照的陈旧记录，应通过现有 ClassModel 生成流程更新并验证，不能保留悬空源码索引。

### 通用能力与旧服务端的边界

- `packages/spark-utils` 的 `FileLoader` 是通用 HTTP 文件加载器，测试中的 `/api/config` 只是可替换 base URL fixture，不依赖原 Java 服务端。
- `packages/spark-component` 当前 `PageRuntimeServicesCapability` 已无 `configLoader` 字段；`packages/spark-component/API.md` 中的 `configLoader?` 是陈旧 API 文档语料，需要按当前类型修订。
- `CHANGELOG.md` 中的 `ConfigLoader` 是历史变更记录，不参与当前运行，保留其历史真实性。
- `packages/spark-ai` 是前端 AI/Agent、ClassModel、工具循环和传输合同包；根应用和多个设计器仍直接消费。它不是 `spark-ai-server`，删除会破坏现有前端功能。

## 明确保留

- `backend-api-contracts/`：旧端点账本、characterization fixture 与新旧差分输入。
- `notes/research-external-lowcode-backend-integration.md`。
- `notes/plan-integrate-metadata-with-lowcode-runtime.md` 与 `notes/plan-merge-metadata-packages-into-appworks.md`；两者已标记 `superseded`，只作为历史研读锚点。
- `generated/dts-class-model/` 整体机制和当前有效投影；只移除或重生已失效 shard/index。
- `packages/spark-ai/` 及其当前消费者。
- Git 提交历史、标签、远端分支与共享恢复对象。

## Git 层事实与边界

- 可达历史中有 441 个提交触及 `spark-ai-server`，25 个本地、远端或标签引用的 tip 仍包含该目录。
- 当前 Codex 工作树与主工作树共享 `D:\SPARK_AppWorks\.git`。
- `.git/filter-repo` 约 2.8 MB，是全仓历史分析报告；`.git/lost-found` 约 89 MB、6460 个文件，包含其他历史和可能的恢复对象；它们并非当前产品产物。
- 从所有 Git 历史抹除旧服务端需要重写分支与标签、改变提交 SHA，并协调多个远端强推。用户已确认本轮不执行该操作。
- `.git/COMMIT_EDITMSG` 是当前公共 Git 目录的提交消息缓存；其内容不参与产品交付，且删除对“清理旧服务端”没有实质收益，不纳入代码清理。

## 影响面

- ClassModel manifest/shard 更新会影响运行时 ClassModel 读取、增量构建检查和生成一致性测试。
- API 文档修订只校准当前公共类型，不改变前端运行逻辑。
- 残留门禁若新增，需避开 `packages/spark-ai`、受保护历史材料、旧端点合同和 Git 历史，防止误报合法语义。
- 当前依赖目录已被上一轮现场清理移除；验证前需恢复依赖，但不得升级 lockfile 或依赖版本。

## 建议最小闭环

1. 恢复锁文件指定依赖，记录 typecheck 基线。
2. 使用现有生成器重建 ClassModel 快照，确认删除悬空 config loader/types shard 和 manifest 索引。
3. 修订 `packages/spark-component/API.md` 中陈旧 `configLoader?` 公共面描述。
4. 添加或执行精确残留门禁，只检查当前产品入口，不扫描受保护历史与 Git 对象。
5. 运行 ClassModel、类型、Lint、测试、构建和残留扫描验证。

## 复杂度

- 定级：复杂。
- 原因：涉及受跟踪生成物、公共 API 文档、依赖恢复、全量验证和破坏性残留判定；同时必须严格区分前端 `spark-ai` 与已退役 Java server，并保护历史材料和共享 Git 恢复数据。
