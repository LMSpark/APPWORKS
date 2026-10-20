状态：superseded（见 notes/data-space-retirement-ledger.md I4 节与 notes/research-data-space-i4-command-inventory.md）

## 任务目标

I4 试点：将输入参数从 `LowcodeDataSpaceInputParameterEdit` 类 FSM 收敛到 P1/P1b（`DataView` 编辑态 + `hasUnconfirmedSave` 核验），保留现有业务语义与测试行为，为批量删除其余 10 个 model-source 命令类铺路。

## 阶段与业务语义

- 设计器「输入参数」对话框：编辑 `Base_DataSet.inputParams`、校验名称非空、确定保存经正式 `saveChanges` 与回读确认、取消/关闭放弃本地覆盖、结果未知时仅核验不重放写入。
- 下游：来源入参 ValueFun、工作台标题仍读共享 `Base_DataSet` 默认视图，保存后不得用窄字段回读覆盖 `Name`/`description`。
- 本阶段不改动关系/级联/数组等其它命令类；不改矩阵「实页」列。

## 影响范围

| 文件 | 概要 |
| --- | --- |
| `src/lowcode/data-space/input-parameters/lowcode-data-space-input-parameter-session.ts` | 已删命令类；模块函数 + `InputParameterEditHost.flow` |
| `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts` | 会话 `stage/save/reload/getInputParameterState`；参数链路 scope 失效不 dispose 整会话 |
| `src/views/.../data-set-design-page.vue` | `parameterState` / `cancelParameters` / `isPending` 改读 `hasUnconfirmedSave`（若状态面收敛） |
| `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-metadata.test.ts` | 仅当对外 `getState().status` 合同变更时调整 |
| `tests/runtime/page/design/native/data-space-design-page.test.ts` | 全量回归 |

## 技术方案

### 状态真值表（2026-10-19 已落地）

| 对外 status | 条件 |
| --- | --- |
| `pending` | `#inFlight`（保存/回读 HTTP 进行中） |
| `readback` | `#recovery === 'readback'`（回执已确认但精确回读/刷新失败） |
| `unsubmitted` | `#recovery === 'unsubmitted'`（未 dispatch） |
| `unknown` | `view.hasUnconfirmedSave` 或 `#recovery === 'unknown'`（403 等无 P1b 标记） |
| `idle` | 以上皆否 |

1. 真值表见上；`assertEditable`/`getState` 均经 `flowStatus()`。
2. `save` 路径：保留 `prepareInputParameters` → `applyEditingRows` → `saveChanges`；传输未确认时依赖 runtime 标记，类内不再设 `unknown`（或 `getState` 派生）。
3. `reload`/`verify`：优先 `abandonUnconfirmedSaves` + `loadFromServer` / 宿主 `refresh`；与 `verifyUnconfirmed` 对齐处调用 DataSet 恢复 API（若已覆盖参数行）。
4. 保留精确 JSON readback 步骤直至证明与 P1b 核验等价；等价后再删临时 query view readback。
5. 删除或内联 `LowcodeDataSpaceInputParameterEdit` 类，会话暴露 `saveInputParameters`/`reloadInputParameters`/`stageInputParameters` 方法。

## 兼容性

- 对外错误码字符串（`DATA_SPACE_INPUT_PARAMETERS_*`）保持不变。
- `getState()` 若保留，须与现有 metadata 测试期望兼容，或一次性更新测试并记入验证计划。

## 验证计划

- `pnpm run typecheck`
- `pnpm exec vitest run tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-metadata.test.ts`
- `pnpm exec vitest run tests/runtime/page/design/native/data-space-design-page.test.ts`
- `pnpm exec vitest run tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts`（参数相关用例）

## 风险项

- 双轨核验导致误清 `hasUnconfirmedSave` 或重复提交。
- 共享 Base_DataSet 视图 refresh 范围回退（历史缺陷）。
