# 值级联配置与字符串持久化

状态：本轮限定闭环验收通过；整体任务仍进行中。

范围为 before-hashes.json 中七个路径（3生产、3既有测试、1API文档），未新建源码或修改 Java/UI。主控直接实施，没有代理、线上写入或 Git 提交。整体 AppWorks/DataSet 任务仍进行中。

- DataSet 与 DataSetCrudTool 统一读取、创建、更新、删除 query/field 定义；按 ID 定位，旧 query 端点仍支持，歧义显式拒绝。新增定义直接返回已接受对象，避免同端点不同绑定创建成功后误报读取失败。
- 字段更新复用现有严格定义与依赖图校验。错误引用、主键目标、成环、重复目标/ID、旧行配置、混入 query 属性或切换类型，均在修改前失败；原实例、配置和历史保持，失败也不丢 redo。
- 实际配置 CRUD → 场景文件保存 → 新工作区装配 → 父值变化 → 子选项查询 → 子值调整 → 正式签名提交 → 根据载荷更新测试存储 → 独立读取。selection-string 的 `01|0|gone` 变为 `01|0`，提交和重读仍为字符串；原生标量清空为 null。
- 删除级联并保存重开后，正式模型关系及选项 DataView 的 valueField/selectionDelimiter 保留。只保存配置域，没有将运行 DataSet 或 DB 模型/字段副本写入 pagedata。

## 验证

- 基线和最终 `pnpm run typecheck`：通过。
- 六个修改 TS 路径 ESLint：通过。
- `verify:ai-codegen`：1021文件通过。
- 定向5套件141项：通过；末次校验边界类型修正后，CRUD2套件27项再次通过。
- 根 `pnpm run test:run --testTimeout=15000 --maxWorkers=2`：210套件、2748项全通过，193.20秒。日志中的既有 jsdom requestSubmit 提示不构成测试失败。
- 七个最终路径 SHA256 复核一致，精确前像、差分和最终哈希均保留。

red.log 保留标准入口原先拒绝 field 的三个失败。crud-first.log 中一个旧断言仍预期隐藏 field，按新列表合同修正。typecheck-after.log 的联合类型收窄问题与 lint.log 的宽输入校验收窄问题已修复，无断言绕过；最终日志以 typecheck-final.log、lint-final.log 为准。

剩余：旧 query 行依赖替换、普通选项组件消费、ClassModel/设计器及完整 AppWorks 集成。当前本地边界夹具不构成线上写入或整页验收，未声称全任务零回归。
