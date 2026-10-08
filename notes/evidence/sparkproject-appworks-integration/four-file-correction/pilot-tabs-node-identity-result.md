# RendererTabs 节点身份修正结果

## 结果

`RendererTabs` 为 pane 构造渲染节点时，现在把源 pane 的 identity 放在生成 SparkNode 的顶层 `id`，不再写到 `props.id`。面板 `name` 固定使用现有 `getPaneName(pane, index)` 结果，因此无显式 `name` 时，选择项、ElTabPane 与 pane id 回退保持一致。

## 实际修改

- `packages/spark-component/src/components/containers/layout/navigation/RendererTabs/RendererTabs.vue`：`getPaneComponentProps` 不再把 ID 投影为业务 prop；`createPaneRendererConfig` 将原始 ID 放在 SparkNode 顶层，并将 `getPaneName` 结果显式传给面板组件，保持 id 回退和 tab 名称一致。
- `tests/ui/renderer/renderer-tabs-collapse.test.ts`：加入真实 `RendererTabs` 挂载测试，内部 `SparkComponentRenderer` stub 显式关闭。测试检查真实 renderer config 保留两个原 pane ID、`props` 无 `id`，并验证显式 name、id-name 回退、面板子树渲染和 tab-change 转发。

## RED/GREEN 证据

- 最初的真实 renderer 树在 Pane ID 从原 SparkNode 进入生成 Pane 节点时失败，异常为 `[spark] SparkNode.props.id is invalid. Put component identity on SparkNode.id.`，来自 `normalizeSparkNode`。先前简化 stub 会把 SparkComponentRenderer 替换成忽略该校验的 fake renderer，因此不能暴露问题。
- 把 identity 移至顶层后，真实挂载检查又发现无 name 面板在 `ElTabPane` 得到 `tab-1`，而既有 `RendererTabs.getPaneName` 约定应回退到 `pane-id-fallback`。在生成 props 中使用 `getPaneName` 后，同闭环用例通过。
- 最终测试直接挂载 `RendererTabs`，其 pane 子节点仍由实际 `SparkComponentRenderer` 归一化，避免父 renderer slot/children 传递成为被测变量。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| 基线 `pnpm run typecheck`（实施前） | 退出码 2；与本次目标无关的 `tests/runtime/page/design/data-space-design-four-file.test.ts` 有三处既存错误：第 113 行 fileName 被拓宽为 string，第 116 行 loader 返回 `DataSet | undefined`，第 172 行 SparkPageRenderer Vue 组件 h() overload 不匹配。 |
| 最终 `pnpm run typecheck` | 退出码 2；仍只有上述设计页测试文件中的三个错误，本次两个目标文件无 TypeScript 诊断。 |
| 精确 ESLint 两目标 | 退出码 0：`pnpm exec eslint packages/spark-component/src/components/containers/layout/navigation/RendererTabs/RendererTabs.vue tests/ui/renderer/renderer-tabs-collapse.test.ts` |
| 聚焦回归 | 退出码 0：`pnpm exec vitest run tests/ui/renderer/renderer-tabs-collapse.test.ts tests/runtime/page/spark-page-renderer-binding.test.ts`；2 files、26 tests passed。 |
| 设计页依赖用例 `reads the routed target through the formal DataViews` | 退出码 1；失败在测试第 182 行，期望 DOM 含“目标空间”但当前文本没有。测试有未解析 `el-pagination` Vue warning；没有修改设计页文件，也不在本修复范围内。 |
| `pnpm run verify:ai-codegen` | 退出码 0；985 files checked。 |
| `pnpm run verify:dirs` | 退出码 0；directory limits ok。 |
| `git diff --check -- <两个目标文件>` | 退出码 0。 |

Vitest 报告既有 esbuild/oxc 双配置提示。设计页定向失败和 typecheck 失败均来自本任务范围外的当前草稿/测试问题；本任务未改动它们。

## 文件指纹

实施前快照位于 `notes/evidence/sparkproject-appworks-integration/four-file-correction/tabs-node-identity-before/`。

| 文件 | 实施前 SHA-256 | 当前 SHA-256 |
| --- | --- | --- |
| `packages/spark-component/src/components/containers/layout/navigation/RendererTabs/RendererTabs.vue` | `32EEB99BFA3F7F802538D0C8002FDCC80AF8DB99BC0B295AB82B9272E062D859` | `8AE64CA7B3AE2DD690373F2F48B8B77527C18ACB4DECFFCAD987C01A7092DD68` |
| `tests/ui/renderer/renderer-tabs-collapse.test.ts` | `AAF930349D20C22D227739FDCA0DF31449AADDD7B86BDC37430C15C48F49DE74` | `8697445E589E66267A84B347E4B8CD09A7BDC1AF35CCAAF3EBEB9B71CA725973` |

## 范围

只修改计划指定的 `RendererTabs.vue` 与 `renderer-tabs-collapse.test.ts`，并写入本报告及两个目标 preimage。未修改 `RendererTabPane`、`SparkComponentRenderer`、Collapse、设计页或其他源/测试文件；未 commit、push、建分支、部署或执行浏览器验收。等待主控签收后再恢复设计页闭环。

## 主控复核
2026-10-08 03:32：两文件preimage差异已审，独立26项通过，日志pilot-tabs-node-identity-root-tests.log。当前同一设计页草稿导致typecheck未通过，不能宣称整体完成；身份依赖修复接受，恢复设计页收口。

2026-10-08 03:38：设计页执行者已修复其测试三处类型错误并运行typecheck通过，真实挂载最小用例也通过（目标空间/模型/字段显示）。本tabs两文件未再变化；依赖闭环完成，子计划删除。
