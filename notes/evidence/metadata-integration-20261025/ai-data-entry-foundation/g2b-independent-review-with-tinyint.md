# G2b independent Spec + Quality review

## Scope and frozen snapshot

只读审查 `g2b-review-package.patch`（四个新增 G2b 源码/测试文件与公开导出）、`g2b-fields-session-green.md`、唯一台账“当前成组实施设计”及 G2b 修订。没有运行测试/门禁、真实服务或 UI，没有改产品/测试/生成物。

当前五文件 hash 与 GREEN 报告完全一致：

- `ai-data-entry-fields.ts` `1B89C062B5A0EF72467333C75FBC3F08615891BD6627924DA35A427888F8DDCE`
- `ai-data-entry-session.ts` `9E1BCEE99F48AFFA3ECAB901C82A10CEDE9ED0C4B218B15E8265B55EB41BFBBA`
- `ai-data-entry-fields.test.ts` `DC19D5CF169A84ABEC05676E46C417A28C4B4644C7184AAD9818B5B65B71720E`
- `ai-data-entry-session.test.ts` `92777B7BBB06FC66821C8717F855B4E4EBBE9727812FB7DE7A1966C706422B42`
- `packages/spark-lowcode-api/src/index.ts` `47C55346705C4BA91E8DFECAEF39A162259F9D43F8895E3FD1B1681B73DF8DDE`

## Findings

### P1 — definite create/cancel refusal has no session recovery path

`packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-session.ts:463-477` calls `assertNoUnknownCommand()` before its ordinary local-discard branch. That helper at `:622-630` rejects both real unknown captures **and** ordinary dirty request/cancel command rows. Therefore when the branch at `:467-470` should call `discardPendingChanges()`, it is unreachable for precisely those local changes.

This is an actual owner-contract dead end, not a hypothetical. `bindDataSetCommandSubmit` in `packages/spark-data/src/data-set-command/data-set-command-view.ts:181-189` records its `pending` unknown capture only when `isUnconfirmed(error)` is true; a definite failure propagates without `pending.set`. The existing turn-owner test `packages/spark-lowcode-api/src/realtime/ai-turn-resource.test.ts:145-150` establishes the result for a Code 1004 refusal: `hasUnconfirmedSave === false`, command `dirtyTracking.hasPendingChanges() === true`. The session then blocks `start()` / `cancel()` on `#hasPendingCommandChanges`, `discard()` also rejects, and a create with no `turnId` cannot use `refresh()` (`canRefresh` is false). For explicit cancel refusal, the live turn remains active while the dirty cancellation row makes `canCancel` false; discard is blocked by the same guard. The session remains pending and cannot safely dispose.

Required correction: unknown capture and ordinary pending command edits must be separate predicates. `discard()` must refuse `hasUnconfirmedSave`, busy, or nonterminal turn, but permit the user to discard a definite-failure/local command row through the original command DataView API before clearing local input/candidates. Do not abandon a genuine unknown capture. Add focused session tests for a definite create refusal and definite cancel refusal; prove no accidental retry, explicit discard clears the local command row, and the user can then correct/retry or cancel again deliberately. Existing 25 GREEN tests do not cover these recovery cases.

### P2 — dispose preflight does not match DataSet.removeTable's full relation check

`ai-data-entry-session.ts:485-494` preflights resource relations by checking only `parentTable`/`childTable`, then removes `INPUT_TABLE` followed by `CANDIDATE_TABLE`. But `packages/spark-data/src/dataset.ts:1043-1046,1067` also refuses removal when a table is referenced inside a `resourceRelations.filterExpression` (`ResourceRelationDefinition.referencesTable`, `packages/spark-data/src/resource-relation/resource-relation-definition.ts:98-108`). If only the second temporary table is mentioned in such a nested reference, the input table removal can succeed and candidate removal then throw, leaving a live session/lease with one of its owned views already destroyed. The normal host should not attach relations to these temporary tables, so this is lower likelihood than P1, but it violates the stated “remove failure preserves lease/session” behavior.

Required correction/test: preflight both temp tables against the same complete table-reference semantics as `DataSet.removeTable` before either mutation; arrange a relation-expression-only reference to the candidate table and assert dispose rejects while both tables/views remain and session stays intact.

## Spec assessment

