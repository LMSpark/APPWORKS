状态：implementing

## 任务目标

按数据平台页面分区，重组宿主 `src/lowcode/resources/`、包 `packages/spark-lowcode-api/src/platform/resources/` 与 `tests/runtime/page/database/`，消除对应的目录超限基线；只移动文件、改路径和文件名，不改变任何数据链行为。

## 阶段与业务语义

- 本阶段只交付目录结构：资源适配、页面、URL、DataSet/DataView 装配、保存与权限守卫逻辑全部不变。
- 输入：现有 49 个宿主文件、11 个包文件、15 个数据库测试文件。输出：新目录中的同内容文件、更新后的导入与 `vi.mock` 路径、刷新后的生成物、收紧后的目录基线。
- 下游消费者：约 90 个页面/服务/测试文件、`tools/` 两个仓内场景宿主文件、包 `src/index.ts` 公共导出（公共符号不变）。
- 验收：全量 typecheck、lint、verify:rules、test、build 通过，数据平台页面可正常打开。

## 决策（用户 2026-10-31 回答）

1. 顶层对齐页面分区：`structured-config/`、`semi-structured/`、`database/`，宿主另有 `repository/`、`shared/`。
2. 宿主 `shared/` 拆为 `repository/`（仓内场景、文件资源、内置导航与蓝图、staged-design-file-view）和 `shared/`（导航授权、AI 录入宿主）。
3. `database/` 按对象拆：根目录、`server/`、`catalog/`（再分 `table/`、`relation/`、`workflow/`）。
4. 文件名彻底去重：去掉与任一上级目录名相同的连字符段（精确匹配，`resource` 不视为 `resources` 的重复）；去重后为空的 `lowcode-*` 适配入口文件统一命名为 `resource.ts`。类名、导出符号不改。
5. `tests/runtime/page/database/` 按 `server/`、`catalog/` 拆开，同样去重命名。
6. 验证：全量 + `pnpm run build` + 无头 Edge 打开一个数据平台页。

## 影响范围：文件映射

### 宿主 `src/lowcode/resources/`

