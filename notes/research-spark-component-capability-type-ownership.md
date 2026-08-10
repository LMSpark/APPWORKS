# spark-component 能力类型所有权研读

`packages/spark-component/src/core/useSparkComponent.ts` 通过 `import * as SparkUtils` 取得能力实现，同时在本地重新声明 `CapabilityKey`、`CapabilityContext`、`LoggerApi`、`SparkCapabilityConsumer` 四个一行类型别名。

四个类型的真实定义和公共出口都位于 `@spark-appworks/spark-utils`。`spark-component` 的其他组件、运行时和测试也已直接从该包导入这些类型；本地别名没有新增字段、约束或组件领域语义，仅供当前文件内部使用，并在 DTS ClassModel 中与原定义产生重复身份。

本轮影响面仅为 `useSparkComponent.ts` 的导入和内部类型引用。运行时函数仍直接使用 `spark-utils` 的能力实现，不改变能力树、页面日志、组件注册或 Vue 生命周期行为。

验证结果：四个重复类型从 ClassModel 索引消失；spark-component typecheck、lint、19 个测试文件 90 项测试、ClassModel 4 个测试文件 47 项测试、根 typecheck 和全量构建均通过。
