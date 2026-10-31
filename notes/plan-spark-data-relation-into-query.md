状态：implementing

## 任务目标

把 `packages/spark-data/src/resource-relation/resource-relation-definition.ts` 收进 `query/`，使 `packages/spark-data/src` 不再超限。类名 `ResourceRelationDefinition` 不改。`index.ts` 不导出这个类，不用改。

## 落点

`query/` 现有 8 个源文件和 `filter/`。加上这个文件后是 9 个。`src` 的子目录从 8 个降到 7 个，根上文件数仍是 9。删掉空的 `resource-relation/`。

## 随之修改

- `git mv` 后，文件内部的 `../types` 保持不变，`../query/filter/...` 改成 `./filter/...`。
- 调用方改为 `query/resource-relation-definition`：`dataset.ts`、`dataset-crud-tool.ts`、`strategies/computed-column-delegate.ts`、`tests/computed-columns.test.ts`。
- `@module` 改为 `@spark-appworks/spark-data:query/resource-relation-definition`。
- `notes/` 里的历史路径不改。
- 运行 `pnpm run generate:class-model-surface`，不手改 `generated/`。
- `node tools/verify-directory-limits.mjs --update` 后不应再有超限目录。

## 验证

- `pnpm exec vitest run packages/spark-data/src/tests`
- `pnpm run typecheck`
- `pnpm run verify:rules`
- 检索 `resource-relation/resource-relation-definition`，`notes/` 和 `generated/` 以外结果为零
