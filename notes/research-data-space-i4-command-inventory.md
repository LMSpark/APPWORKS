# I4 命令类清点与 P1 收敛顺序

依据 `design-appworks-semantic-integration.md` §4.3 删除清单（11 类）+ 会话编排。

**状态（2026-10-20）**：§4.3 **11/11 命令类已删除**；业务逻辑在 `*-session.ts` + Handle；view-design Map 缓存与 `get*()` API 未改。详见 `notes/data-space-retirement-ledger.md` I4 节。

| 类 | Session 路径 | 状态 |
| --- | --- | --- |
| input-parameter-edit | `input-parameters/lowcode-data-space-input-parameter-session.ts` | **已删命令类**；`stage/save/reload/getInputParameterState` |
| field-create | `model-source/field-create/lowcode-data-space-field-create-session.ts` | **已删命令类**；`getFieldCreate` → `FieldCreateHandle` |
| model-create | `model-source/lowcode-data-space-model-create-session.ts` | **已删命令类**；`getModelCreate` → `ModelCreateHandle` |
| source-input-edit | `model-source/source-input/lowcode-data-space-source-input-session.ts` | **已删命令类**；`getSourceInput` / `hasPendingSourceInputs` |
| field-remove | `model-source/removal/lowcode-data-space-field-remove-session.ts` | **已删命令类** |
| model-remove | `model-source/removal/lowcode-data-space-model-remove-session.ts` | **已删命令类** |
| model-rename | `model-source/rename/lowcode-data-space-model-rename-session.ts` | **已删命令类** |
| array-edit | `model-source/array/lowcode-data-space-array-session.ts` | **已删命令类** |
| model-edit | `model-source/model-edit/lowcode-data-space-model-edit-session.ts` | **已删命令类** |
| field-edit | `model-source/field-edit/lowcode-data-space-field-edit-session.ts` | **已删命令类** |
| model-source-edit | `model-source/source-edit/lowcode-data-space-model-source-edit-session.ts` | **已删命令类** |

**保留（非 §4.3 删除）**：`*-references`、`model-dependencies`、`primary-key`、`array-configuration/draft`、`definition-save`、`field-value`/`field-output`、`rename-tools`、metadata/layout/preview。

**不在 I4 删类范围**：view-design 统一 pending registry、删 Map、view-design 大规模瘦身（I5 或后续）。

**关系/级联**：无独立 §4.3 命令类；边面板与 `DataViewCascadeDefinition` 走定义 DataView + 会话 pending，差距清单另文。
