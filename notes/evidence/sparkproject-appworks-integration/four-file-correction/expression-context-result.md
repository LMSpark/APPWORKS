# 全部父分支表达式目录定向结果

状态：当前目录闭环已冻结，待主控验收；不代表设计页或祖先引用全链路验收。

## 范围与变更

- `config/pages/data-platform/data-space-design/script.js`：新增本页内部 `designExpressionCatalog(currentModelId, extraParentId)`，从当前快照的正式模型、字段、关系 DataView 生成一份可读目录。当前模型起点、额外父优先、广度遍历全部父分支；以模型 rowid 去重，环和自环终止。保留对空间、主键、查询 owner 与字段读权限的校验；隐藏/脱敏 Name 不发布，隐藏模型 Name 的上游仍可继续遍历；`type=inputParams` 不作为模型字段。`designValueFunctionContext`、模型 Filter 与关系/JoinFilter 复用此目录，过滤器的 LHS 仍限当前或子模型字段。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：扩真实 Renderer 来源入参用例，核组件 props 中双父分支与共享祖先；新增图反例，核额外父优先、菱形去重、环/自环、隐藏/脱敏、空注册名与无关模型排除，及 ValueFun、模型 Filter、关系/JoinFilter 的相同目录和参数模式。空 Name 模型不产生 `'.字段'` 引用，但遍历不截断其他分支。
- 同名正式模型补验：`designVerifyReadableModelNames` 在正式模型读取及重挂载快照恢复后检查当前可读、非空 Name 的唯一性；重复走既有 `designError` 通道且不进入 ready。隐藏/脱敏 Name 不读取、不判重；测试验证明确错误、零写、草稿保留与受限名称不泄露。
- 基线 SHA256：`script.js` 为 `1B5839EC215DAA3DB46EDF3063FA9A888A0B076884B9435B5AB8FE376897129B`；测试为 `414D6ADFECD8DAF608F7FD32FB7286E071BC7B849482017D03C8BC7EEDCB9102`。冻结 SHA256 分别为 `AE69C5315140B8E83DB7037A01854A434A68435154928A5ECD4D82C9ACBBAAC7`、`D80267B4DD86A4DFDC35CA9A64AC4999C9D5FCF02855091DEB254AC87F6D2D22`。

## 验证

- Red：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t 'routes a real Renderer input-parameter selection'`，1 failed / 51 skipped，缺第二父分支及其字段；原始输出 `expression-context-red.log`。
- 首次修复后同一用例 1 passed / 51 skipped，`expression-context-green-initial.log`。图反例 1 passed / 52 skipped，`expression-context-graph.log`。
- 同名模型 Red：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t 'duplicate readable model registration names|excludes .* model registration names'`，1 failed / 2 passed / 53 skipped，重复名错误未显示；`expression-context-name-red.log`。修复后 3 passed / 53 skipped，`expression-context-name-green.log`；重挂载定向 1 passed / 56 skipped，`expression-context-remount.log`。
- 最终：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`，57 passed / 57，09:54:07 开始、16.28 秒，退出码 0；`expression-context-full.log`。JSDOM 仍提示 `HTMLFormElement.requestSubmit()` 未实现。
- 最终：`pnpm exec eslint config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts --max-warnings=0`，退出码 0；`expression-context-eslint.log` 为空。

## 边界

- 本轮仅恢复编辑目录，不改变表达式原文、保存、后端执行或输入级联。`LowcodeModelRelationAdapter` 与 `ResourceRelationDefinition` 对非直接父的祖先引用仍需后续精确闭环；目录通过不代表祖先引用已全链路验收。
- 主控裁定的同名模型可读状态已按现有失败通道验收；空 Name 仍可加载，但不提供具名引用。字段重名的正式模型内部冲突未新增规则或验收。
- 未运行根类型与配置门禁；由主控在顺序闭环冻结后集中执行。未在线写入、提交、建分支或重置混合工作树。
