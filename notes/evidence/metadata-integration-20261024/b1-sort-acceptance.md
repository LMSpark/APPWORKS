# B1 批量设置排序：实施与 SPA 验收记录

日期：2026-10-24。基线：`c59d7de1d5bbbb5e0ce9c9e99f30576b2ff0faf4`。实施：gpt-6-luna；主控负责裁决、复核、真实浏览器、生成与交付。本批提交、不推送。

**状态：排序实现与工程验证通过；真实排序保存/重开闭环仍待验收。** 线上已完成专用字典的独立设计保存，但其条目新增被正式 `typeid` 值函数合同阻断，未执行线上排序提交，不以夹具通过替代。

## 实施与审查

- `DictionaryWorkspace.canApplyDisplayedOrder` 与 `applyDisplayedOrder()` 复用一套只读预检：本次实例、应用与字典归属、查询 Loaded 状态、保存/未知状态、全部显示目标的身份、`ordIdx` 可读写与原生 validator。待新增行沿原新增权限；最后一行失败时前面行也不写。
- 按调用时 `entries.rows` 顺序暂存 `ordIdx=1..N`，仅调用 `updateEditingValue`；不补查、不改查询排序、不保存，也不清除其它字段修改。空集合无操作。取消与提交仍由原 `load(true)` / `saveData` 承接。
- 标准表格已有 `toolbar.children` 增加同 `entryKey` 的“设置排序”按钮，经原 `run` 和忙碌/关闭保护触发，没有新增页面数据副本或保存通道。
- 初审 Spec/Quality PASS；R1 窄复审 ADDRESSED；最终整批复核 Spec/Quality PASS，0 个新增缺陷，核对 5 个源码/测试哈希及 13 个日志哈希一致，允许按当前线上待验收状态提交、不推送。未增加 `mutatingChanged` 订阅的判断只覆盖现有入口：所有页面 owner 写操作经过 `run` 更新 busy/revision，表头查询走已订阅的 requestStateChanged；并非未来任意外部 CRUD 的保证。
- 现场 R1 修复：现有新定义/新条目漏掉参考合同的 `crttime`。仅在两个 `DataView.addRow` 首次初始化本地 `YYYY-MM-DD HH:mm:ss`，不修改历史行，也不在保存/排序时重算。首个服务端拒绝保留为证据；修复后设计真实保存已通过。

## 自动化与工程证据

- 初始 RED：领域 54 项中 42 过、12 因新 getter 缺失失败；workflow/catalog 64 项中 63 过、1 因新按钮缺失失败。初次夹具排序解释错误另记，不计为产品反例。
- 最终领域 **58/58**；workflow **29/29**；目录宿主 **35/35**。不叠加中间轮次。覆盖显示顺序、精确 Changed 字段集合、保存后新实例默认顺序、后一目标无权限/超界的整体拒绝、部分读取、原生 scope 失效、空集、待新增行、其它修改、取消和重复点击。目录用例保存 D1→关重开 D1→关闭切 D2，并断言旧 DataSet 释放及路由/query 保留。
- R1 创建时间反例 2 红后转绿，核 Added 时间稳定以及排序 Changed 仍仅 `rowid+ordIdx`。
- 最终 typecheck、全量 lint、正式 ClassModel 生成、正式 lowcode-contracts 生成、`verify:rules`、build 均退出 0。首次 rules 因 consumer 生成台账过期失败，正式刷新后通过。
- ClassModel 15 个实际变化文件：12 个只变编译器 iterator/unscopables 数字 ID；另 3 个为声明清单及本组 workspace/页面投影。正式 provider 查询新增公开属性/方法指南成功，源码修改时间与 shard generatedAt 一致。无手改产物。
- 门禁非零告警仍如实保留：现有 AI model 两项 fromJson 告警；构建大 chunk 与 CodeMirror 动静态混用告警；页面测试工具的 esbuild/oxc 选项告警。它们不是本批新增排序失败，也不称日志无告警。
- 原始命令输出保存在 ignored `node_modules/.cache/metadata-integration-20261024/b1-sort-*`；命令、退出码、文件哈希与生成审计见 [验证摘要](b1-sort-verification.json)。

## 真实 SPA 过程及持久结果

全过程沿已有目录路由、应用壳、登录态与局部工作区；未调用整页刷新/重新登录完成验收。各证据窗口 `truncated=false/hasMore=false`、Document 请求为 0。开发期 HMR 不作为验收步骤。

| 阶段 | 已观察事实 | 证据 |
| --- | --- | --- |
| 首次新设计保存 | 候选 `5F189392FA694C909ABDD54550542076`，8 读+1 Added 请求；HTTP 200 / Code 500，`crttime` 无默认值 | [窗口](b1-sort-design-create-rejected.json)、[截图](b1-sort-design-create-rejected.png) |
| 拒绝后重读 | 原候选定义、条目均 0，关闭本地草稿，没有删除正式记录 | [读回](b1-sort-rejection-readback.json) |
| R1 后新设计保存 | 11 读+1 Added 请求，均 HTTP/Code 200；只保存 `_Base_DictType`，设计独立读回 1 条、条目 0 条 | [设计保存](b1-sort-design-save.json) |
| 数据工作区新增 C/A/B | 通过绑定字段输入 C/A/B，排序 1/2/3；显式保存被 `SPARK_MODEL_SAVE_FIELD: typeid` 阻止，窗口仅 8 读、0 写 | [窗口](b1-sort-entry-create-blocked.json)、[截图](b1-sort-entry-create-blocked.png) |
| 关闭保护与取消 | 有草稿时关闭 disabled；取消后 2 次正式读取，定义 1、条目 0，关闭恢复可用 | [读回](b1-sort-entry-cancel.json) |
| 切换另一字典 | 关闭后选择“页面类型”，8 读、0 写；正式身份及其原 3 条数据独立呈现，没有测试草稿串入 | [切换](b1-sort-target-switch.json) |
| 专用字典独立重开 | 再关闭并选择专用字典，8 读、0 写，定义 1、条目 0；“设置排序”因空集合禁用 | [读回](b1-sort-reopened-empty.json)、[最终截图](b1-sort-retained-dictionary.png) |

保留供后续 B1 的正式字典：**B1Sort_20261024_1925F4C2**，ID **327D74EC0ABC4196AA75C56D944B8201**，应用 `D99A1DCE9894698799101EFD70F8FC76`。当前仅有已保存定义，三条本地条目已取消；没有执行资源删除。首次失败候选 ID 不属于已保留资源。

## 未核销的验收与后续入口

正式 `_Base_DictData.typeid` 字段（`6DEED3F0B04C4AD1B369843C4AD35FD5`）配置 `ValueFun={Type:SystemData,ParamName:rowid,Value:null}`。当前正式输出投影将其视为 computed，保存映射拒绝；这是**发请求前的数据层合同阻断**，不是第二次后端 500。详情见 [合同缺口](b1-sort-typeid-gap.md)。

没有为烟测解除计算字段守卫、临时改正式元数据、删除 typeid、改 Java 或通过直接请求写入。需先核明该旧值函数的正式新增/持久化语义，再恢复同一 SPARK data 链中的受授权能力或明确迁移；本批不猜测后端会自动填正确归属。

因此以下仍未获得真实服务证据：三条测试数据正式保存；表头排序 A/B/C→设置排序→取消→再次设置→显式保存；排序请求仅含目标 ordIdx；同一 SPA 关闭重开仍为 A/B/C。完整 B1 的 AI 候选、删除外部引用完整性、下游消费及阶段 A 既有缺口继续留在唯一台账。
