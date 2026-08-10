状态：implementing

# 原 spark-ai-server 深度残留清理计划

## 任务目标

彻底清除 `D:\SPARK_AppWorks` 当前可交付产品中原 `spark-ai-server` Java 服务端的剩余悬空生成物和可重新混入入口，同时保留仍在运行的前端 `packages/spark-ai`、受保护考古材料与 Git 历史。

## 已确认边界

- 唯一实施仓库：`D:\SPARK_AppWorks`。
- `E:\lowcode-jdk17` 永久只读；不执行 QYAPI live 写入。
- 不删除 `packages/spark-ai`，它是当前页面设计、项目策划、ClassModel 和 lowcode AI bridge 的前端内核。
- 不删除 `backend-api-contracts/`、受保护研读、已标记 `superseded` 的计划、`CHANGELOG.md` 历史记录。
- 不改写 Git 历史，不删除共享 `.git/lost-found`、`.git/filter-repo` 或分支标签，不强推远端。
- 不改变现有前端功能，不引入兼容层或新服务端。
- 不 commit、不 push；除非用户后续明确下达 Git 操作。

## 影响范围

### 手工修改

- `tools/verify-docs.mjs`
  - 增加原 Java server 当前产品残留扫描。
  - 阻止旧目录/文件重新出现，并阻止当前源码、脚本、配置和现行文档重新引入精确旧标识。
  - 排除 `.git/`、`node_modules/`、`dist/`、`artifacts/`、`notes/`、`backend-api-contracts/`、`generated/`、`ai-coding-kit/` 与 `CHANGELOG.md`，保护历史和考古输入。
  - 保持 `packages/spark-ai` 合法；门禁只识别 `spark-ai-server` 等旧服务端专属标识。
- `tests/page/verify-rules.test.ts`
  - 为残留扫描增加临时目录黑盒测试：合法前端 `spark-ai` 语义通过、旧服务目录/标识失败、受保护历史目录不误报。
  - 复用现有 verification rules 测试文件，不新增测试目录。
- `packages/spark-component/API.md`
  - 从 `PAGE_RUNTIME_SERVICES` 当前能力描述中删除已不存在的 `configLoader?`，整行与源码 `PageRuntimeServicesCapability` 对齐。

### 由现有生成器更新

- `generated/dts-class-model/.dts-manifest.json`
- `generated/dts-class-model/manifest.json`
- `generated/dts-class-model/semantic-gaps.json`（仅当生成器按当前源码确有确定性变化）
- `generated/dts-class-model/files/packages/spark-app/src/config/index.ts.json`
- `generated/dts-class-model/files/packages/spark-app/src/index.ts.json`
- `generated/dts-class-model/files/packages/spark-app/src/logger/index.ts.json`
- `generated/dts-class-model/files/src/main.ts.json`
- 删除：
  - `generated/dts-class-model/files/packages/spark-app/src/config/loader.ts.json`
  - `generated/dts-class-model/files/packages/spark-app/src/config/types.ts.json`

若完整生成出现上述范围之外的差异，立即停止实施，区分正常源码同步与无关漂移，修订计划后再继续。

### 过程文件

- `notes/research-purge-spark-ai-server-residue.md`：保留为确认后的研读锚点。
- `notes/plan-purge-spark-ai-server-residue.md`：实施时改为 `approved`、`implementing`；全部验证通过后按仓库规则删除。
- `notes/ai-code-metrics.md`：完成后追加本轮复杂度、耗时、返工、审查和人工干预摘要。

## 技术方案

1. 重新核对分支、HEAD、工作树、锁文件哈希和运行进程，确认既有 39 项退役清理改动未被覆盖。
2. 使用 `pnpm install --frozen-lockfile` 恢复锁文件指定依赖；安装后确认 `pnpm-lock.yaml` 无变化。
3. 运行编码前 `pnpm run typecheck`，记录基线；如基线失败，停止并报告，不扩大范围修复。
4. 最小闭环一：扩展 `tools/verify-docs.mjs` 的精确旧服务端残留规则，添加对应测试，立即运行定向测试和 `pnpm run verify:docs`。
5. 最小闭环二：校准 `packages/spark-component/API.md` 的当前能力描述，再运行 `pnpm run verify:docs` 和精确文本扫描。
6. 最小闭环三：运行 `pnpm run generate:class-model-surface` 完整重建 ClassModel；先检查差异路径，只接受计划列出的确定性变化，随后运行 ClassModel 专项校验。
7. 按固定顺序执行全量验证：typecheck、lint、全量测试、build、现有规则门禁和新增残留门禁。
8. 验证完成后删除根/包级 `dist`、`.eslintcache`、测试缓存和临时日志，保留 `node_modules`；再次检查工作树与残留扫描。
9. 回顾可复用知识，追加 `notes/ai-code-metrics.md`；按用户确认决定是否写入 `knowledge/`，完成后删除本计划文件。

## 关键设计决策

- 残留门禁并入现有 `verify:docs`，不新增平行 package script；`verify:rules` 已消费 `verify:docs`，因此 CI/本地总门禁自动生效。
- 使用专属标识和专属路径，不用宽泛的 `spark-ai`、`Java`、`MySQL`、`/api/config` 等词，避免误伤当前前端 AI 内核、lowcode 后端考古和通用 FileLoader。
- ClassModel 只由现有生成器更新，不手改 manifest/index；生成差异路径是硬中止边界。
- 本轮“彻底”指当前产品与可交付树可验证清零；Git 历史保留真实审计和恢复能力。

## 兼容性

- 不保留原 Java 服务端的运行、构建、配置或兼容入口。
- 不改变 lowcode-jdk17 接口、认证、导航、数据空间或权限语义。
- 不改变 `packages/spark-ai` 的公共导出和运行行为。
- `packages/spark-component/API.md` 只移除与源码不一致的文档字段，不修改实际能力类型。
- 新门禁会使未来重新添加旧 server 文件或专属配置标识的变更明确失败，这是预期治理行为。

## 验证计划

- 依赖恢复：`pnpm install --frozen-lockfile`
- 安装后锁文件：`git diff --exit-code -- pnpm-lock.yaml`
- 编码前基线：`pnpm run typecheck`
- 门禁定向测试：`pnpm exec vitest run tests/page/verify-rules.test.ts`
- 文档与残留门禁：`pnpm run verify:docs`
- ClassModel 生成：`pnpm run generate:class-model-surface`
- ClassModel 验证：`pnpm run verify:class-model:full`
- 类型检查：`pnpm run typecheck`
- Lint：`pnpm run lint`
- 全量测试：`pnpm run test:all`
- 构建：`pnpm run build`
- 架构与合同规则：`pnpm run verify:rules`
- 最终精确扫描：当前源码、脚本、配置和现行文档中旧服务端专属目录、文件和标识为零。
- 现场清理后：`git diff --check`，确认无 root/package `dist`、`.eslintcache`、测试缓存和临时日志；`node_modules` 保留。

## 风险项

- 完整 ClassModel 生成可能因当前未提交源码 mtime 或投影差异产生计划外改动；通过差异路径硬中止防止混入。
- `pnpm install` 可能受 registry 或网络影响；只允许冻结安装，不允许更新依赖或 lockfile。
- `verify:rules` 可能继续被已知的 6 项既有 `verify:ai-codegen` 违规阻断；需分别记录本轮定向门禁结果与既有失败，禁止顺手修复。
- 全量测试和构建会重新产生可再生目录；只在验证完成后按已确认范围删除，不影响 `node_modules`。
- 公共 `.git` 被多个工作树共享；本计划完全不修改共享恢复对象和历史引用。
