状态：implementing

## 任务目标

把 `packages/spark-data/src/tests/data-view`（12 个文件）和 `dataset`（11 个文件）拆到限额以内。只移动测试并改相对导入，不改产品代码。上级 `tests/` 已有 7 个子目录，新目录只加在这两个目录里面。

## 落点

- `data-view/query/`（5）：`computed-query.test.ts`、`data-view-query-config.test.ts`、`data-view-request-options.test.ts`、`data-view-filter-expression.test.ts`、`local-configuration-cascade.test.ts`。根上留 7 个。
- `dataset/command/`（2）：`data-set-command-submit.test.ts`、`data-set-command-view.test.ts`。根上留 9 个。

## 随之修改

- `git mv` 后，进一层的文件把指向 `src` 的 `../../` 改成 `../../../`。`data-view-filter-expression.test.ts` 只用包导入，相对路径不变。留在根上的文件不改。
- `node tools/verify-directory-limits.mjs --update` 去掉 `data-view` 和 `dataset` 两条豁免。其余超限数字不得变大。`packages/spark-data/src/tests` 不得因此超限。

## 验证

- `pnpm exec vitest run packages/spark-data/src/tests/data-view packages/spark-data/src/tests/dataset`
- `pnpm run typecheck`
- `pnpm run verify:rules`
- 检索搬走文件的旧根路径，`notes/` 以外结果为零
