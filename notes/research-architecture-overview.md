# 研读：SPARK AppWorks 当前架构（2026-10-05，基于 HEAD `944536a31`，第二版：亲自核实）

> 赋能层记录，不是产品事实源。本版每条结论均由主会话直接读码 / grep / 实际运行命令得到；子代理结论只在被核实后才保留。
> 状态：待用户确认理解后，再决定是否改写 `docs/`。

## 0. 本版相对第一版的核实结论

### 0.1 被纠正的子代理结论
| 第一版说法 | 核实事实 |
|---|---|
| `IsShowAtNav===1` 在 `lowcode-runtime.ts` | 在 `spark-lowcode-api/.../project-blueprint-wire.ts:102` 映射为 `runtimeNavigationCandidate`；宿主 `lowcode-runtime.ts:269` 与授权取交集 |
| `LowcodeApi` 在 `core/` | 在 `packages/spark-lowcode-api/src/lowcode-api.ts:30`，9 个成员（blueprint/catalog/dataSpace/design/application/realtime/platform/permission/session） |
| `DataView` ~2300 行 | `data-view.ts` 1938 行 |
| `spark-json-document/schema` 11 文件超限 | 实测不超限（≤10） |
| `spark-data/src` 14 文件、`tests` 31 | 实测 13、28（不含 `index.ts`） |
| `spark-component` README 从本包导入 `defineCapability` | README 是从 `spark-utils` 导入（正确）；**API.md** 才从本包导入且版本停在 0.1.0 |
| 生产只有一个 AI Host | 两种：共享 `appAiAgent`（`ai-turn-bridge.ts:473`）+ 项目策划每次运行独立 Host（`project-planning-agent-run-provider.ts:153`，注释：避免 `ensure` 幂等/HMR 丢 editor） |
| 权限集合 `r/e/h/m/d` = 可读/可编辑/隐藏/脱敏/可删 | **`r` 在 `isFieldRequired` 中用作"必填"**；见 §4.4 |

### 0.2 第一版遗漏的重要事实
- `PERMISSION_SYSTEM.md` 的核心模型（`InstancePermission`/`ModelPermission`/`_perm`）在代码中已不存在，仅 `permAction` 节点属性仍在用。
- 推送的 `944536a31` 使两项检查变红：`verify:ai-codegen`、根 `vitest` 退出码（见 §6）。
- `public/config/tenants/*.json` 全仓零引用。
- 根 `package.json` 未声明但实际 import `spark-ai` 与 `spark-utils`。

## 1. 一句话架构

AppWorks 是**纯前端**：浏览器经同源 `/api` 直连外部 lowcode-jdk17 网关。开发态 Vite 把 `/api` 代理到 `LOWCODE_GATEWAY_URL`（缺失则 `vite.config.ts` 抛错拒绝启动）；仓内无后端。
主线：**lowcode 会话 → 蓝图记录 ∩ 导航授权 → `RuntimeNavigation` → `DynamicRouter` → `SparkPageRenderer` 渲染页面四文件**；AI 以浏览器内 Agent 运行时 + ClassModel 知识做受约束的配置生成。

## 2. 包依赖（package.json 声明 与 源码实际 import 已逐包对照，一致）

