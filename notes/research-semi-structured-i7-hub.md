# semi-structured（I7）— v3 入口 hub

> 整合计划 **I7**（10 矩阵行）：[`plan-appworks-integration.md`](plan-appworks-integration.md) §迭代 I7。实施：[`plan-semi-structured-i7-full.md`](plan-semi-structured-i7-full.md)（**implementing**，MVP 已交付）。

## 1. 三子域

| 子域 | 矩阵行 | 参考 inventory | 本仓现状（2026-10-23） |
| --- | --- | --- | --- |
| excel-import | 7 | `semi-structured/excel-import/ui/*` | `src/views/.../excel-import/` list+editor+panes+2 对话框；`LowcodeExcelImport` + `excel-import-design-ops` |
| json-data | 1 | `json-data-page.vue` | `json-data-page.vue`；`LowcodeJsonData.loadPage` + `JsonContentEdit` staged 视图 |
| pdf-inspect | 3 | **reference-inventory 未命中 pdf** | list+editor+rule-form；`LowcodePdfInspect`；实页 **blocked** |

## 2. 数据链（与 I6 对齐）

- **页面**：`PageRuntime` → `DataSet`/`DataView`；写 **`saveChanges({ views: [...] })`** 或目录 `refresh`。
- **HTTP**：仅在 `src/lowcode/resources/{json-data,excel-import,pdf-inspect}/*-ops.ts` + `spark-lowcode-api` 客户端；Vue **不** import 客户端。
- **共用**：`attachStagedDesignView`（`shared/staged-design-file-view.ts`）、编辑器 `use-staged-design-page.ts`。

## 3. 合同与缺口

| 能力 | 客户端 / ops | 证据 |
| --- | --- | --- |
| JSON 树 | `JsonDataContentClient` → GetJson/SaveJsonData | vitest `json-data-page.test.ts` |
| Excel 设计 | `ExcelImportDesignClient` → Read/WriteDesign | vitest `excel-import-editor.test.ts`（URL 待实服） |
| PDF 规则 | `PdfInspectDesignClient` → Read/WriteRule | vitest + `api-gaps.json` |

## 4. 导航

`config/navigation/vue-pages.json` 已登记 **5** 条系统/工具页（json 1 + excel list/editor + pdf list/editor）；pane/对话框无独立导航（矩阵子组件行）。

## 5. 验证

```bash
pnpm exec vitest run tests/runtime/page/semi-structured
```

与 I6 合并跑：`tests/runtime/page/dictionary` + `structured-config` + `semi-structured` → **103**（当前基线）。

## 6. 待办（不阻塞 MVP）

- 实服核对 Excel/PDF 路径与 envelope；正式模型 `_Base_ImportConfig` / `_Base_PdfInspectRule` / `Base_JsonData` 与蓝图 scenarioId。
- Excel 上传/模板、lookup/rule 对话框业务语义（当前占位）。
- 补 `research-semi-structured-i7-{json,excel,pdf}.md` 调用分类细表（可选）。
