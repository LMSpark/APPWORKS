# 数据空间设计画布只读预览执行结果

状态：accepted-preview-slice。主控于2026-10-08 04:49签收最终代码；下方中途“待验”描述属于返工记录，以本段为最终结果。

主控最终独立3文件26项通过，日志 `pilot-graph-preview-final-root-tests.log`。三工具配置经正式ProjectWorkspace保存回读一致，高度修正单独保存style并核实；见 `pilot-deploy-graph-preview.json` / `pilot-deploy-graph-preview-height.json`。最终真实整页重开仍6节点全部fit入视口（flow478px），平移/缩放后切页签完全保持transform；交互期间0 API请求，重开无错误响应/console error。原布局7911字符逐字节前后相同；在线记录 `pilot-graph-preview-online.json/png`。首次查询502与三轮浏览器RED均已留证，不以本地26项替代浏览器结果。

此验收仅覆盖只读预览；正式图编辑/保存/草稿保护和M0整页仍未完成。扫描生成注册、真实VueFlow测试与真实浏览器自动按需加载共同证明接线，页面单测中的手工register本身不作自动注册证明。

## 结果

在已验收的四文件设计读取页新增独立“关系图”页签。图仅接收经过结构筛选、数据权限投影的节点/关系显示值；使用已保存的节点中心坐标和合法 `pointsList`，不读取布局旧 `label`/`properties`，不执行布局或业务数据写入。

线上初次接线中 AX6 节点已自动注册，但真实页面截图全白；主控测得图组件外壳为 1120×320，而 Vue Flow 根节点和 viewport 高/宽均为 0。首轮修复把图 pane 定高480px、组件根和 Vue Flow 根填满父级。第二轮浏览器 RED：尺寸为480×478，但首次显示仍为默认 translate(0,0)scale1，6节点有2个被裁切。检查当前安装的 Vue Flow 源码确认，`fitViewOnInit` 在首批节点尺寸更新时立即调用 fitView，随后不论 fit 成功与否都会标记完成；隐藏页签下的早期调用因此不会在显示后重试。

当前组件关闭 `fitViewOnInit`，只在 Vue Flow 根 DOM 实际 bounds 非零、store dimensions 非零、viewport helper 已初始化且节点有非零测量尺寸时，执行一次 `fitView()`。仅成功后记录初始 fit 完成；后续隐藏/显示或尺寸变化不会强制 fit，保留用户 viewport。浏览器对这次 fit 修复的 GREEN（首次显示全节点、切回保留用户 viewport）由主控复验，尚未确认。本报告不声称在线画布已通过，也不代表编辑/保存功能已实现。

第三轮 HMR 浏览器 RED 发现上面的 computed 曾先读非响应式 DOM bounds，再通过 `&&` 短路读取响应式 store 状态；隐藏态 bounds 为0时，尺寸和节点响应式属性没有成为依赖，显示后 computed 不重算。当前已改为先无条件快照读取 dimensions、viewport initialized、nodes及其测量状态，再读取DOM bounds并组合判定，确保 watcher 同时订阅响应式尺寸/节点变化。主控需在同一浏览器上下文验证这项依赖修复后的首次可测量 fit。

## 主控最终浏览器复验

主控报告第三轮修复后真实 GREEN：首次关系图页签 flow 为 478px，6个节点全部进入视口，transform 为 `translate(16.1919px,170.132px) scale(0.626076)`；用户拖拽平移及滚轮缩放后 scale 为 1.24799；切到“模型”再切回时 transform 完全保持。主控继续执行网络零写、配置回读和整页重开签收。

## 最小闭环与实现