```text
spark-utils            axios only
spark-json-document    → utils
spark-data             → utils
spark-lowcode-api      → utils
spark-ai               → json-document, utils            （src 实际 import 同）
spark-project-model    → data, utils
spark-component        → data, json-document, project-model, utils    （devDep: spark-ai，src 非测试代码不 import）
spark-app              → ai, component, data, json-document, project-model, utils
根应用 package.json    → app, component, data, json-document, lowcode-api, project-model
vite-plugin-spark-catalog  无 workspace 依赖（根 devDependency）
```
- 无环、无上行。`lowcode-api` 与 `project-model` 互不依赖，在宿主 `src/lowcode/` 汇合。
- **根应用实际还 import `spark-ai`（`src/services/ai/*`、`page-design/*`）和 `spark-utils`（`lowcode-runtime.ts:22`、`ai-turn-bridge.ts:15`），根 `package.json` 两者都未声明**。`verify:deps` 通过：它只校验第三方运行时依赖归属（`tools/verify-dependency-catalog.mjs`），不管 workspace 包。
- 构建顺序（`scripts/build-packages.mjs`）：utils → json-document → ai → data → project-model → component → app → lowcode-api。
- 开发/测试：`vite.config.ts:80-95` 把所有 `@spark-appworks/*`（含 `spark-ai/agent`、`spark-ai/class-model`、`spark-component/runtime`、`spark-utils/internal`）alias 到 `packages/*/src`。

## 3. 各包职责（读码确认）

| 包 | 版本 | 职责与关键事实 |
|---|---|---|
| `spark-utils` | 0.4.4 | 框架无关底座：`HttpClientBase`、`Logger`、Capability 原语、跨包 SSOT（`ProjectBlueprintNodeKind`、`PermissionMode`、导航表面类型）。另有 `./internal` 子路径 |
| `spark-json-document` | 0.2.0 | JSON 值/路径、JSON Schema（AJV 2020）、不可变树编辑。**`API.md:86` 文档化了 `isRecord`，但 `index.ts` 未导出** |
| `spark-data` | 0.5.4 | `DataSet`→`DataTable`→`DataView`（1938 行）+ 8 个 delegate（Aggregate/Cascade/ComputedColumn/Crud/DirtyTracking/LocalMutation/PrimaryKey/Selection）；`TreeManager`；`SparkNodeTree`；权限类型。`CrudService`/`DataValidator`/strategies 不导出 |
| `spark-project-model` | 0.1.0 | 目录 `blueprint/ io/ page/ project/`。类：`ProjectModel`、`ProjectBlueprintDesign`、`ProjectSession`、`ProjectWorkspace`、`ProjectBlueprintNode`、`ConfigPageNode extends ProjectBlueprintNode`、`ProjectBlueprintIndex`、`PageContentLoader`、`PageFileApi`、`ProjectBlueprintClient`、`ProjectReferenceClient`。`index.ts` 只导出 `ProjectModel`、`ProjectWorkspace`、`PageContentLoader`、`createRuntimePageNode` 等，**不导出** `ConfigPageNode`/`ProjectBlueprintNode` |
| `spark-component` | 0.4.5 | 顶层目录 ai/components/core/page/permission/runtime/system/tests（8 个，超 7）。`index.ts` 仅一个 `export * as permission`，其余扁平。exports：`.` 与 `./runtime` |
| `spark-app` | 0.3.7 | `SparkApp.start`（`start.ts`）：`app.use(Spark.createPlugin())` → `registerAllRenderers()` → 动态 `import('virtual:spark-components')` → `new PageContentLoader` → `createDynamicRouter` → `bootstrap` |
| `spark-lowcode-api` | 0.1.0 | 目录 catalog/contracts/core/design/platform(23 文件)/realtime。`index.ts` 45 条 export。`LowcodeApi` 请求拦截器负责 Bearer 注入与 refresh |
| `spark-ai` | 0.3.7 | 三个 export：`.`、`./agent`、`./class-model`（已核 package.json）。ClassModel 工具闭集 7 个：`query`、`modelGuide`、`attributeGuide`、`actionGuide`、`model_script`、`human_question`、`agent_complete`（`tool-names.ts`） |

## 4. 关键流程（已对照代码）

### 4.1 启动
`src/main.ts:379` `SparkApp.start({ readPageFile: readLowcodePageFile, loadRuntimeDataSet, tenantPathPrefix: '/t/:tenantId/:projectId', loadNavigation, isPlatformNavigationEnabled: () => false })`。
`isPlatformNavigationEnabled` 默认就是 `false`（`dynamic.ts:185`），仅控制 `_loadPlatformNavigation` 是否执行（`dynamic.ts:323`）；`main.ts` 是显式写明。

