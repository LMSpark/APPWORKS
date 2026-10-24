# A3.4 模型改名验收

日期：2026-10-24。基线：`a049bc3a6fb5becb25b97f82156cb1bc20d7b31b`。属于唯一台账阶段 A，本组代码收敛不代表阶段 A 或平台完成。

## 实现与边界

模型改名保留稳定模型身份、明确的新注册名、结构化引用迁移、歧义引用拒绝和独立场景/工具文件完成步骤。数据库保存与核验改用既有 `DataSpaceDefinitionSave` 和原 DataView 捕获；删除本 owner 的全 DataSet abandon 及重复回执处理。完整原生回执、领域回读和文件阶段分别确认，未知或部分结果不重放数据库批次，也不能靠采用当前结果跳过未完成引用。

默认核验保留后来的本地编辑。显式丢弃仅处理原捕获目标，全部目标先核身份、上下文、忙碌状态和编辑签名，再同步丢弃。权威 not-applied 后明确放弃会关闭原意图，不留下可再次提交的旧预览，也不触发保存成功回调清掉无关 owner。

提交前中断清理复用 `DataView.dirtyTracking.getDiff(id,row)` 与 `getEditingPatch(id)`，删除新增 stagedRows 和无消费者 pendingRows 两份快照。正式 ClassModel 目录、DataView 概要及 DirtyTrackingDelegate.getDiff 成员指南和源码合同已核对；原生 diff 缺失时拒绝猜测清理。父级通过正式 `verify-page-thin.mjs --update` 将本文件 JSON 基线从 3 收紧到 2；其他变化仅生成排序与换行，未放宽规则。

## 真实页面烟测

从原目录导航进入 NewApp 的 T 空间，打开 `SourceScope_20261018`，输入 `SourceScope_Preview_20261024` 并预览。界面展示真实模型 ID `A7199374E11E24BB0FB6938407224304`、Base_DataModel.Name 原值/新值、原场景绑定和“无配置工具”。点击放弃后原名恢复，关闭可用。

关闭模型配置及整个设计器。在最终 R3 代码冻结后由目录重新开启实例，画布原三个模型仍在；重开 SourceScope，注册名、ContentType 字典来源、说明“来源替换后连续保存已验证 20261018”保持原值，保存禁用、关闭可用，最后退回目录。

本次 **0 次 UI 持久化动作**，不代表 HTTP 请求计数。预览截图取自 R1，R2/R3 未改变该预览取消路径；最终重开截图取自 R3。真实改名、来源变更和删除持久闭环仍在一次性模型联合验收范围，未知故障仅有本地反例证据。

- [烟测摘要](a3-4-smoke.json)
- [改名预览](a3-4-rename-preview.png)
- [最终新实例原值](a3-4-rename-reopened.png)

## 验证与审查

最终完整 rename **66/66**；直接相关 UI **7/7**，另外 344 项未跑；共享 fixture 的其他 owner 影响面 **6 项**通过，分布于数组、主键工作区、来源替换及页面测试。定向子集不与完整套件重复计数。测试使用真实 DataSet/DataView 和已有 fixture；单模型 omitModelWrite 分支修复使 not-applied 真正省略写入，不用写后回滚伪造未生效。

独立初审发现放弃后仍 ready/pending；R1 关闭原意图后，复审又发现成功回调清掉无关来源输入 owner。R2 以先检查 hasPendingSourceInputs、再重取 owner 的真实 session 反例修复此问题。完整规则随后发现新增快照，R3 删除冗余、复用原生 diff；最终 scoped Spec/Task quality PASS，0 open。每轮修复前快照、差异、报告和原始日志均保留于同一 cache。

R3 最终 typecheck、定向和全仓 lint、verify:ai-codegen、完整 verify:rules、build:fe 均退出 0。正式 ClassModel 生成 963 文件。规则仍有两项既有 AI model warning，构建仍有依赖注释及动态导入警告，不宣称零警告。最终文档门禁检查 399 文件通过，Git diff 检查通过。

原始命令与日志：`task-a3-4-report.md`、`a3-4-r3-rename-suite.log`、`a3-4-r3-final-rename-ui.log`、`a3-4-fixture-impact.log`、`a3-4-r3-*.log` 及 exit sidecar；独立审查为 `task-a3-4-review.md` 和 `task-a3-4-r1/r2/r3-review.md`，均位于 `node_modules/.cache/metadata-integration-20261024`。

初轮产品编辑前仅有旧套件绿灯，新增反例红灯未预先留存。后来按单文件备份/hash 恢复约束进行的 BASE sibling 复现明确记为事后证据；父级另留 10 通过/2 失败的冻结矩阵。R1/R2 有修复前反例，R3 使用实际规则失败。测试 setup 错误、误启动后取消的重复 UI 进程不计通过。无 Java、参考仓、后端协议或权限专题修改；跨实例未知恢复、双空间真实组件绑定、未加载保存及整页参考对照仍未完成。
