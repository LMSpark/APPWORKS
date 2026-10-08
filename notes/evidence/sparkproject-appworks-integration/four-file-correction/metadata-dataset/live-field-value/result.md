# 真实查询驱动子字段值与多父输入

2026-10-09，本轮运行验收通过。没有修改生产源码、测试、Java、UI、数据库或远端文件；完整集成仍未完成。

## 真实链路

通过原生 openLowcodeDataSpaceDesignSession 加载同一已授权测试目标的元数据 DataSet。正式查询确认 Base_DataSet.default.Name 可读、可写且不是主键，采用本次实际 fieldAccess 结果，不按 admin 名称放行。字段只被用作临时字符串草稿的测试载体，没有将该测试绑定作为业务设计配置。

父输入一是 Base_DataModel.modelOptions 的选中主键数组；第二输入先为目标空间 rowid，随后改为另一 DataView 的模型 rowid 字段值。Base_DataModel_Field.apiInfoFields 作为独立选项查询，保留 formid 过滤，并用完整父值集合过滤 dataModelId。值策略为显式 selection-string / retain-valid / clearValue 空字符串，valueField 为正式字段 rowid，selectionDelimiter 为竖线。

- 先给子字段本地编辑覆盖放入两个有效 ID 和一个无效测试 token。选择两模型、单模型、空集合，真实选项分别为 11/7/0 条；子字段保留 2/1/0 个 token，始终是原格式字符串。原 rows 未被修改，选项源共享 rows 也未被替换。
- 保持两个模型的选中数组不变，单独改变第二父视图指针所提供的字段值；选项分别为 7/4 条，子值保留一项后清空。指针只是取值位置，关系仍只消费值；重复设置相同值不增加查询。
- discardEditingRows 后原值恢复、编辑覆盖消失。另开设计会话独立读取数据库，原值一致；两个远端 pagedata 原文也完全一致。

最终 `online-result.json`：stage complete、110 reads、0 writes、sameScalarValueNoRequest/cancelRestored/independentDatabaseReadUnchanged/remoteUnchanged 均为 true，退出 0。第一遍只验证第一个父输入变化，共107读取，同样通过，保留 first-result.json 和 first-probe.mjs.txt；第二遍增加第二父值独立变化后整体复验。

## 证据边界

此证据补齐了“真实选项查询 → 实际数据权限 → 子字段本地字符串草稿调整 → 取消恢复”的运行链路。上一轮所谓缺少测试模型，仅限被设计空间自身的业务模型；其元数据空间已有可用字段，不需要用户新增账号、改权限或伪造正式主键。

candidateOnly=true：级联由验证脚本在本次原生实例临时添加，没有写入仓内或远端正式配置，未恢复设计器。没有调用业务保存，所以不声称测试字符串已落入数据库。query 配置的真实文件保存重开见相邻 persisted-value-cascade；field 配置保存重开及实际业务提交字符串仍以既有接口边界回归为证，不能与本证据混为单个线上全流程。

只读请求白名单在认证后限制为 GetData 和文件文本读取；本地草稿取消且实例全部销毁。密码由既有 DPAPI Credential 通过 stdin 提供，不输出或留存。生产代码无改动，未重复完整回归，未新增知识库记录或委派代理。
