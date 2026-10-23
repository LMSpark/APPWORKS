状态：superseded（2026-10-24）。当前事实、待核服务及完整页面恢复统一进入[唯一台账](data-space-retirement-ledger.md)；下文“完成”仅为历史局部实现记录，不能证明真实服务、完整布局或下游验收通过，不沿 I7 自动续做。

## 任务目标

I7 矩阵 **10 行** semi-structured：excel-import（7）+ json-data（1）+ pdf-inspect（3）；对齐 [`plan-appworks-integration.md`](plan-appworks-integration.md) 迭代 I7 退出条件。

## 阶段与业务语义

| 波 | 交付 |
| --- | --- |
| 0 | hub + `api-gaps.json`（**完成**；子域 research-v3 细表可选补） |
| 1 | json-data：目录+内容 staged save + vitest + vue-pages（**完成**） |
| 2 | excel-import：list/editor/panes/对话框 MVP + vitest（**完成**；上传等待实服） |
| 3 | pdf-inspect：list/editor/rule-form + vitest（**完成**；实页 **blocked**） |
| 4 | 矩阵 10 行、vitest 5 文件、SPARK data 统一（**完成**）；实服走查 **开放** |

## 影响范围（预期）

- `src/views/features/data-platform/semi-structured/**`
- `src/lowcode/resources/{json-data,excel-import,pdf-inspect}/`（或合并 semi-structured 子目录，单目录 ≤10 源文件）
- `packages/spark-lowcode-api/...`（JSON/Excel 专用读写客户端，若合同明确）
- `config/navigation/vue-pages.json`
- `tests/runtime/page/semi-structured/`

## 技术方案（草案）

1. **JSON**：`JsonDataDesignClient`（GetJson/SaveJsonData）；页面 `json-data-page.vue` 绑定树 DataView + 内容 save 分验收。
2. **Excel**：目录 catalog；editor 组合 layout pane + transform rules pane；文件上传走现有 file/integration 合同（待读源码）。
3. **PDF**：MVP 表单 + 缺口登记，禁止假 OCR/假画布。

## 验证计划

- **烟测（全量）**：`pnpm run verify`（typecheck → lint → verify:rules）
- **I7 回归**：`pnpm exec vitest run tests/app/config/vue-page-registry.test.ts` + `tests/runtime/page/{dictionary,structured-config,semi-structured}`（103+）
- **烟测结果（2026-10-23）**：`typecheck`/`lint`/`verify:page-thin` 通过；`pnpm run verify` 在 `verify:ai-codegen` 失败（152 违规，HEAD 基线 158；I7 触及路径已清零）。I7 回归 vitest **116**（registry + dictionary + structured-config + semi-structured）。证据：`notes/evidence/semi-structured-i7/live-pilot-semi-structured-mvp.json`（status **partial**；实页仍 blocked）。

## 风险项

- pdf 参考未进 inventory → 矩阵实页 blocked，不阻塞 json/excel。
- Excel 后端字段与参考 TS 不一致 → vitest mock + api-gaps。