| 原路径 | 新路径 |
| --- | --- |
| `structured-config/structured-config-catalog.ts` | `structured-config/catalog.ts` |
| `data-code/lowcode-data-code.ts` | `structured-config/data-code/resource.ts` |
| `data-code/data-code-design-ops.ts` | `structured-config/data-code/design-ops.ts` |
| `dictionary/lowcode-dictionary.ts` | `structured-config/dictionary/resource.ts` |
| `logic-view/lowcode-logic-view.ts` | `structured-config/logic-view/resource.ts` |
| `logic-view/logic-view-design-ops.ts` | `structured-config/logic-view/design-ops.ts` |
| `workflow-definition/lowcode-workflow-definition.ts` | `structured-config/workflow-definition/resource.ts` |
| `workflow-definition/workflow-design-ops.ts` | `structured-config/workflow-definition/design-ops.ts` |
| `excel-import/lowcode-excel-import.ts` | `semi-structured/excel-import/resource.ts` |
| `excel-import/excel-import-design-ops.ts` | `semi-structured/excel-import/design-ops.ts` |
| `json-data/lowcode-json-data.ts` | `semi-structured/json-data/resource.ts` |
| `json-data/lowcode-json-data-content-ops.ts` | `semi-structured/json-data/content-ops.ts` |
| `pdf-inspect/lowcode-pdf-inspect.ts` | `semi-structured/pdf-inspect/resource.ts` |
| `pdf-inspect/pdf-inspect-design-ops.ts` | `semi-structured/pdf-inspect/design-ops.ts` |
| `database/lowcode-database-dataset-extensions.ts` | `database/dataset-extensions.ts` |
| `database/lowcode-database-directory.ts` | `database/directory.ts` |
| `database/lowcode-database-server.ts` | `database/server/resource.ts` |
| `database/database-server-catalog-metadata.ts` | `database/server/catalog-metadata.ts` |
| `database/database-server-view-ops.ts` | `database/server/view-ops.ts` |
| `database/lowcode-database-table-view.ts` | `database/catalog/table-view.ts` |
| `database/database-catalog-scenario.ts` | `database/catalog/scenario.ts` |
| `database/database-catalog-db-view-ops.ts` | `database/catalog/db-view-ops.ts` |
| `database/database-catalog-object-view-ops.ts` | `database/catalog/object-view-ops.ts` |
| `database/database-catalog-object-design-metadata.ts` | `database/catalog/object-design-metadata.ts` |
| `database/database-catalog-list-metadata.ts` | `database/catalog/list-metadata.ts` |
| `database/database-catalog-table-view-ops.ts` | `database/catalog/table/view-ops.ts` |
| `database/database-catalog-field-view-ops.ts` | `database/catalog/table/field-view-ops.ts` |
| `database/database-catalog-field-metadata.ts` | `database/catalog/table/field-metadata.ts` |
| `database/database-catalog-copy-view-ops.ts` | `database/catalog/table/copy-view-ops.ts` |
| `database/database-catalog-register-view-ops.ts` | `database/catalog/table/register-view-ops.ts` |
| `database/database-catalog-sync-view-ops.ts` | `database/catalog/table/sync-view-ops.ts` |
| `database/database-catalog-preview-view-ops.ts` | `database/catalog/table/preview-view-ops.ts` |
| `database/database-catalog-relation-metadata.ts` | `database/catalog/relation/metadata.ts` |
| `database/database-catalog-relation-view-ops.ts` | `database/catalog/relation/view-ops.ts` |
| `database/database-catalog-relation-form-ops.ts` | `database/catalog/relation/form-ops.ts` |
| `database/database-catalog-workflow-metadata.ts` | `database/catalog/workflow/metadata.ts` |
| `database/database-catalog-workflow-view-ops.ts` | `database/catalog/workflow/view-ops.ts` |
| `shared/repository-scenarios/repository-scenario-host-client.ts` | `repository/scenarios/host-client.ts` |
| `shared/repository-scenarios/repository-scenario-protocol.ts` | `repository/scenarios/protocol.ts` |
| `shared/repository-scenarios/repository-scenario-resource.ts` | `repository/scenarios/resource.ts` |
| `shared/agent-workflow-file-owner.ts` | `repository/agent-workflow-file-owner.ts` |
| `shared/agent-workflow-file-resource.ts` | `repository/agent-workflow-file-resource.ts` |
| `shared/builtin-blueprint-node-resource.ts` | `repository/builtin-blueprint-node-resource.ts` |
| `shared/builtin-system-navigation.ts` | `repository/builtin-system-navigation.ts` |
| `shared/file-resource-query-parameters.ts` | `repository/file-resource-query-parameters.ts` |
| `shared/project-tool-version-resource.ts` | `repository/project-tool-version-resource.ts` |
| `shared/staged-design-file-view.ts` | `repository/staged-design-file-view.ts` |
| `shared/ai-data-entry-host.ts` | `shared/ai-data-entry-host.ts`（不动） |
| `shared/navigation-authorization-resource.ts` | `shared/navigation-authorization-resource.ts`（不动） |

结果：顶层 5 个子目录；`database/` 2 文件 + 2 子目录；`catalog/` 6 文件；`catalog/table/` 7 文件；`repository/` 7 文件 + 1 子目录。

### 包 `packages/spark-lowcode-api/src/platform/resources/`

| 原路径 | 新路径 |
| --- | --- |
| `data-code/data-code-design-client.ts` | `structured-config/data-code/design-client.ts` |
| `dictionary/dictionary-schema.ts` | `structured-config/dictionary/schema.ts` |
| `dictionary/dictionary-workspace.ts` | `structured-config/dictionary/workspace.ts` |
| `dictionary/dictionary-workspace.test.ts` | `structured-config/dictionary/workspace.test.ts` |
| `dictionary/tests/dictionary-workspace.fixture.ts` | `structured-config/dictionary/tests/workspace.fixture.ts` |
| `logic-view/logic-view-design-client.ts` | `structured-config/logic-view/design-client.ts` |
| `workflow-definition/workflow-design-client.ts` | `structured-config/workflow-definition/design-client.ts` |
| `excel-import/excel-import-design-client.ts` | `semi-structured/excel-import/design-client.ts` |
| `json-data/json-data-content-client.ts` | `semi-structured/json-data/content-client.ts` |
| `pdf-inspect/pdf-inspect-design-client.ts` | `semi-structured/pdf-inspect/design-client.ts` |
| `shared/http-record-guards.ts` | `shared/http-record-guards.ts`（不动） |

