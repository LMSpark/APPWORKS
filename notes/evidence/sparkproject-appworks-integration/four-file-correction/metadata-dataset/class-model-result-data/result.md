# ClassModel 级联定义完整返回与数据隔离

2026-10-09，主控直接实施，本次限定闭环验收通过。本记录不代表整体集成或线上迁移完成。

## 修复范围

两处生产代码、一个既有测试文件，精确前后像及 SHA256 在本目录。没有 Java、业务设计页、线上写入、代理派工、提交或分支操作。

- `dts-surface-to-runtime-api.ts`：纯数据声明不再注册为返回值/属性 API，联合定义及数组得以完整返回；class、实例方法和可达子 API 保持受控代理。
- `native-script-context.ts`：已知根实例直接使用同步代理；非 API 普通对象和数组在进入脚本时成为独立数据副本，修改副本不绕过原实例的更新校验。
- `dts-surface-to-runtime-api.test.ts`：真实声明生成、加载及脚本执行验证数据返回、递归、数组、异步、属性与受控子方法；修改返回数据的顶层和嵌套值不污染 owner。

不把业务实例的原始属性枚举暴露给脚本，不修改公共 JSON 规整器，不为业务 DTO 另建手写 schema。数据副本沿仓内 deepClone，无法结构化克隆的值显式失败，不静默退回共享引用。

## 与字符串兼容的关系

DataView.value 继续使用原有 valueField/selectionDelimiter 编解码。字段级联通过显式 valueFormat 区分 native 和 selection-string；普通含分隔符字符串不据外观拆分。tablegrid 级联输入仍是选中主键数组，与既有持久化格式分别处理。

真实 `probe-runtime.mts.txt` 使用当前生成 ClassModel 和 DataSetCrudTool：创建→返回完整定义→编辑读取副本与列表副本且实例不变→正式更新→核对实例→ScenarioViewFile 保存本地文件并重新打开。valueFormat、valueField、selectionDelimiter 均保留；旧 rowMode 拒绝。该证据是本地往返，不是线上保存。

## 验证证据

- DTO 完整对象返回、根数据属性及内部引用污染都有先失败记录：red.log、first-diagnostic.log、snapshot-red.log。
- 最小 3 套件 17 项通过；最终相关 19 套件 221 项通过，20.13 秒，含两种级联值格式及保存重开。
- 根 typecheck 基线/最终、精确三路径 Lint、AI codegen 1026 文件、guide JSON schema 结构门禁通过；限定 diff-check 通过。
- 增量生成通过，2 个分片刷新，758 分片、1363 classIndex，14.712 秒。
- 语义门禁仍失败：totalGapCount=2290，gateGapCount=313，与实施前相同。没有将此失败记为全仓通过。
- 完整根回归：211 套件、2772 项全部通过，387.61 秒，`pnpm exec vitest run --maxWorkers=1`，退出 0。没有并行编译或生成，没有改阈值或断言；保留原 jsdom requestSubmit 警告。
- 最终三文件及生成物 SHA256 已逐项复核；完整根回归使用的是同一份源内容。

## 验证边界

本项解决完整级联定义无法经脚本返回以及返回引用绕过更新入口的问题。线上旧配置迁移、业务设计器、完整 AppWorks 能力恢复及语义门禁清零仍未完成。可复用经验先保留本记录，未自动写入 knowledge。
