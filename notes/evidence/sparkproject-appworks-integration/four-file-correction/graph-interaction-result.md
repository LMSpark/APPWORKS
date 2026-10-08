# 数据空间设计页图交互本地闭环

状态：本地七文件实现与定向验证、根类型检查通过；等待后续浏览器验收。

## 已实现

- 图中单击选择、高亮；双击正式模型或已有关系，以当前 DataView 身份进入模型/关系页签。业务编辑草稿阻止切换，页级状态展示原因。
- 已存在合法图中拖动节点形成局部布局草稿，显式保存或取消。拖动预览与事件共享同一折线几何；固定两点路径未移动端，自环、无 pointsList 的自动路径及显式端点/文字坐标分别处理。原文扩展字段和无关边保持。
- 保存前校验快照、业务草稿与精确原文预像，调用现有布局 writer；成功后更新本页基线。失败保留草稿，写入结果未知时锁定再次提交，提示重新读取将放弃本地草稿。布局草稿和关系写入互斥。
- 精确基线来自 `script.js` 的正式加载 `readDataSpaceLayout(id)` → `designLayoutText = layoutText`（约 2424、2438 行）；重挂载恢复同样在约 2509、2517 行。保存取这份原文为 `expectedContent`，另读一次须严格相同才交 writer（约 2052—2062 行）。宿主读写目标为当前 app scope 的 `designfile/SysForm/${id}.json`；writer 在 `src/lowcode/data-space/lowcode-data-space-layout.ts` 约 89—94 行重读该文件字节、严格 UTF-8 解码后与 `expectedContent` 全文相等才上传。这里是完整原文预像，非图节点数组或重新格式化后的 JSON。
- Vue Flow 在草稿、不可读模型、保存中及失效 context 下禁拖；context/disabled 中途变化清拖动预览并恢复节点投影。组件输入不被修改，多个实例隔离。
- 新建关系仍沿既有“当前没有新行字段级权限上下文”的阻止路径；不把完整过滤表达式缩成字段配对。

## 验证

- 初始失败证据：`graph-interaction-component-red.log`；首个组件和真实 PageRuntime 入口 green：`graph-interaction-component-first-green.log`、`graph-interaction-rendered-first.log`。旧断言调整前整页失败见 `graph-interaction-page-first-full.log`。
- 后续验收发现的无坐标端点对象反例先红 `graph-interaction-anchor-red.log`（曾被写成 `x/y: null`），修复后 `graph-interaction-anchor-green.log`；仅有限数值坐标可随节点移动，未知锚点属性原样保留。
- 最终 `pnpm exec vitest run tests/runtime/page/design/data-space-design-graph.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts`：64/64 通过，见 `graph-interaction-final-tests.log`。其中真实组件事件经 rule/PageRuntime 到草稿、取消零请求、精确布局保存一次，再双击模型/关系选择；另覆盖无 pointsList 显式几何、结果未知不重试、快照外 pending 行和组件两点路径。
- 精确 ESLint：`pnpm exec eslint src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.props.ts tests/runtime/page/design/data-space-design-graph.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts config/pages/data-platform/data-space-design/script.js` 退出 0，见 `graph-interaction-final-lint.log`。JSON 解析和 scoped `git diff --check` 退出 0。
- 根 `pnpm run typecheck` 退出 0，见 `graph-interaction-final-root-typecheck.log`。首次类型失败（测试直接对 unknown 取字段与可选节点）见 `graph-interaction-root-typecheck.log`，已用现有运行时对象守卫收束。

## 边界

- 七文件为 `config/pages/data-platform/data-space-design/{rule.json,script.js,style.css}`、`src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.{vue,props.ts}`、上述两项测试。不改共享 `pagedata.json`、宿主或后端。
- 本轮未重建缺失/损坏布局文件，未解锁新关系创建，未做自动排列或边手动调整。浏览器线上页仍为旧样板且目标布局文件缺失，无法以其证明本地新图交互。主控负责后续具备新文件的真实浏览器验证。