### 4.2 运行导航装配（`src/lowcode/lowcode-runtime.ts`）
`readLowcodeRuntimeNavigation`：无 `projectId` 且无应用上下文 → `lowcodeApplicationCatalogNavigation()`；否则并行 `blueprint.readRecords` + `readNavigationAuthorization`。
`assembleLowcodeRuntimeNavigation`（:263）：候选 = `record.runtimeNavigationCandidate`（即 `IsShowAtNav===1`）**且**授权树含同 id；`itemKind` 推导：有子节点→`module`；目标 `vue:`→`system-page`；外链→`link`；无目标→`system-action`；其余→`page`；`status==='maintenance'`→`disabled`。
追加 `withShellSystemTools`：把 `vue-pages.json` 中 `scope==='app' && shellTool!==false` 且路径未被业务占用的页，收进名为"SPARK 工具"的 module（id `appworks-system-tools`）。

### 4.3 页面渲染（`SparkPageRenderer.vue`）
`loadConfig`：`beforeLoad` → `loadNodeProps` → `resolveRuntimeDataSet` → `applyNodeProps`。若页面有 `PageDataSpaceBinding` 而未注入 `loadRuntimeDataSet`，直接抛错（:640）。
`applyNodeProps` 顺序（代码注释与实现一致）：1 css → 2 script（沙箱编译、注册 Render*）→ 3 data（`initDataSet` + `sparkProvide(PAGE_DATASET)`）→ 4 rule（`SparkNodeTree.fromPageChildren` → `buildPageChildren`）→ nextTick 执行 `__init__`。
`PAGE_PERMISSION_MODE`：取 `route.meta.permissionMode`，非法则 `'masked'`（:473）。

### 4.4 权限（以代码为准，与 `PERMISSION_SYSTEM.md` 不同）
- 行：`DataRow.lingma_sys_params: { r, e, h, m: string[]; d: boolean }`，`lingma_sys_key`（`spark-data/types.ts:56-62,1584`）。注释："后端最终返回的五个稀疏权限集合；字段集合互相独立，不得压缩为枚举"。
- 快照：`DataPermissionSnapshot { formKey, dataSpaceId, modelId, allowAdd, systemKey, originalRows, authorizedFeatureTags }`。
- `PermissionChecker.ts` 语义：`canDelete`=`d`；`canEdit`=`r.length+e.length>0`；`isFieldEditable`=字段∈`r∪e`；**`isFieldRequired`=字段∈`r`**；`h`→Hidden，`m`→Masked，否则 Visible；**缺行权限 → Hidden（fail-closed）**；`canCreate`=`allowAdd`；import/export/create-child 来自 `authorizedFeatureTags`。
- `PermissionMode` = `'none'|'masked'|'invisible'`（utils，注释"权限未匹配或过渡态时的展示模式"）。`PermissionChecker` 的函数签名里该参数全部带 `_` 前缀被忽略；`PermissionResolver`/`PermissionFilter` 接收该参数，本次**未逐一核实**其内部是否生效。
- 动作权限：节点属性 `permAction` 仍在用（`PermissionResolver.ts:54`）。

### 4.5 pageDesign 闸门（`src/services/page-design/page-design-gates.ts`）
顺序校验三项，均 fail-closed：`PLANNING_DRAFT`（`effectiveDescription` 为空）→ `IMPL_GATE_CLOSED`（`implGate!=='open'`，缺省 closed）→ `UPSTREAM_CONTRACTS_UNSATISFIED`（缺省 false）。
变更类工具集合：`model_script`、`writepagefile`、`openpagedesign`。`allowedOperations` 为某域 `false` 时，对 `model_script` 的 script 做**子串扫描**（`script.includes(marker)`）拦截，属文本级拦截，不是语义级安全边界。