**Needs Revision (P1).** The permission/new-row path otherwise follows the intended contracts: `deriveAiDataEntryFields` (`ai-data-entry-fields.ts:38-69`) uses current DataView output columns, `DataColumn.allowAIAdd`, `addActionState`, and `newRowFieldAccess().write`; unsupported types fail closed; no DataView-level AI flag or business-row copy is introduced. Session start reads `businessPrompt` from the static Input DataView and exact configured Agent directory, while turn state comes from formal turn DataView rows. Unknown POST/cancel state is retained in the original command views without resubmission. Stale target schema/query identity prevents candidate exposure/confirmation while `refresh()` can still read formal turn state. Confirmation requires staged target, revalidates schema/permission/context, preflights the whole batch, appends only to the captured target DataView, and never saves business rows. Partial append sets consumed before mutation and blocks whole-batch replay.

Explicit refusal recovery and the incomplete disposal preflight must be corrected before calling the lifecycle contract complete.

## Quality assessment

**Needs Revision for the P1; the reported 25 targeted tests/typecheck/lint results are credible but do not prove definite-refusal recovery.** The session suite covers staged mode, input DataView, exact Agent preflight, formal status/candidate view, stale target, permission, whole-batch validation, partial append, safe reopen, unknown create/cancel and subscription cleanup. It omits create/cancel definite HTTP/business refusal followed by explicit discard/recovery. It also tests successful dispose/reopen, not disposal refusal before any table is removed.

Polling is a G3 integration requirement, not an independent G2b blocker under the existing UI contract: `shouldAutoRefresh` (`ai-data-entry-session.ts:292-297`) may be true when status is undefined after a formal read error. The old dictionary composable pauses automatic polling after a failed refresh and resumes on a manual refresh. The G3 host/component must preserve that pause/manual-recovery behavior (e.g. host-owned paused flag) instead of blindly rescheduling from `shouldAutoRefresh`; this need not move UI pause state into the session.

## Minimal review disposition

Resolve P1 and cover the dispose preflight edge before merging G2b. Keep the already-passing 25 test count as supporting evidence only; no need to rerun unchanged tests during this review. Preserve the G3 manual-poll pause requirement for its component/host review.

## Fix round 1 — R1/P2限定复核（只读）

范围限于 `g2b-fix-r1-review.patch`、session 新增四个 case、DataSet 新增预检 case，以及主控保存的两份运行日志；没有扩审未改实现，也没有重跑测试或门禁。

### 原 findings 状态

- **P1 definite create/cancel refusal recovery — ADDRESSED。** `ai-data-entry-session.ts:466-477` 的 discard 现在只拒绝未知回执、busy 或远端非终态；对确定失败且仅本地 pending 的 requests/cancellations，分别经原 DataView `discardPendingChanges()` 清理，再清除输入/候选。新增 create refusal case 验证 discard 不重 POST，之后用户明确输入新提示才发新请求；cancel refusal case验证 `canCancel` 恢复、重试沿用同一 `operationId`，且 `addRow` 只调用一次；另一个 case验证不重试时可先读到终态再 discard，cancel POST 数不增加。原未知回执保护未被放宽：discard 仍先检查 `hasUnconfirmedSave`，既有 unknown case继续覆盖捕获保留。
- **P2 dispose preflight mismatch — ADDRESSED。** session `dispose()` 先对 Input/Candidates 两表分别调用 DataSet 公共 `assertCanRemoveTable()`，两个预检通过后才删除任一表；DataSet 中 `assertCanRemoveTable` 与 `removeTable` 共用 `assertRemovableTable`，检查同一 relation endpoint、`filterExpression` 嵌套引用及 view cascade 语义。新增 nested `GetRefData` 引用只指向 Candidates 的反例，断言 dispose 拒绝且两表、两视图和 view 实例均保持存活。没有再复制 session 侧关系遍历算法。

### 修复引入回归检查

未发现本轮 diff 引入的阻断回归。正常首次 cancel 仍在无本地命令变化时 refresh 后新增一条命令；确定拒绝后通过同一个本地命令行显式重试；unknown capture、活动远端 turn 和目标/输入状态的既有保护仍在对应谓词中。`removeTable()` 继续调用原完整预检后执行原销毁逻辑；新公共只读方法复用同一实现，避免检查规则漂移。

### 证据与结论

