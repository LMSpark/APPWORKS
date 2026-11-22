# SmartBid 四文件后端发布研读

## 当前事实

- D849 已有 6 模块、21 能力节点。
- 仓内有 page04-page19 共 16 套四文件页面；平台 page01-03 不对应 SmartBid PageTool，租户由 JWT 处理。
- D849 远端目前只发布了 `smart-bid-authoring-page11`，节点 `7140896B71BDBDF68668E1739622997B` 指向该工具。
- 其余 20 个能力节点均无正式可运行目标；服务运行与恢复隐藏节点保留一条已撤回显示的错误 Vue URL。
- 现有后端发布链已经完整：创建三工作文件 -> 保存仓内 JSON -> 创建三文件历史快照 -> 读取正式 pagedata -> 创建 pagedata/manifest 快照 -> 写 `VersionId` -> 精确回读 -> 刷新导航。

## 19 页到 21 节点映射

| 页面 | nodeId/父节点 | pageId | 处理 |
|---|---|---|---|
| 04 | `81CAB137229B0AD2B418B0AA556538E9` | `smart-bid-authority-page04` | 直接绑定 |
| 05 | `0EDA24B1DDAA9F39D866525A437DE6E3` | `smart-bid-authority-page05` | 直接绑定 |
| 06 | `6745E8A036DE2E00F7B2DD8E95A4A593` | `smart-bid-authority-page06` | 直接绑定 |
| 07 | `EDEE78BEC643D9C16062AA4B800EE484` | `smart-bid-authority-page07` | 直接绑定 |
| 08 | `67393304DC2D07378123FEFFE0B95379` | `smart-bid-collaboration-page08` | 直接绑定 |
| 09 | `F447B53A003052EEB5232E03BD3EF2D6` | `smart-bid-followup-page09` | 直接绑定 |
| 10 | `EC8A143B89CFB6741B239E34C91D4AB3` | `smart-bid-response-page10` | 直接绑定 |
| 11 | `7140896B71BDBDF68668E1739622997B` 的子节点 | `smart-bid-authoring-page11` | 已发布；迁为子页以腾出页12 |
| 12 | `7140896B71BDBDF68668E1739622997B` 的子节点 | `smart-bid-authoring-page12` | 新增子节点 |
| 13 | `CDFE90AB44AE90ADEDD5E10381950B3C` 的子节点 | `smart-bid-authoring-page13` | 新增子节点 |
| 14 | `CDFE90AB44AE90ADEDD5E10381950B3C` 的子节点 | `smart-bid-authoring-page14` | 新增子节点 |
| 15 | `2D6E6B35F32B2B478F135FD0E65A6824`、`7804AC9D8D2C20019B82E0A745467D20` | `smart-bid-collaboration-page15` | 同一 cfg 工具复用于任务/问题两个节点 |
| 16 | `783418C728921EF34DC1359110756F98` | `smart-bid-knowledge-page16` | 直接绑定 |
| 17 | `EB37475E45EBEEC0DDC06379EFF3A8E3` | `smart-bid-knowledge-page17` | 直接绑定 |
| 18 | `103B5B906078444E33120DEBB4938F3C`、`ABED2FC35D0A69DBD112E16169FDFDDB`、`A1B889AA988FB388298EA08D26C120F7` | `smart-bid-authoring-page18` | 同一 cfg 工具复用于动作/输入/验证三个节点 |
| 19 | `33CD331B8895AB35D33AE28822DCF908` | `smart-bid-configuration-page19` | 直接绑定 |

## 结构约束

- Page11 已绑定在节点10 本身。要同时保留 Page11/12，节点10必须改为目录并新增两个页子节点；旧节点的现有 Page11 绑定不能直接复制第二次。
- Page13/14 同理，节点11需要改为目录并新增两个页子节点。
- Page15 同一页面分别绑定节点14 与节点16，正式说明允许任务和问题两个视图。
- Page18 同一页面绑定节点17-20 的 AI 能力组合；节点17 的 ClassModel 页面是 Page17，不与 Page18 共用。
- 节点01租户生命周期不创建页面；节点02/03没有 SmartBid PageTool JSON，本轮保持不发布，不能套平台 Vue。

## 发布与恢复

- 每个 pageId 使用正式 PageToolFile DataView 创建/更新 rule/script/style。
- 每页先保存工作文件并精确回读，再创建不可变快照和 manifest。
- pagedata 使用当前 D849 正式场景 `D3BBA1F0780056C837AC35E9825CAD5A` 的已确认源；不读取旧 84A。
- 写入蓝图前核当前 nodeId、projectId、NavigationUrl、conid、VersionId、字段权限。
- 结果未知只核原 request，不重发。
- 发布后刷新导航并逐页 cold-open；任何失败页保持前一确认状态并记录，不扩散到其它页。
- 本轮不刷新整个浏览器或重启 SPA；验证改为当前运行导航刷新、关闭并重新打开页面实例。

## Page06 502 根因复核

- Page06 的 `rule.json` 与 `script.js` 已确认；`style.css` 的 V2 working replacement 返回非 AjaxResult/502 后保持 unknown。
- 当前 `style.css` 回读仍是提交前基线。`FileResourceAdapter` 正确地只将该状态解释为“不能证明未应用”，不会自动标为 not-applied 或重放上传。
- `DataViewSource.verifyWriteAttempt()` 及 `DataSet.verifySaveJournal()` 都只核原 attempt，UI 通过“核验原提交”得到只读回查结果；若仍未知，当前 UI 只显示原 502/非 Ajax 错误，无法表达“本次回读确认仍是基线”。
- 同一页 working file 使用固定 pageId/文件名并以 `isReplace=true` 写入固定目标，但当前合同没有正式“同 target + 同 bytes 的用户显式补偿重试”入口。不能靠切换 owner、重载页面或 V2/V1 自动 fallback 绕过。
- 攻坚方向是新增一个窄的 DataView source 恢复动作：先只读核验；只有远端已确认是原基线、原 operation 是 update、original bytes 仍可用时，才允许用户再次显式派发同 target + 同 text；失败继续保留 original attempt。新增、删除、`isReplace=false` 快照及 manifest 不开放该动作。
- 现有 `lowcode-design-file-upload.ts` outer catch 会把 AjaxResult 的明确非 200 rejection 也标为 `fileResourceMutationMayHaveApplied`，与 `page-tool-file-dataview.ts` 的 definite-rejection 分类冲突。应同步修复，避免未来把明确拒绝误判为 unknown；该修复不能用于证明当前 502 未应用。
