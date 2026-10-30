# 研读：lowcode resources 目录归组

## 范围（用户 2026-10-31 确认）

- 宿主 `src/lowcode/resources/` 与包 `packages/spark-lowcode-api/src/platform/resources/` 按同一分组整理。
- 仅移动文件和改路径；数据链行为、URL、页面目录不变。整理后 `tools/directory-limits-baseline.json` 对应条目只收不放。

## 宿主 `src/lowcode/resources/`（49 文件，10 子目录，基线豁免 dirs=10）

| 子目录 | 内容 |
| --- | --- |
| data-code / excel-import / json-data / logic-view / pdf-inspect / workflow-definition | 各两文件（约 30 行）：资源适配 `lowcode-*.ts` + `*-design-ops.ts` / `*-content-ops.ts` |
| dictionary | `lowcode-dictionary.ts`（176 行） |
| structured-config | `structured-config-catalog.ts`：数据代码、字典、逻辑视图、流程定义目录页共用的 DataSet 装配 |
| database（23 文件，基线豁免 files=23） | 服务器 3（`lowcode-database-server`、`database-server-catalog-metadata`、`database-server-view-ops`）；目录 1（`lowcode-database-directory`）；目录对象 hub `lowcode-database-table-view` + 15 个 `database-catalog-*`（metadata / view-ops / relation-form / scenario）；三者共用 `lowcode-database-dataset-extensions`（633 行） |
| shared | 仓内场景/文件资源（`repository-scenarios/`、agent-workflow-file-*、project-tool-version、file-resource-query-parameters、staged-design-file-view）、内置导航与蓝图（builtin-system-navigation、builtin-blueprint-node-resource）、导航授权（navigation-authorization-resource）、AI 录入宿主（ai-data-entry-host） |

页面侧 `src/views/features/data-platform/` 已分 `structured-config/`（data-code、data-dictionary、logic-view、workflow-definition）、`semi-structured/`（excel-import、json-data、pdf-inspect）、`database-management/`、`data-set-management/`、`shared/`。

## 包 `packages/spark-lowcode-api/src/platform/resources/`（8 子目录，基线豁免 dirs=8）

data-code、dictionary（schema、workspace、测试与 fixture）、excel-import、json-data、logic-view、pdf-inspect、shared（`http-record-guards.ts`）、workflow-definition。包外只经 `src/index.ts` 112–124 行导出；`package.json` 仅导出 `.` 与 `./contracts`，移动不改变公共 API。

## 影响面

- 约 90 个源/测试文件以 `@/lowcode/resources/<子目录>/...` 深导入，测试含 `vi.mock` 路径字符串。
- `tools/repository-scenario-store.ts`、`tools/vite-plugin-repository-scenarios.ts` 相对导入 `shared/repository-scenarios/repository-scenario-protocol`。
- 生成物：`backend-api-contracts/appworks-consumer-ledger.json`、`generated/dts-class-model` 经正式生成器刷新。
- 被移文件头 `@module` 需同步；docs/knowledge 无引用。
