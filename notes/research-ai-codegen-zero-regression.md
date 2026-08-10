# AI 代码规则零回归研读

全量 `verify:ai-codegen` 在当前并行工作树中报告 16 个违规，分为四类：薄类型别名、跨包具名导入大平层、超过三个位置参数、类型断言。它们均由现有规则直接定位到源码行，不需要兼容层。

本轮按最小闭环逐类处理：薄别名直接删除并让消费方使用正式类型；大量具名导入改为模块命名空间或既有门面；多位置参数收口为具名 command/options；类型断言改为类型守卫或结构化解析。每个文件改后先做目标 typecheck/lint/test，最后执行全规则、全测试和构建。

## 实施结论

- 两个薄类型别名已删除，未保留旧导出、重载或转发入口。
- 四处跨包导入大平层已收束；受限的 `spark-component` 能力运行值没有通过命名空间泄漏到 `spark-app`，页面 UI 实现从唯一 `PageServiceCapability` 推导方法合同。
- 六个多位置参数函数已切换为具名 command 对象，仓内调用方同步迁移，旧签名不存在。
- `WorkflowDesigns` 不再用类型断言制造 `WorkflowRuntimeBinding`；编辑结果按正式合同逐字段构造，参数 schema 统一经过 `standardizeJsonSchema`。
- ClassModel 全局索引只收录导出符号，分片仍保留私有模型；公开重名由 bundle assert 直接拒绝。
- 最终 `verify:ai-codegen` 为 0 违规，ClassModel 为 702 个分片、1264 个公共索引，历史 semantic gap 总数保持实施前 1469，未新增缺口。

## 验证结果

- 根 `typecheck`、`lint`、生产构建通过。
- 根测试 169 个文件、1252 项通过。
- 工作区包测试合计 814 项通过。
- ClassModel 4 个文件、49 项测试通过。
- 架构、依赖、页面、文档、workflow、AI model、项目蓝图 SSOT、AjaxResult、SendCode、wire-query 与 lowcode 合同账本校验通过。
- lowcode 合同账本刷新后为 385 个端点、125 个消费者；未执行后端、数据库或 live mutation。
