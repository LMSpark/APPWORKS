状态：blocked

## 任务目标

R16 workflow 严格签收：`workflow-r16-close-loop.mjs` exit 0，`signoffStatus: ready`。

## 仓内已完成（2026-11-16）

- `workflow-manual-contract.mjs` 改读 `flow-workbench/pagedata`（A5BAD）
- `tests/scripts/workflow-manual-contract.test.ts`
- `vite.config.ts` `server.watch.ignored: **/notes/**`
- `workflow-r16-close-loop.mjs` 纳入 manual-contract vitest

## 阻塞（lingmacn）

2026-11-16 烟测：`probe` 仍 **6 缺口**，与用户「设计器已保存」不一致（GetData 回读全空）。**收口暂停**；对齐 D99/dataSetId 后复跑 probe → `workflow-r16-finish.mjs --pk-only`。

## 验证计划

见计划附件轨道 C；`close-loop` 在 `g0MayProceed: true` 且 SPA 四格 pass 后 exit 0。