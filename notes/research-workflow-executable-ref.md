# 研读：Workflow executableRef 动态 import（迭代 1）

> 赋能层记录。基于 HEAD `9c225cad7`，已与用户确认。

## 事实
- `spark-ai/src/agent/workflow/agent-workflow-runtime.ts:159-175`：`resolveExecutableClass` 执行 `import(moduleSpecifier)` 取 `exportName`。
- `agent-workflow-validation.ts:647-672`：`executableRef` 只校验 `kind==='js-module'` 与非空，无白名单。
- workflow 路径总是提供 `resolveInstance` 与 `rootClassName`，`moduleClass` 在 `ClassModelAgentAdapter` 中只作构造/命名兜底，实际不被使用。
- 运行时只读后端 `{applicationId}/workflow-designs/{workflowId}/definition.json`（`src/services/workflow-designs.ts:655-669`）；本地 `config/agent-workflows` 仅供工具与测试；仓内写接口全部拒绝，无同步通道。
- 浏览器：`import()` 参数为变量，Vite alias 不改写，无 importmap / 插件 → 裸包名 `@spark-appworks/spark-project-model` 无法解析；vitest 经 vite-node 解析所以测试绿。
- 历史：`46f4cffdd` 以 `executableRef` 破坏性替换 `moduleClassResolver`；当时研读已写"需 allowlist resolver"未实现，且只在 Node 验证。

## 附带发现（迭代 2 处理）
- `tools/generate-workflow-design-data.mjs` 仍写已不存在的 `ProjectModel`，与 config 中 `ProjectWorkspace` / `ProjectBlueprint` 脱节。
- `page-design-agent-workflow-binding.ts:321` `resolvePageDesignModuleClass` 无调用方。
- `tools/verify-workflow-designs.mjs` 对 `executableRef` 只做非空检查。
