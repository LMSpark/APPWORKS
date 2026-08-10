# 测试

### 验证有固定顺序

- **场景**：AI 修改代码后需要运行验证
- **规则**：必须按此顺序验证：1) `pnpm run typecheck` → 2) `pnpm run lint` → 3) `pnpm run test`。禁止跳过 typecheck 直接跑测试，禁止连续改多个点后再统一验证。
- **违反后果**：跳过 typecheck → 类型错误在运行时才暴露，定位成本高；批量验证 → 难以定位是哪个改动导致失败

### verify:rules 可拆项运行

- **场景**：`pnpm run verify:rules` 失败，需要定位是哪一项
- **规则**：九项检查可单独运行：`verify:arch`、`verify:deps`、`verify:pages-config`、`verify:ai-codegen`、`verify:docs`、`verify:class-model`、`verify:workflow-designs`、`verify:lowcode-contracts`、`verify:ai-model`。`pnpm run verify` = typecheck + lint + verify:rules 全量门禁。
- **违反后果**：只知道全量失败不知道哪一项 → 排查方向错误

### verify:rules 可能被既有 arch 问题提前阻断

- **场景**：任务改动没有触及架构违规文件，但 `pnpm run verify:rules` 在 `verify:arch` 阶段直接退出。
- **规则**：先记录 `verify:arch` 的既有阻断项，再对本次触及的规则域运行定向命令（例如改了 codegen 规则或公共出口时补跑 `pnpm run verify:ai-codegen`），确认本次新增文件没有继续增加违规。
- **违反后果**：只看 `verify:rules` 总失败会误判本次改动；不跑定向命令又可能漏掉新增违规。

### 测试目录同样受文件数限制

- **场景**：在 `tests/` 或包内 `__tests__/` 新增测试文件
- **规则**：超过 10 个测试文件时必须按被测模块拆分子目录。不要把所有测试堆在一个平级目录下。
- **违反后果**：测试文件大平层 → 定位测试困难，`verify:ai-codegen` 可能检测到目录违规

### 包级测试命令

- **场景**：只修改了某个包的代码，不需要跑全量测试
- **规则**：用 `pnpm --filter @spark-appworks/<pkg> run test` 或 `test:run` 跑单包测试。全量测试用 `pnpm run test:all`。
- **违反后果**：每次改一行跑全量测试 → 反馈周期长，效率低

### ClassModel 相关测试的生成步骤

- **场景**：修改了模型 class 后跑 `verify:class-model` 失败
- **规则**：`verify:class-model` 依赖 `generated/dts-class-model/` 下的生成物。如果修改了模型 class 的字段或 JSDoc，需要先 `pnpm run generate:class-model-surface` 重新生成，再跑验证。
- **违反后果**：不重新生成就跑验证 → 基于旧的生成物检查，报出已修复的旧错误或漏掉新引入的错误
