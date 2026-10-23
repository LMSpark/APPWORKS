状态：superseded（2026-10-24 归并）。当前事实与后续范围以[唯一台账](data-space-retirement-ledger.md)为准；2026-10-22 的测试数字和矩阵仅为历史证据，不能证明本轮完整整合完成。原目录、专用适配与JSON编辑器的缺项须按参考页和实际服务重核。

## 任务目标

I6 structured-config 矩阵 16 行一次性收束：字典三页闭环 + data-code / logic-view / workflow-definition 从零接通（spark-data + 专用设计 API 适配）。

## 阶段与业务语义

见 Cursor 计划 `i6_structured-config_full_387ae121.plan.md`（只读引用，不在此重复）。实施台账：`notes/research-structured-config-dictionary-i6.md`（I6 hub）及四子域 `research-structured-config-*-i6.md`。

## 影响范围

- `src/lowcode/resources/{data-code,logic-view,workflow-definition}/`
- `packages/spark-lowcode-api/src/platform/resources/{data-code,logic-view,workflow-definition}/`
- `src/views/features/data-platform/structured-config/{data-code,logic-view,workflow-definition}/`
- `config/pages/`、`config/navigation/vue-pages.json`
- `tests/runtime/page/structured-config/`
- `notes/evidence/structured-config-i6/`

## 验证计划

- `pnpm run typecheck`
- `pnpm exec vitest run tests/runtime/page/dictionary tests/runtime/page/structured-config`

## 风险项

- 部分 DataWorkFlow / Code 专用 URL 未列入 `backend-api-contracts` → 适配层 + `api-gaps.json`，vitest mock，不伪造实页成功。
