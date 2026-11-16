# D99（lingmacn）Workflow 发布清单

与 [`config/pages/system-scenarios.json`](../../config/pages/system-scenarios.json) ID 一致，勿改 scenarioId。

| 项 | ID / 路径 |
|----|-----------|
| 流程模型列表空间 | `87F0EF6AD1B64D67FFE597E7E3285994` |
| 流程设计空间 | `6E462C4A39EE0D96F4D1A28FFE887C89` |
| 应用 | `D99A1DCE9894698799101EFD70F8FC76` |

发布后 Agent 验收：

```bash
node tools/workflow/probe-workflow-metadata.mjs
node tools/workflow/workflow-d99-smoke.mjs
```

`publishReady.g0MayProceed` 为 true 时再跑 G0。