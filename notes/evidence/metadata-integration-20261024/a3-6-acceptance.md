# A3.6 独立字段新增验收（2026-10-24）

基线 `2f43753c200019d9b240e9236cc3198559184704`。独立字段新增的单个真实生成 ID 通过原 DataView 保存，恢复只消费本次原捕获；删除全 DataSet abandon、重复回执判定、缺失回读 acceptCurrent 及无消费者 verifiedSnapshot。modelFields 仍暂存给既有工作区联合保存。

默认核验保留后续修改；权威未应用结果只能显式结束未变化的原意图；已确认结果的后续修改须明确放弃并重新核验，点击之后产生的编辑仍受保护。公共保存 helper 未改。

## 本地证据

- 改动前原套件 30 通过；仅修改测试后 29 通过、2 个真实失败：缺失字段回读提前结束、同 DataSet 兄弟未知捕获被清除。原调用 shell 未保留，不补造。
- 最终字段新增 48/48；定向 UI 2 例是同套件子集，不叠加。父级另验工作区字段创建/标准工具栏 3 通过、352 跳过。
- 独立审查 Spec / Task quality 通过，0 P1/P2；三个产品测试文件与父级基线共 4 文件冻结哈希一致。
- typecheck、scoped/full lint、AI codegen、build、完整 rules 通过。正式 ClassModel 生成 963 文件，semantic gaps 3110 保留；12 个外围产物差异核实仅为编译符号数字 ID。
- page-thin 正式 --update 收紧此 owner 的 JSON 基线 3→1，没有放宽规则。
- 首次 rules 因外部参考 Java 源码新增两个 NoticeSourceController 路由而发现派生台账过期，exit1 保留。正式 generate:lowcode-contracts 刷新 609→611 后完整 rules 通过；只表示静态 source-characterized 结果，没有修改/运行 Java，也不宣称实际服务支持。

原始日志、退出码、冻结补丁/哈希、实施及审查报告在 `node_modules/.cache/metadata-integration-20261024/`，分别为 `a3-6-final-*-20261024-1422.*`、`a3-6-parent-*`、`task-a3-6-report.md`、`task-a3-6-review.md`。日志文件名时间标签不代替 Vitest 实际 Start 时间（最终套件 14:16:57，定向 UI 14:17:18）。

## 真实页面

同目录 [a3-6-smoke.json](a3-6-smoke.json) 记录当前 T 空间及模型身份与脱敏网络观测。通过正式目录的独立字段入口填写名称/输出名/说明，取消后重开输入为空；整个设计器关闭后独立重开，仍为原 3 模型、SourceScope 原 9 字段。可再次新增与关闭。记录的 32 条 API 请求只有 GetData 查询和空 content 的 pagedata 文件读取，没有保存请求，0 次 UI 持久化。

图证：[填写草稿](a3-6-field-draft.png)、[取消重开为空](a3-6-field-reopened-empty.png)、[独立实例原字段](a3-6-independent-fields.png)。

## 未证明范围

本组未实际创建/删除字段，未在线注入丢回执。兄弟捕获隔离、未知恢复和晚编辑是原生 DataSet/DataView 夹具证据，不等于标准页同时出现两条未知提交。阶段 A 的真实创建到删除联合闭环、未加载保存、双空间完整绑定、跨实例未知恢复及整页参考对照继续按唯一台账推进。