### 4.6 AI Turn
`ai-turn-bridge.ts`：`appAiAgent = createAiAgentHost({ turnCallbacks, maxToolRounds: 16 })`。项目策划每次运行另建独立 Host（同样 16）。LLM/会话在 lowcode 后端，浏览器执行 tool。

### 4.7 lowcode API 细节
- FormKey 常量：`LOWCODE_APPLICATION_CATALOG_FORM_KEY = '7AB874097A1E8711A42FD845939A6E05'`（应用目录/蓝图 GetData，`lowcode-application.ts:8`）；`DATA_SPACE_DESIGN_FORM_KEY = '8D1AB14DD8277F3E7017CD38F77B09FD'`（数据空间设计，`data-space-design-api.ts:32`）。
- 请求拦截器（`lowcode-api.ts:56-77`）：已带双 Authorization 则跳过；access 过期且 refresh 有效 → `platform.refreshSession()`；否则挂 `Bearer`。
- 宿主 401 处理在 `lowcode-runtime.ts:42`。

## 5. SSOT 地图（沿用，均有 verify 脚本且当前通过）
`verify:project-blueprint-ssot`、`ajax-result-parity`、`send-code-parity`、`wire-query-parity` 现状均为绿。

## 6. 实际运行得到的基线（本会话，HEAD `944536a31`）

| 检查 | 结果 |
|---|---|
| `pnpm run typecheck` | 通过（exit 0） |
| `pnpm run lint` | 通过（exit 0） |
| `verify:deps/arch/docs/pages-config/workflow-designs/project-blueprint-ssot/ajax-result-parity/send-code-parity/wire-query-parity/ai-business-boundaries` | 全部通过 |
| **`verify:ai-codegen`** | **失败（1 处）**：`packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-api.ts:93` `Object.entries(patch) as Array<[…]>` 非 `as const` 类型断言。`git blame` 显示该行来自 `944536a31`；`d8b05c313` 中不存在 |
| 根 `vitest run` | 170 文件 / 1289 用例**全部通过，但退出码 1**：2 条 unhandled rejection，`BlueprintWorkspace.vue:62` 调 `props.state.addStatus` 不是函数，源自 `tests/dev/dev-system-header-save.test.ts`。该组件由 `944536a31` 新增 |
| `test:packages:run` | 退出码 0（utils 45、lowcode-api 52、data 403、project-model 27、ai 168、component 90 …均通过；spark-app/json-document 行被我的输出过滤截断，但总退出码为 0） |

⇒ 研读时 `verify:rules` 与 `pnpm run test:run` 在当时 HEAD 都不是绿的。

**后续（同日）**：`333d96b6b` 已修复前两项；台账已重新生成，`verify:rules` 全绿（退出码 0）。§7 列出的文档偏差已按本文事实改写进 `docs/`（新增 `docs/architecture/system-architecture.md`，重写 `DATAFLOW_ARCHITECTURE.md`、`SPARK_PAGE_CONFIG_ARCHITECTURE.md`、`PERMISSION_SYSTEM.md` 等）。
重新生成台账时发现：后端源码比旧台账多 204 个接口、少 4 个；少掉的 `GET /api/LoginAuthority/GetUserInfo` 仍被 `LowcodePlatformApi.getCurrentUser` 调用，但该方法目前只有测试调用，没有生产调用方。
另外 §4.4 中"`PermissionMode` 在 Checker 中不参与判定"需补充：`PermissionResolver.isPermittedAction` 在 `permissionMode === 'none'` 时直接放行。

## 7. 文档 vs 代码（已核实）