- RED：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t "projects only current authorized model text"`，exit 1；`designGraphBeforeRender` 未实现，断言收到的不是决策对象。
- GREEN：实现只读布局投影后运行同一命令，exit 0；1项通过、其余21项跳过。投影只返回节点 id/坐标/MetaName/description 和合法关系 id/端点/路径点；`fieldAccess` 的 invisible 为空、masked 使用 `••••`，不把整行或布局属性传给组件。
- 组件使用 Vue Flow 实际安装版本和真实实例 store。节点232×120，按中心坐标减半宽高映射左上角；保留 `pointsList` 顺序生成显示路径；缺省路径才用本地 smooth-step 路径。拖动、连接、选择、更新、删除等输入均禁用，且 Vue 模板使用实际布尔/null 属性绑定。
- 每个组件以 Vue 实例 uid 建立独立 Vue Flow store；实例没有 Vue 上下文时明确抛错。沿用 Vue Flow scope disposal，不重复销毁 store。
- 线上画布全白问题的修复只调整组件内部及当前页面局部的高度契约：pane 高480px，组件外壳与 `.vue-flow` 均为父级100%高度，不依赖全局屏幕高度。主控待验证隐藏页签后重新显示时 Vue Flow 能正确测量并 fitView。
- 针对 Vue Flow 在不可测量时提前完成 `fitViewOnInit` 的行为，改为监测实际根 DOM bounds、store dimensions、`viewportHelper.viewportInitialized` 与节点实际测量尺寸；响应式状态先于非响应式 DOM guard 读取，避免短路后丢失依赖。条件同时成立后只 fit 一次。成功标记后不随 viewport resize 重复 fit。
- 独立“关系图”页签保留现有表格/概览。Scanner 测试验证新 `.vue` 路径生成按需 import 并登记 `data-space-design-graph`；真实 `SparkPageRenderer` 集成用例验证组件实际进入渲染树。
- 测试覆盖：真实 Vue Flow 的负坐标/中心坐标、非直线多点路径和输入不变；所有只读 prop 的实际 false/null 值；两个同工具实例使用不同 store，更新/卸载一方不影响另一方；重新挂载产生新 store。页面用例覆盖当前权限下的h/m字段、旧label/properties不泄露、正式关系路径点保序、错误路径拒绝、空图与缺布局区分、身份权限失败关闭、目标 DataView 刷新后隐藏。

## 修改范围

仅限计划8个目标文件：

- `src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue`：新增只读 Vue Flow 显示组件。
- `src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.props.ts`：组件内部节点、关系及显示输入类型。
- `config/pages/data-platform/data-space-design/rule.json`：增加“关系图”页签和隐藏至当前数据就绪的组件节点。
- `config/pages/data-platform/data-space-design/script.js`：清理布局结构、校验路径点、存放只读结构并经正式 DataView/fieldAccess 生成图 props；旧图随加载或失效隐藏。
- `config/pages/data-platform/data-space-design/style.css`：新增局部画布容器尺寸规则。
- `tests/runtime/page/design/data-space-design-graph.test.ts`：真实 Vue Flow 组件、store和生命周期回归。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：正式页面权限投影、路径与失效回归。
- `tests/app/config/spark-components-loading.test.ts`：既有组件扫描虚拟模块的按需注册断言。

改前快照位于 `notes/evidence/sparkproject-appworks-integration/four-file-correction/graph-preview-before/`，保存了5个既有目标文件；新组件和组件测试是新增文件。

## 验证记录

| 命令 | 退出码 | 结果 |
|---|---:|---|
| 基线 `pnpm run typecheck` | 0 | 开始修改前通过 |
| 第一次最终 `pnpm run typecheck` | 2 | 捕获 Vue Flow 类型合同：selectionKeyCode 不接受 boolean false |
| 修正 selection/multi-selection key code 为 null 后 `pnpm run typecheck` | 0 | 通过 |
| `pnpm exec vitest run tests/runtime/page/design/data-space-design-graph.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts tests/app/config/spark-components-loading.test.ts` | 0 | 3文件、26项通过；在 null 修正后运行 |
| 精确 ESLint：组件 `.vue`/`.props.ts`、配置 `script.js`、三测试文件 | 0 | 通过，无输出 |
| 曾包含 JSON/CSS 的精确 ESLint 命令 | 0 | 代码无错误；ESLint 提示未配置 JSON/CSS parser，因此两文件被忽略 |
| `pnpm run verify:pages-config` | 0 | pages-config: ok |
| `pnpm run verify:ai-codegen` | 0 | 988 files checked |
| `pnpm run verify:dirs` | 0 | directory limits: ok |
| 目标范围 `git diff --check -- <8目标>` | 0 | 无空白错误 |
| 本次浏览器 RED 后 `pnpm run typecheck` | 0 | 通过 |
| 本次浏览器 RED 后 `pnpm exec vitest run tests/runtime/page/design/data-space-design-graph.test.ts` | 0 | 1文件、1项通过 |
| 本次浏览器 RED 后 `pnpm exec eslint src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue` | 0 | 通过，无输出 |
| 本次浏览器 RED 后图组件与局部CSS `git diff --check` | 0 | 无空白错误 |
| 第二轮浏览器 RED 后 `pnpm run typecheck` | 0 | 通过 |
| 第二轮浏览器 RED 后 `pnpm exec vitest run tests/runtime/page/design/data-space-design-graph.test.ts` | 0 | 1文件、1项通过 |
| 第二轮浏览器 RED 后 `pnpm exec eslint src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue` | 0 | 通过，无输出 |
| 第二轮浏览器 RED 后图组件/测试 `git diff --check` | 0 | 无空白错误 |
| 第三轮 HMR RED 修复后 `pnpm run typecheck` | 0 | 通过 |
| 第三轮 HMR RED 修复后 `pnpm exec vitest run tests/runtime/page/design/data-space-design-graph.test.ts` | 0 | 1文件、1项通过 |
| 第三轮 HMR RED 修复后 `pnpm exec eslint src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue` | 0 | 通过，无输出 |
| 第三轮 HMR RED 修复后图组件 `git diff --check` | 0 | 无空白错误 |

三套定向测试的最后一次运行输出：`Test Files 3 passed (3); Tests 26 passed (26)`。本次未运行全仓测试或build。测试日志未另存；命令和关键输出如上。

## 最终 SHA-256

```text
0E895972501B5169AACF03DF3805CA2425A573A6E22B74BC2A432AD8B6CCFD38  src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue
A76BD28932275DC64AC4C766B7E7E4079670A101BE4C6369DCD8983D2DA06AF4  src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.props.ts
C47A666474EB6653DFECC0CC1EAB1653CD48C92E5605B2A41305B641F5750AC4  config/pages/data-platform/data-space-design/rule.json
08F8CC0FA429F4247076381EEAA447B96DD2275C978D66FE19BBA41EB80F3170  config/pages/data-platform/data-space-design/script.js
540D47B54F54AEC20083D711A4EEEAE57BCCC2BAA6B062870611BC455699631D  config/pages/data-platform/data-space-design/style.css
D08CA26D00C38D049A1FE2C47962BAEA1F4544EA711F6B5C0BAB083D4FC4BD0A  tests/runtime/page/design/data-space-design-graph.test.ts
34F2258F7E7F2AA6CFD84722392B12F5F6A601B0A952D724D352EF9CE0179A4C  tests/runtime/page/design/data-space-design-four-file.test.ts
5CC9C2D39C1DD009E7BCCA38BB483FBEAD3278137EEEAC3AE3741E0980E69848  tests/app/config/spark-components-loading.test.ts
```

## 剩余项与边界

- 真实画布视口与切换保留已由主控确认；网络零写、配置回读和整页重开签收仍由主控继续。
- Vue Flow 只消费显示投影。没有图编辑、布局保存、dirty owner、关闭/刷新保护或后端写接口。
- 整体工作树包含大量其他既有修改；本轮未提交、推送、建分支、部署，也未更改本计划8文件以外的代码/测试目标。
