状态：implementing

## 任务目标

把 `tests/runtime/page/design/native` 根上的 26 个文件按对象拆开，使该目录和合并后的 `fields/` 都不超过目录限额。只移动测试文件并改相对导入，不改测试行为、不改产品代码。

## 落点

子目录正好 7 个。`data-space-page.fixture.ts` 留在根上。文件名不改。

- `fields/`：现有 6 个文件，加上 `field-create/` 的 2 个、`field-removal/` 的 1 个、根上的 `data-space-field-edit.test.ts`，共 10 个。之后删除空的 `field-create/`、`field-removal/`。
- `model/`（10）：`data-space-model-create`、`model-edit`、`model-remove`、`model-rename`、`model-functions`、`model-workspace-save`、`model-expression-migration`、`model-source-edit`、`model-fields`、`model-input-fields`。
- `array/`（5）：`data-space-array-create`、`array-items`、`array-headers`、`array-rename`、`array-field-references`。
- `source/`（2）：`data-space-source-input-edit`、`data-space-source-input-batch`。
- `relation/`（2）：`data-space-relation-editor`、`data-space-relation-field-migration`。
- `primary-key/`、`query-preview/` 不动。
- 根上留下 6 个：夹具、`data-space-design-page`、`data-space-layout-edit`、`data-space-workbench`、`data-space-view-parameter-input`、`filter-system-binding`。

## 随之修改

- `git mv` 后，用一次性脚本按原目录重算相对导入。从根上进一层的文件，`./data-space-page.fixture` 变成 `../data-space-page.fixture`，指向 `packages/`、`src/`、`config/`、`support/` 的 `../` 各多一层。`field-create` 与 `field-removal` 并进 `fields/` 后深度不变。
- `node tools/verify-directory-limits.mjs --update` 去掉 `tests/runtime/page/design/native` 这条豁免。其它超限目录的数字不得变大。

## 验证

- `pnpm exec vitest run tests/runtime/page/design/native`
- `pnpm run typecheck`
- `pnpm run verify:rules`
- 检索 `design/native/field-create/`、`field-removal/` 以及根上已搬走的文件名，结果为零