1. 不存在于代码的名字：`ProjectEditor`、`ProjectDesign`、`createProjectEditor`、`getAppProjectEditor`、`PageDesign`、`PageRuntime`、`PageNodeFactory`、`pageFeatures`、`readSnapshot`、`NavigationIndex`、`ProjectNodeData`（`packages/` 与 `src/` 全量 grep，仅 `ProjectSession` 存在）。涉及 `docs/README.md`、`docs/SPARK_*_DEEP_DIVE_ZH.md`（各 2 处）、`docs/architecture/DATAFLOW_ARCHITECTURE.md`、`architecture/README.md`、`architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md`、`packages/spark-ai/README.md:40`、`spark-ai/docs/pagedesign-devsystem-zh-cn.md`。
2. `SPARK_PAGE_CONFIG_ARCHITECTURE.md` 目录图写 `src/navigation/`，实际是 `blueprint/`（实测目录）。
3. `docs/architecture/PERMISSION_SYSTEM.md`（30KB，最老）：核心模型 `InstancePermission`/`ModelPermission`/`_perm`/`maskedFields` 数组形态已不存在（grep：仅 `permAction` 与一个测试文件命中）；6 个引用路径断裂（`containers/action-permission.ts`、`tests/permission-*.test.ts`、`tests/renderer-*.test.ts`）。
4. `docs/README.md` 链接 `docs/ai/README.md`：目录不存在。
5. `spark-ai/README.md` 指向 `src/services/ai-host.ts`：不存在。
6. `spark-component/API.md`：版本 0.1.0，从本包导入 `defineCapability`；`README.md:138-149` 的 `containers`/`fields` 命名空间在 `index.ts` 中不存在。
7. `spark-json-document/API.md:86` 的 `isRecord` 未从 `index.ts` 导出。
8. `docs/spark-project-skills-to-appworks-ai-workflow-zh.md` 引用 `page-design-host-run-provider.ts`、`project-planning-host-run-provider.ts`：均不存在（实际为 `*-agent-run-provider.ts`）。
9. `docs/architecture/PLATFORM_TENANT_ROUTING.md`：与 `tenant-scope.ts` 的路径语法（`/t/{tenantId}/{projectId}/…`）及运行导航装配描述一致，**当前**。
10. 文档门禁：`verify:docs` 通过（142 文件），但上述漂移均未被拦截——它不校验类名/路径存在性。

## 8. 目录规模（实测，直接子文件数不含 `index.ts`；上限 10）

文件数 >10：`spark-component/.../fields/data-components` 61、`.../containers/layout` 33、`spark-data/src/tests` 28、`spark-ai/src/class-model/class-model` 28、`.../display/non-data-components` 25、`spark-ai/src/tests` 18、`spark-component/src/ai/components` 18、`spark-component/src/tests` 17、`.../display/data-components` 16、`tests/field` 13、`spark-data/src` 13、`tests/auth-nav` 12、`.../containers/support` 12、`spark-app/src` 11、`src/layout` 11、`.../fields/data-components/composables` 11、`spark-ai/src/agent/business` 11。
子目录 >7：`spark-app/src` 9、`spark-ai/src/class-model` 9、`spark-ai/src/agent` 9、`spark-component/src` 8。

## 9. 其他代码侧事实
- `public/config/tenants/tenant-demo.json`、`tenant-enterprise.json`：全仓（排除 notes/generated）零引用，疑似孤儿。
- `isPlatformNavigationEnabled` 关闭 → `/platform/*` 导航不加载。
- `LowcodeDesignFileUpload` 已从 `index.ts` 导出，但未挂到 `LowcodeApi`；`LowcodeDesignApi` 注释称"不提供 mutating API"。

## 10. 仍未核实 / 不确定
- spark-component 287 个组件实现仅读机制，未逐个读。
- `PermissionResolver`/`PermissionFilter` 内部是否使用 `permissionMode`。
- 后端真实运行行为（后端只读且未启动；仅依据前端代码与台账）。
- `test:packages:run` 中 spark-app、spark-json-document 的具体用例数（总 exit 0）。
- ClassModel 生成管线、增量构建、Worker 加载的实现细节只据代码注释与脚本名，未跑 `generate:class-model-surface`。