结果：顶层 3 个子目录。包 `src/index.ts` 112–124 行改路径，导出符号不变。

### 测试 `tests/runtime/page/database/`

| 原路径 | 新路径 |
| --- | --- |
| `database-directory-page.test.ts` | `directory-page.test.ts` |
| `database-server-catalog.test.ts` | `server/catalog.test.ts` |
| `database-catalog-load-options.test.ts` | `server/catalog-load-options.test.ts` |
| `database-server.fixture.ts` | `server/resource.fixture.ts` |
| `service-management-page.test.ts` | `server/service-management-page.test.ts` |
| `database-catalog-db-view-ops.test.ts` | `catalog/db-view-ops.test.ts` |
| `database-catalog-field-view-ops.test.ts` | `catalog/field-view-ops.test.ts` |
| `database-catalog-preview-view-ops.test.ts` | `catalog/preview-view-ops.test.ts` |
| `database-catalog-relation-view-ops.test.ts` | `catalog/relation-view-ops.test.ts` |
| `database-catalog-scenario.test.ts` | `catalog/scenario.test.ts` |
| `database-catalog-table-view-ops.test.ts` | `catalog/table-view-ops.test.ts` |
| `database-catalog-workflow-view-ops.test.ts` | `catalog/workflow-view-ops.test.ts` |
| `database-table-view-catalog.test.ts` | `catalog/table-view-catalog.test.ts` |
| `database-table-view.fixture.ts` | `catalog/table-view.fixture.ts` |
| `table-and-view-page.test.ts` | `catalog/table-and-view-page.test.ts` |

结果：根 1 文件 + 2 子目录；`server/` 4 文件；`catalog/` 10 文件。

### 随之修改

- 所有导入方：`@/lowcode/resources/...` 深导入、`vi.mock`/`vi.importActual` 路径字符串、被移文件之间的相对导入、测试对 fixture 的相对导入（含其他测试目录引用这两个 fixture 的位置）。
- `tools/repository-scenario-store.ts`、`tools/vite-plugin-repository-scenarios.ts`：协议导入改为 `repository/scenarios/protocol`。
- 被移文件头 `@module` 路径同步。
- `tools/directory-limits-baseline.json`：经 `node tools/verify-directory-limits.mjs --update` 收紧（删除宿主 resources、resources/database、包 platform/resources、tests/runtime/page/database 四条）。
- 生成物经 `pnpm run generate:class-model-surface`、`pnpm run generate:lowcode-contracts` 刷新。

## 技术方案

1. 开工检查：`git status`、记录 typecheck 基线。
2. 用 `git mv` 按上表移动并改名（宿主、包、测试三批）。
3. 用一个一次性 Node 脚本按映射表重写所有导入字符串（含 `@/` 别名、相对路径、`vi.mock` 字符串、`.js` 后缀的包内导入），执行后删除脚本；残留由 `rg` 旧路径检索确认为零。
4. 改 `@module` 文件头。
5. 刷新生成物与目录基线。
6. 验证。

## 兼容性

- 包公共 API 不变（仅 `.` 与 `./contracts` 导出，符号同名）。
- 宿主深导入路径全部改变；仓外无消费者。
- 去重后多个目录出现同名文件（`resource.ts`、`design-ops.ts`、`view-ops.ts`），编辑器标签页需靠目录区分。

## 验证计划

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run verify:rules`
- `pnpm run test`
- `pnpm --filter @spark-appworks/spark-lowcode-api typecheck` 与 `test:run`
- `pnpm run build`
- 无头 Edge 打开 `localhost:5273` 上一个数据平台页面（数据库服务管理或数据字典）确认渲染
- `rg` 检索旧路径与旧文件名，结果为零（`notes/` 历史记录除外）

## 风险项

- 路径重写遗漏动态字符串（`vi.mock` 工厂、`import()`）：以旧路径全仓检索为零兜底。
- 包内 `.js` 后缀导入与宿主无后缀导入两种写法：脚本分别处理。
- 同名 `resource.ts` 降低搜索可辨识度：用户已接受彻底去重。