- session 两文件 targeted run：`g2b-r1-root-tests.log` 显示 2 files / 29 tests passed，`g2b-r1-root-tests.exit` 为 0。
- DataSet targeted run：`g2b-r1-root-dataset.log` 显示 1 file / 8 tests passed，`g2b-r1-root-dataset.exit` 为 0。
- 当前修复快照 SHA-256：session `CC2DAA181C9EB2CBF2A66CC64B328ED2155B02A43B7B68B9209A5B65DD5C3744`；session tests `DFF32EF5E86EECAD3538B63A1D55FBF8E781F3ED9E9FDDFD74C145AF82DD9F53`；DataSet `F2A84EE808C6C724189F1A1F2C4D85ABF6D42D013709D06CC71B87CE7908F3FC`；DataSet contract types `6EFB0C907A81BF08188972DFD9D10C474762A76BA905CD960D279237F61B9BC9`；DataSet tests `00D2B468DAAD400295BA48F23DCCA5429CF145A86CE07628D39D750C2B52D073`。

**Round 1 disposition: 原 P1 与 P2 均已解决；本轮限定复核未发现新阻断项。**

## allowAIAdd / tinyint / generated diff 只读补充

### allowAIAdd 真源核对

**当前继承链符合用户纠偏，无 view-local allowAIAdd 注入路径。** `DataColumn.allowAIAdd` 只声明在 `packages/spark-data/src/types.ts:217`。`DataView.columns` (`packages/spark-data/src/data-view.ts:1222-1240`) 无投影时直接返回所属 `DataTable.columns`；有 `fieldProjection` 时逐项按 `resourceField` 从 `table.columns` 找正式列并 spread 该对象，再只覆盖投影合同中的 `viewField/type/label/primaryKey`。`DataViewFieldProjection` (`types.ts:630-646`) 没有 `allowAIAdd` 成员，DataView 序列化/配置不能自行设置这个标志。缺失的正式资源列投影只会产生无 `allowAIAdd` 的对象，不能凭投影开启。

`deriveAiDataEntryFields` (`ai-data-entry-fields.ts:51-74`) 再以 `readSnapshot().fields` 限制当前输出，且必须 `column.allowAIAdd === true`；因此不消费非输出列/`queryColumns` 目录，也不能仅靠 DataView 配置注入该标志。权限仍另查 `addActionState()` 和 `newRowFieldAccess().write`。有投影时字段键、type/label遵循 DataView 正式投影合同，但启用位来自对应 DataTable column；这是投影消费正式列，不是第二份 AI 配置。建议后续加一个窄回归用例证明 fieldProjection 未声明、伪造未知 `allowAIAdd` 属性或引用缺失 resourceField 都不能产出字段；现有测试以正式 DataTable 列配置覆盖主路径。此测试缺口不构成当前实现阻断。

### tinyint 两处修复

`ai-data-entry-fields.ts` 将 `tinyint` 纳入类型白名单，并按整数分支只接受 `Number.isSafeInteger`；字段 type、正式 min/max 未改写，目标 DataView 原 validator 继续执行配置边界。未猜 DB signed/unsigned 范围。保存的源/test hash 与 `g2b-tinyint-fields-green.md` 相同（source `CBBDF6971CFB0B7F886D865AEFE4B188C0BC6ED17D3A9141E1C8EF316F9769C9`，test `1B5F572AFF5D6C060636F8286B17504A2F34AEB1A3970325753F65920DFA973B`），其原日志 exit 为 0、32 tests passed。限定复核未发现这两处变更扩大数据库范围或绕过 DataView validator。

### 生成物差异分类

- **生成器/编译投影噪声**：未改源的类型 shards 中 `__@iterator@207538 → 208152`、`__@unscopables@207540 → 208154` 仅是 TS 合成 symbol 标识重编号；结构/类型签名未变。`semantic-gaps.json` 变动为源代码插入后 declaration line number 顺移；manifest 的 `generatedAt`、扫描计数及 `.dts-manifest` source timestamps 属于重新生成索引元数据。
- **真实当前合同变化**：`spark-data/types.ts.json` 反映 `DataColumn.allowAIAdd`；`dataset.ts.json` 反映新公开只读预检 `assertCanRemoveTable`。新 AI module/index/manifest 条目是 G2a/G2b 的真实公开合同与生成索引，不是噪声。
- **同工作树其他任务的真实产物**：DataSet CRUD/metadata、DataSpaceDesignApi 和 lowcode view-fields 对应当前 G1 源变更，其 generated shard 是实际合同投影，不应按符号噪声删掉；不属于本次 tinyint/allowAIAdd 范围。已抽查的 `business-kit.ts.json`、`app-sse-events.ts.json`、Renderer zone/core types、metadata 与 tree-types 文件只出现合成 symbol ID 重编号。

**本次补充结论：allowAIAdd 真源链与纠偏一致；tinyint 改动范围正确；生成物同时包含可分类的 symbol-ID 噪声和真实合同更新。无阻断发现。**
