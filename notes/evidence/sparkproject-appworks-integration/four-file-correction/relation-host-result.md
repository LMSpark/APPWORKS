# 关系编辑宿主能力结果

状态：宿主闭环已实现；等待主控整页集成与根级验收。

## 实现

- `DataSpaceDesignApi.readRelationDependencyOptions()` 通过既有 `LowcodeClient` 与分页收集器读取正式“数据关系依赖”字典；保持 `GetData`、`Type=字典`、空 `x-FormKey` 与 `X-AppId` 请求作用域，不推造 scenarioId。每页核 scope 与原始分页完整性，拒绝空集、缺字段及非标量 label/value，保留数字 `0` 字符串化的结果，并在全部行有 `ordIdx` 时本地稳定排序。
- 增加 `dataSpaceDesign` 窄宿主能力及 `$page.readDataSpaceRelationDependencyOptions()`。renderer 仅传递宿主 capability；`buildPageContext` 仅在 design scenario 已声明且 DataSet 已装载时创建 reader，并在异步成功/失败路径核 AbortSignal、generation 与同一 DataSet。
- `dataSpaceLayout.createWriter()` 保持可选，且独立于只读 reader。保存只接受已有且基础 JSON 图结构有效的 `SysForm/{dataSpaceId}.json`；先比较原始字节解码后的精确文本与 `expectedContent`，再委托 `LowcodeDesignFileUpload.uploadWorkingText()`。宿主要求回执 `state === 'success'`，只返回 `void`；拒绝丢失、差异、无权限、scope 变化、失败回执或回读错误，不声称 CAS 或与模型元数据原子提交。

## 修改文件

- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`
- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts`
- `packages/spark-component/src/runtime/app-services.ts`
- `packages/spark-component/src/runtime/script-context-types.ts`
- `packages/spark-component/src/page/context/buildPageContext.ts`
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`
- `packages/spark-component/src/tests/runtime/createSandbox.test.ts`（补齐失败式 `$page` mock，不配置外部宿主）
- `src/lowcode/data-space/lowcode-data-space-design.ts`
- `src/lowcode/data-space/lowcode-data-space-layout.ts`
- `src/App.vue`
- `tests/runtime/auth-nav/data-space/lowcode-data-space-design.test.ts`
- `tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts`
- `tests/runtime/page/runtime/page-script-lifetime.test.ts`
- `tests/runtime/page/catalog/data-space-four-file.test.ts`（补齐失败式 `$page` mock）

## 验证

- `pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src/platform/data-space/design/data-space-design-api.test.ts` — exit 0，62 tests passed。
- `pnpm --filter @spark-appworks/spark-lowcode-api typecheck` — exit 0。
- `pnpm exec vitest run tests/runtime/auth-nav/data-space/lowcode-data-space-design.test.ts tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts` — 最终 exit 0，40 tests passed。
- `pnpm --filter @spark-appworks/spark-component exec vitest run src/tests/runtime/createSandbox.test.ts` — exit 0，25 tests passed。
- 精确 ESLint（所有 13 个实现与测试文件，`--max-warnings=0`）— exit 0。
- `pnpm --filter @spark-appworks/spark-component typecheck` — 修正 sandbox `$page` mock 后 exit 0。
- `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts` — exit 0，65 tests passed；原始输出保存在 `relation-host-catalog-check.log`。
- `pnpm exec eslint tests/runtime/page/catalog/data-space-four-file.test.ts --max-warnings=0` — exit 0；原始输出追加在 `relation-host-catalog-check.log`。

## 边界

关系字典读取、文件保存仅在真实页面运行时使用当前登录/应用 scope；本轮未在线请求。布局保存不自动创建缺失文件，不改 `pagedata.json`、四文件页面配置、模型关系元数据，也不实施完整图画布编辑。此结果只证明宿主与脚本生命周期能力，不代表关系页面或完整数据空间设计页完成；整页 writer 负责真实关系 UI、持久化组合与重新装配验收。
