# 关系过滤配置校验事件

本轮为 `DataSpaceFilterEditor` 增加 `validation` 事件，事件负载类型定义在同目录 props 文件中：`contextKey`、原始 `value`、`valid` 和 `message`。组件首次装载以及 `contextKey` 或 `modelValue` 变化时，调用既有 `DataSpaceDesignApi.parseFilter` 的解析结果报告校验；成功时 `message` 为空，失败时保留解析错误。事件不改写输入值，也不改变现有 `change`、取消、清空或 disabled 行为。

新增测试覆盖损坏值到合法值、相同原值切换上下文、undefined/null/空字符串原样报告，以及正常 change 行为不受影响。校验只验证现有 codec 能否解析，不表示值函数可执行。

验证记录：

- 最小红绿：`pnpm exec vitest run tests/runtime/page/design/data-space-filter-editor.test.ts -t "reports codec validation|reports an initially valid"`，新增的 4 项先失败（组件尚未发 validation），实现后 4/4 通过。
- 完整 suite：`pnpm exec vitest run tests/runtime/page/design/data-space-filter-editor.test.ts`，9/9 通过；日志 `relation-filter-validation-suite.log`。
- 精确 lint：`pnpm exec eslint src/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.vue src/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.props.ts tests/runtime/page/design/data-space-filter-editor.test.ts`，exit 0；日志 `relation-filter-validation-eslint.log`。
- 未运行 typecheck，由主控统一验收；未改四文件、API、宿主或共享 FilterExpressionEditor。
