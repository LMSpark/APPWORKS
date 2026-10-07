# 业务工厂通用 gate 原语设计 — 研读锚点

> 状态：未立项，待启动（2026-10-05 核对）。runtime 目录里仍没有通用谓词原语；应用层仍用 `PAGE_DESIGN_GATE_RULE_KINDS`（`agent-workflow-bindings.ts:49`、`page-design-agent-workflow-binding.ts:186`）按 kind 分发。本轮不改设计内容。
> 2026-10-07：`tools/generate-workflow-design-data.mjs` 已删除；`gateRules` 直接在 `design.json` 维护，正文中引用该脚本处仅作历史参考。
>
> 行号：正文里 2026-06-21 的行号已漂移，不当作现行位置。现行位置以文末「2026-10-05 行号核对」为准。

> 研读锚点。基于 2026-06-21 全仓代码研读，针对 agent-workflow 运行时去业务化目标，设计**业务无关的通用 gate 原语集**，替代当前实现里内置业务名词的 `gateRules[].kind` 枚举。本文件不改任何代码，只读代码 + 产出设计。
>
> 涉及产品事实时以对应源码、模型 class、JSDoc 和产品层文档为准。

## 0. 设计立场与核心原则

**AI 运行时（`packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts`）必须业务无关。**

- 运行时代码里**禁止出现** `pageDesign` / `projectPlanning` / `forbiddenScriptMarkers` / `pageDesignMutationGate` / `projectActionLookup` / `allowedOperations` 等业务名字面量
- pageDesign / projectPlanning 只是两个具体的 AI 业务工厂实例，是 definition 的数据来源，不是运行时要认识的概念
- 运行时只认 workflow definition 数据，所有业务特异性以声明式数据存在于 definition，运行时用**通用原语**解释
- 参考样板：Q1 已定 `conditionalHints[].when` 复用 `packages/spark-data/src/types.ts:543-626` 的 `FilterExpression`（树形判别联合，17 个 operator，运行时不认识任何业务名词）。gate 采用同样思路——通用谓词 + 通用动作原语，不内置业务 kind

设计三段式：每条 gate 规则 = **读什么上下文** + **什么条件谓词** + **命中后什么动作**。三段都用通用原语表达，运行时按 source 路由取值、按 FilterExpression 求值、按 action 原语决策。

## 1. 现有 gate 规则三段式拆解表

现有 gate 逻辑分散在 4 个文件：app 层 `page-design-agent-workflow-binding.ts` / `project-planning-agent-workflow-binding.ts` / `page-design-gates.ts`，以及组合入口 `agent-workflow-bindings.ts`。落盘 JSON 的 `gateRules` 只是骨架（带 kind + 部分参数），实际求值由 app 层 TS 函数执行，解释器 `createBeforeFunctionCall`（`agent-workflow-runtime.ts:186`）只透传给 `gateExecutor` 回调。

### 1.1 pageDesign gate 规则

pageDesign 落盘 JSON 有 3 条 gateRules（`definition.json:310-327`）：`pageDesignMutationGate` / `allowedOperations` / `forbiddenScriptMarkers`。但实际执行路径有两条（历史遗留双轨）：

- 路径 A（`evaluatePageDesignBeforeFunctionCall`，`page-design-agent-workflow-binding.ts:217`）：被 `executeAgentWorkflowGate`（`agent-workflow-bindings.ts:278`）调用，执行 `pageDesignMutationGate` + `allowedOperations`（合并）
- 路径 B（`executePageDesignGate`，`page-design-agent-workflow-binding.ts:274`）：白名单只认 `pageDesignMutationGate`，执行 `evaluatePageDesignScriptOperationGate`（只做 allowedOperations 的 marker 扫描）

实际生效的是路径 A（`agent-workflow-bindings.ts:274-281` switch 到 `evaluatePageDesignBeforeFunctionCall`）。路径 B `executePageDesignGate` 是死代码（`PAGE_DESIGN_GATE_RULE_KINDS` 只含 `pageDesignMutationGate`，且未被组合入口调用）。

#### 规则 P1：pageDesignMutationGate（含 allowedOperations 合并）

| 段 | 内容 | 源码行号 |
|---|---|---|
| 读什么上下文 | ① `options.moduleInstanceId`（即 pageId）② `project.readPlanningProjection()` 找 `summary`（ProjectPageNodeSummary）③ `readPageDesignRunContext(pageId).allowedOperations`（模块级 Map `pageDesignRunContexts`，`page-design-gates.ts:55`） | `page-design-agent-workflow-binding.ts:221,225,233` |
| 判断什么 | 三重校验（`validatePageDesignRunGate`，`page-design-gates.ts:188`）：① `planningReady`：`summary.effectiveDescription` 非空 ② `implGate`：`summary.implGate === 'open'`（缺省看 strictImplGate）③ `upstreamContractsSatisfied`：`summary.upstreamContractsSatisfied !== false`。命中任一 false → reject。三重通过后，若工具是变更类（`model_script`/`writepagefile`/`openpagedesign`，`page-design-gates.ts:166`）且 allowedOperations 非空，对 `options.args.script` 做 marker 扫描 | `page-design-gates.ts:188-220,261-275` |
| 命中后做什么 | reject：返回 `{ status:'reject', reason, fix }`，reason/fix 按 3 种 code（PLANNING_DRAFT/IMPL_GATE_CLOSED/UPSTREAM_CONTRACTS_UNSATISFIED）或 marker 扫描失败定制 | `page-design-gates.ts:192-217,304-308` |

特殊分支：`pageId` 为空 → allow（`page-design-agent-workflow-binding.ts:222`）；`summary` 不存在 → reject（`:226`）。

#### 规则 P2：allowedOperations marker 扫描（独立 kind，实际被 P1 合并）

| 段 | 内容 | 源码行号 |
|---|---|---|
| 读什么上下文 | `options.toolName` / `options.args.script` / `readPageDesignRunContext(pageId).allowedOperations` | `page-design-gates.ts:287-300` |
| 判断什么 | allowedOperations 非空 且 normalize(toolName)==='model_script' 且 script 非空时，遍历 `OPERATION_FALSE_SCRIPT_MARKERS`（`page-design-gates.ts:233`）：对每个 `allowedOperations[op]===false` 的操作域，检查 script 是否 includes 该域的 marker 列表（如 nodeTree→['editNodeTree','getNodeTree']）| `page-design-gates.ts:336-347` |
| 命中后做什么 | reject：`pageDesign: model_script 禁止调用 ${marker}；当前 allowedOperations 未放行该操作域。` | `page-design-gates.ts:304-308` |

#### 规则 P3：forbiddenScriptMarkers（落盘 JSON 有，但 app 层未实现独立求值）

落盘 JSON（`definition.json:318-326`）声明 `markers: ['editNodeTree','editDataSet','setFileText','writePageFile']`，但 app 层 `PAGE_DESIGN_GATE_RULE_KINDS`（`page-design-agent-workflow-binding.ts:188`）只含 `pageDesignMutationGate`，`assertKnownGateRules`（`agent-workflow-bindings.ts:290`）用 `PAGE_DESIGN_GATE_RULE_KINDS`（`:48`，含 3 种）白名单——所以 kind 校验通过，但实际求值走 P1/P2，**forbiddenScriptMarkers 的 markers 参数被忽略**。这是历史遗留：markers 扫描逻辑被 P2 的 `OPERATION_FALSE_SCRIPT_MARKERS` 取代。

| 段 | 内容（按声明语义，非实际执行） | 源码行号 |
|---|---|---|
| 读什么上下文 | `options.args.script` | （无独立实现）|
| 判断什么 | script.includes(marker) 任一命中 | （无独立实现）|
| 命中后做什么 | reject（应有 reason，但未实现） | （无独立实现）|

### 1.2 projectPlanning gate 规则

projectPlanning 落盘 JSON 有 3 条 gateRules（`definition.json:273-291`）：`projectPlanningToolGate` / `projectActionLookup` / `forbiddenScriptMarkers`。实际执行 `evaluateProjectPlanningBeforeFunctionCall`（`project-planning-agent-workflow-binding.ts:296`）→ `evaluateProjectPlanningToolGate`（`:341`）。

#### 规则 PP1：projectPlanningToolGate（含 forbiddenScriptMarkers 合并）

| 段 | 内容 | 源码行号 |
|---|---|---|
| 读什么上下文 | `options.toolName` / `options.args`（纯工具调用参数，**不读 ProjectModel 运行时**） | `project-planning-agent-workflow-binding.ts:342` |
| 判断什么 | ① 先走 PP2（projectActionLookup）② normalize(toolName)!=='model_script' → allow ③ 读 `args.script`，`findForbiddenProjectPlanningScriptMarker` 扫描 `FORBIDDEN_SCRIPT_MARKERS`（`openPageDesign`/`writePageFile`/`setFileText`/`getFileText`/`editNodeTree`/`editDataSet`/`getNodeTree`/`getDataSetTool`，`:320`）| `project-planning-agent-workflow-binding.ts:344-357,422-427` |
| 命中后做什么 | reject：`projectPlanning: model_script 禁止调用 ${marker}；本阶段只处理 navigation 策划，不涉及四文件或 openPageDesign。` + fix | `project-planning-agent-workflow-binding.ts:358-362` |

#### 规则 PP2：projectActionLookup

| 段 | 内容 | 源码行号 |
|---|---|---|
| 读什么上下文 | `options.toolName` / `options.args.kind` / `options.args.attributeName` | `project-planning-agent-workflow-binding.ts:390-397` |
| 判断什么 | normalize(toolName)==='model_attribute_guide' 且 args.kind==='project' 时：① `attributeName` ∈ `PROJECT_ACTION_NAMES`（`readProjectPlanningInput`/`readNavigationPlanningInputs`/`replaceNavigationChildren`，`:331`）→ reject（是 action 不是 attribute）② `attributeName` ∈ `PROJECT_PARAM_TYPE_NAMES`（`ProjectNodeData`，`:337`）→ reject（是参数结构名不是 attribute）| `project-planning-agent-workflow-binding.ts:390-413,436-442` |
| 命中后做什么 | reject：两条定制 reason/fix（action 误用 / paramType 误用） | `project-planning-agent-workflow-binding.ts:399-412` |

#### 规则 PP3：forbiddenScriptMarkers（落盘 JSON 有，被 PP1 合并）

落盘 JSON（`definition.json:282-290`）声明 `markers: ['openPageDesign','writePageFile','setFileText','editNodeTree','editDataSet']`，实际求值被 PP1 的 `findForbiddenProjectPlanningScriptMarker` 合并（用 `FORBIDDEN_SCRIPT_MARKERS` 常量，不读 JSON 的 markers 参数）。markers 参数同样被忽略。

### 1.3 拆解小结：三段式的通用原语映射

| 现有规则 | 读上下文 | 条件谓词 | 动作 | 可纯声明式化？ |
|---|---|---|---|---|
| P1 pageDesignMutationGate | editorState（readPlanningProjection + readPageDesignRunContext）| 三重校验 AND + 变更工具集 + marker 扫描 | reject | **部分**（三重校验需读 ProjectModel 运行时）|
| P2 allowedOperations | editorState（readPageDesignRunContext）+ toolArgs.script | 变更工具集 + allowedOperations[op]===false + script.includes(marker) | reject | **部分**（需读模块级 Map）|
| P3 forbiddenScriptMarkers | toolArgs.script | script.includes(marker) | reject | **完全可** |
| PP1 projectPlanningToolGate | toolArgs.script | script.includes(marker) | reject | **完全可** |
| PP2 projectActionLookup | toolName + args.kind + args.attributeName | 工具名匹配 + kind 匹配 + attributeName ∈ 集合 | reject | **完全可** |
| PP3 forbiddenScriptMarkers | toolArgs.script | script.includes(marker) | reject | **完全可** |

关键发现：
1. **所有 gate 动作都是 reject/allow 二元决策**，无 warn/transform 需求
2. **条件谓词本质都是"字符串包含/相等/集合归属"**，FilterExpression 的 `contains`/`==`/`in` 完全覆盖
3. **唯一难点是上下文读取**：P1/P2 需读 ProjectModel 运行时实例（readPlanningProjection / readPageDesignRunContext），其他规则只读 toolArgs（运行时已天然可见）

## 2. 上下文读取原语设计

### 2.1 设计目标

运行时需要从多个数据源取值供谓词求值，但**运行时不认识任何业务字段名**（如 `effectiveDescription` / `implGate` / `allowedOperations` / `script`）。由 definition 声明"从哪个 source 的哪个 path 取值"，运行时按 source 路由取值。

### 2.2 通用取值表达式 schema

```typescript
export type AgentWorkflowGateValueSource = 'toolArgs' | 'toolName' | 'input' | 'runtimeContext' | 'editorState'

export type AgentWorkflowGateValueRef = Readonly<{
  source: AgentWorkflowGateValueSource
  path: string
  normalize?: 'none' | 'lowerTrim' | 'lowerTrimAlnum'
}>

export type AgentWorkflowGateValue =
  | string
  | number
  | boolean
  | null
  | AgentWorkflowGateValueRef
  | readonly AgentWorkflowGateValue[]
```

- `source` 枚举（运行时认识的通用数据源，不含业务名词）：
  - `toolArgs` — 当前工具调用参数（`options.args`），path 如 `'script'` / `'kind'` / `'attributeName'`
  - `toolName` — 当前工具名（`options.toolName`），path 固定 `''` 或忽略
  - `input` — 本次 run 的 `AiJsonParams` input（systemPrompt 也用这个），path 如 `'pageId'` / `'allowedOperations.dataSet'`
  - `runtimeContext` — `AiAgentRuntimeContext`（moduleId/moduleInstanceId/instanceId），path 如 `'moduleInstanceId'`
  - `editorState` — 通过 `editorGetter` 拿到的编辑器实例（ProjectModel）后，按 path 读字段投影。**这是唯一需要 app 层纯函数钩子的 source**
- `path`：点号分隔的字段路径，运行时按路径取值，不认识具体字段名
- `normalize`：可选归一化（对应现有 `normalizeToolName` 的 `trim().toLowerCase().replace(/[^a-z0-9_]/gu,'')` 等行为），让谓词比较时归一化

### 2.3 运行时按 source 路由取值（运行时去业务化）

运行时 `resolveGateValueRef(ref, context)` 按 source 分发：

```typescript
function resolveGateValueRef(ref, ctx): unknown {
  switch (ref.source) {
    case 'toolArgs': return readPath(ctx.options.args, ref.path)
    case 'toolName': return ctx.options.toolName
    case 'input': return readPath(ctx.input, ref.path)
    case 'runtimeContext': return readPath(ctx.runtimeContext, ref.path)
    case 'editorState': return readEditorStatePath(ctx.editor, ref.path)
    default: throw new Error(`Unknown gate value source: ${ref.source}`)
  }
}
```

**关键约束**：运行时代码里只出现 `toolArgs`/`toolName`/`input`/`runtimeContext`/`editorState` 五个 source 字面量，不出现 `pageDesign`/`projectPlanning`/`script`/`effectiveDescription` 等业务名词。业务字段名（`script`/`effectiveDescription`/`allowedOperations.dataSet` 等）以数据形式存在于 definition 的 `path` 字段。

### 2.4 editorState 的处理：app 层纯函数钩子

`editorState` 是唯一无法纯声明式化的 source——它要读 ProjectModel 运行时实例的投影。运行时（spark-ai 包）不能 import app 层的 ProjectModel，所以需要 app 层通过 binding 注入一个**通用字段投影函数**：

```typescript
export type AgentWorkflowEditorStateProjector = (
  editor: unknown,
  path: string,
) => unknown
```

app 层在 `createAppAgentWorkflowRuntimeBindings`（`agent-workflow-bindings.ts:101`）注入实现，内部认识 ProjectModel 的 `readPlanningProjection()` / `readPageDesignRunContext()` 等方法，按 path 路由。运行时只调用 `projector(editor, path)`，不认识 ProjectModel。

但这样运行时仍需持有 editor 实例。当前 `editorGetter`（`agent-workflow-runtime.ts:174`）返回 `TInstance`，运行时已有 editor。只需在 gate 求值上下文里把 editor 传进来即可。

**path 设计约定**（由 app 层 projector 解释，运行时不认识）：
- `'planningProjection.{{moduleInstanceId}}.effectiveDescription'` → `project.readPlanningProjection().find(s=>s.pageId===pageId).effectiveDescription`
- `'planningProjection.{{moduleInstanceId}}.implGate'` → 同上 `.implGate`
- `'pageDesignRunContext.{{moduleInstanceId}}.allowedOperations.dataSet'` → `readPageDesignRunContext(pageId).allowedOperations.dataSet`

`{{moduleInstanceId}}` 占位符由运行时从 `runtimeContext.moduleInstanceId` 替换（path 里支持 `{{...}}` 插值，复用 `interpolateRuntimeTemplate`，`agent-workflow-runtime.ts:233`）。

### 2.5 editorState 的替代方案：input 透传

对 P2 allowedOperations，更干净的做法是**把 allowedOperations 从 input 透传**（pageDesign 的 `inputContract.paramsSchema` 已有 `allowedOperations` 字段，`definition.json:245-265`）。这样 gate 直接用 `source: 'input', path: 'allowedOperations.dataSet'` 取值，无需 editorState projector。

但 P1 的三重校验（`effectiveDescription`/`implGate`/`upstreamContractsSatisfied`）必须读 ProjectModel 运行时——这些字段不在 input 里（input 只有 `effectiveDescription` 一个，且是 runner 预读后传入，implGate/upstreamContractsSatisfied 未透传）。所以 editorState projector 无法完全避免。

**结论**：editorState source + projector 钩子保留，用于 P1 三重校验；P2 尽量改用 input 透传。

## 3. 条件谓词设计

### 3.1 复用 FilterExpression

直接复用 `packages/spark-data/src/types.ts:543-626` 的 `FilterExpression` 树形判别联合，不做业务化扩展。求值器样板见 `packages/spark-data/src/data-view.ts:633` 的 `_matchesFilterExpression`（树形递归 + `_matchesFilterCondition` 叶子求值）。

FilterExpression 形状（`types.ts:622-626`）：
- `{ field, op, value }` — 叶子条件（字段、操作符、值）
- `{ type: 'and' | 'or', children }` — 逻辑组合
- `{ type: '!condition', field, op, value }` — 叶子取反
- `{ type: '!and' | '!or', children }` — 逻辑组合取反

17 个 operator（`types.ts:543-548`）：`==`/`!=`/`>`/`>=`/`<`/`<=`/`in`/`not in`/`like`/`not like`/`is null`/`is not null`/`between`/`not between`/`startsWith`/`endsWith`/`contains`。

### 3.2 gate 谓词的 field 侧：改为 value ref

FilterExpression 的 `field` 是字符串字段名（假设从单一 row 取值）。gate 场景下，"字段"来自不同 source（toolArgs/input/editorState），所以需要把 `field` 语义改为**通用取值表达式**。

两种方案：

**方案 A（推荐）：field 仍为字符串，但语义改为"path"，由运行时按 gate context 统一从 toolArgs 取值**

破坏 FilterExpression 契约，不推荐。

**方案 B（推荐）：保留 FilterExpression 原样，但 value 侧用 `AgentWorkflowGateValueRef` 引用上下文取值表达式**

FilterExpression 的 `FilterValueExpression`（`types.ts:557-563`）已支持 `FilterFieldValueReference`（`{ kind: 'field', field }`）。扩展思路：gate 场景下，**field 侧和 value 侧都可以是 value ref**。

但直接改 FilterExpression 会污染 spark-data。更干净的做法：gate 不直接复用 FilterExpression type，而是定义一个**结构同构的 gate 专用谓词 type**，内部用 `AgentWorkflowGateValueRef` 替代 `field: string`：

```typescript
export type AgentWorkflowGatePredicateLeaf = Readonly<{
  field: AgentWorkflowGateValueRef
  op: FilterOperator
  value: AgentWorkflowGateValue
}>

export type AgentWorkflowGatePredicate =
  | AgentWorkflowGatePredicateLeaf
  | Readonly<{ type: 'and' | 'or', children: readonly AgentWorkflowGatePredicate[] }>
  | Readonly<{ type: '!condition', field: AgentWorkflowGateValueRef, op: FilterOperator, value: AgentWorkflowGateValue }>
  | Readonly<{ type: '!and' | '!or', children: readonly AgentWorkflowGatePredicate[] }>
```

求值器结构同构于 `_matchesFilterExpression`，只是：
- 叶子求值时，`field` 不再是 `row[field]`，而是 `resolveGateValueRef(field, ctx)`
- value 侧，若为 `AgentWorkflowGateValueRef`，也走 `resolveGateValueRef`；若为标量直接用
- operator 语义完全复用 spark-data 的 17 个（gate 实际只用 `contains`/`==`/`in`/`is null`/`is not null`/`!=`，但保留全集一致性）

### 3.3 现有 gate 规则的谓词映射

| 现有规则 | 谓词表达（gate predicate）|
|---|---|
| P1 三重校验 | `{ type:'and', children:[ {field:{source:'editorState',path:'planningProjection.{{moduleInstanceId}}.effectiveDescription'}, op:'is not null', value:null}, {field:{source:'editorState',path:'...implGate'}, op:'==', value:'open'}, {field:{source:'editorState',path:'...upstreamContractsSatisfied'}, op:'!=', value:false} ] }` |
| P1 变更工具集 | `{ field:{source:'toolName',normalize:'lowerTrimAlnum'}, op:'in', value:['model_script','writepagefile','openpagedesign'] }` |
| P1/P2 marker 扫描 | `{ field:{source:'toolArgs',path:'script'}, op:'contains', value:<marker> }`（对每个 marker 一条叶子，用 `or` 组合；或用 `in` 语义需扩展——FilterExpression 的 `in` 是"rowValue in valueList"，这里要"valueList any in rowValue"，需用 `contains` 配合 value ref）|
| PP2 工具名匹配 | `{ field:{source:'toolName',normalize:'lowerTrimAlnum'}, op:'==', value:'model_attribute_guide' }` |
| PP2 kind 匹配 | `{ field:{source:'toolArgs',path:'kind'}, op:'==', value:'project' }` |
| PP2 attributeName ∈ 集合 | `{ field:{source:'toolArgs',path:'attributeName'}, op:'in', value:['readProjectPlanningInput','readNavigationPlanningInputs','replaceNavigationChildren'] }` |

### 3.4 marker 扫描的谓词难点

P2/PP1 的 marker 扫描逻辑是"script 字符串里是否包含 markers 列表中**任意一个**"。FilterExpression 的 `contains` 是"rowValue 包含 value"（单向）。要表达"script contains any of markers"，有两种方式：

- **方式 1**：对每个 marker 生成一个叶子 `{field:script, op:'contains', value:marker}`，用 `or` 组合。缺点：definition 膨胀（markers 列表长时叶子多）
- **方式 2**：扩展 operator 语义——`contains` 当 value 为数组时表示"rowValue 包含数组中任一元素"。但这改变 FilterExpression 既有语义
- **方式 3（推荐）**：gate 规则层面提供一个"批量 contains any"的**组合谓词快捷形式**，内部展开为 `or` 子树。或直接在 definition 里写 `or` 子树（显式但冗长）

推荐方式 1 + definition 里显式 `or` 子树，保持谓词语义纯净。markers 列表通常 4-8 个，`or` 子树可接受。若嫌冗长，可在生成脚本（`tools/generate-workflow-design-data.mjs`）里用 helper 函数生成。

### 3.5 reject reason/fix 的模板化

现有 gate 的 reject reason/fix 是定制字符串（含业务名词如 `pageDesign`/`projectPlanning`）。去业务化后，reason/fix 由 definition 声明为**模板字符串**，支持 `{{...}}` 插值（复用 `interpolateRuntimeTemplate`）。运行时不认识业务名词，只做模板替换。

```typescript
export type AgentWorkflowGateRejectAction = Readonly<{
  action: 'reject'
  reason: string  // 模板，支持 {{marker}} / {{toolName}} 等插值
  fix?: string
}>
```

## 4. 动作原语设计

### 4.1 gate 决策动作集

调研现有 6 条 gate 规则，**所有命中后动作都是 reject**，未命中则隐式 allow（继续下一条规则或最终 allow）。无 warn/transform/mutate 需求。

设计决策：gate 只负责**二元决策**（reject/allow），不引入 warn/transform。理由：
- gate 是工具调用前置裁决（`beforeFunctionCall`），语义上是"允许/拒绝执行"，warn/transform 不符合生命周期语义
- warn 可由 systemPrompt 的 conditionalHints 承载（软提示），不必进 gate
- transform（改写工具参数）属于另一层关注点，不应混入 gate

### 4.2 动作原语 type

```typescript
export type AgentWorkflowGateAction =
  | Readonly<{ action: 'reject', reason: string, fix?: string }>
  | Readonly<{ action: 'allow' }>

export type AgentWorkflowGateResult = Readonly<{
  ok: boolean
  reason?: string
  fix?: string
}>
```

`reject` → `{ ok:false, reason, fix }`；`allow` → `{ ok:true }`。

### 4.3 规则求值顺序与短路

现有 `executeAgentWorkflowGate`（`agent-workflow-bindings.ts:270`）按 editorSource 分发到单一函数，函数内部按固定顺序求值（P1 三重 → P1 变更工具 → P2 marker；PP2 → PP1 toolName → PP1 marker）。短路：任一 reject 立即返回。

去业务化后，gateRules 是数组，运行时按数组顺序求值，任一规则 reject 立即短路返回（语义同现有）。allow 不短路（继续下一条）。最终无 reject 则 allow。

每条 rule 内部：求值 predicate，命中则执行 action（reject 短路 / allow 继续）。

## 5. 通用 gateRule schema 草案

### 5.1 新定义（业务无关，不写业务 kind）

```typescript
import type { FilterOperator } from '@spark-appworks/spark-data'

export type AgentWorkflowGateValueSource = 'toolArgs' | 'toolName' | 'input' | 'runtimeContext' | 'editorState'

export type AgentWorkflowGateValueRef = Readonly<{
  source: AgentWorkflowGateValueSource
  path: string
  normalize?: 'none' | 'lowerTrim' | 'lowerTrimAlnum'
}>

export type AgentWorkflowGateValue =
  | string
  | number
  | boolean
  | null
  | AgentWorkflowGateValueRef
  | readonly AgentWorkflowGateValue[]

export type AgentWorkflowGatePredicateLeaf = Readonly<{
  field: AgentWorkflowGateValueRef
  op: FilterOperator
  value: AgentWorkflowGateValue
}>

export type AgentWorkflowGatePredicate =
  | AgentWorkflowGatePredicateLeaf
  | Readonly<{ type: 'and' | 'or', children: readonly AgentWorkflowGatePredicate[] }>
  | Readonly<{ type: '!condition', field: AgentWorkflowGateValueRef, op: FilterOperator, value: AgentWorkflowGateValue }>
  | Readonly<{ type: '!and' | '!or', children: readonly AgentWorkflowGatePredicate[] }>

export type AgentWorkflowGateAction =
  | Readonly<{ action: 'reject', reason: string, fix?: string }>
  | Readonly<{ action: 'allow' }>

export type AgentWorkflowNodeGateRule = Readonly<{
  when: AgentWorkflowGatePredicate
  then: AgentWorkflowGateAction
}>

export type AgentWorkflowNodeBeforeFunctionCall = Readonly<{
  gateRules: readonly AgentWorkflowNodeGateRule[]
}>
```

### 5.2 与现有 schema 的差异

- 删除 `kind: string`（业务枚举），改为 `when` + `then` 通用结构
- `when` 是谓词（替代原 kind 的隐式判断逻辑）
- `then` 是动作（替代原 kind 的隐式 reject 行为）
- `op` 复用 spark-data 的 `FilterOperator`（17 个，运行时不认识业务名词）
- `field`/`value` 用 `AgentWorkflowGateValueRef` 引用上下文取值（替代原 kind 内部硬编码的取值逻辑）

### 5.3 运行时求值器签名（单参数 options object，符合 ai-spec 2.9）

```typescript
export type EvaluateAgentWorkflowGateRulesOptions<TInstance> = Readonly<{
  rules: readonly AgentWorkflowNodeGateRule[]
  options: AiAgentBeforeFunctionCallOptions
  input: AiJsonParams
  runtimeContext: AiAgentRuntimeContext
  editor: TInstance
  editorStateProjector?: AgentWorkflowEditorStateProjector
}>

export function evaluateAgentWorkflowGateRules<TInstance>(
  options: EvaluateAgentWorkflowGateRulesOptions<TInstance>,
): AgentWorkflowGateResult
```

运行时 `createBeforeFunctionCall`（`agent-workflow-runtime.ts:186`）调用此函数，删除 `gateExecutor` 回调注入。`editorStateProjector` 由 app 层通过 binding 注入（可选，不注入则 editorState source 报错）。

### 5.4 binding 调整

`AgentWorkflowRuntimeBindings`（`agent-workflow-runtime.ts:56`）：
- 删除 `gateExecutor?: (command) => AgentWorkflowRuntimeGateResult`
- 新增 `editorStateProjector?: (editor: TInstance, path: string) => unknown`
- `AgentWorkflowRuntimeGateCommand`（`:43`）删除（不再透传给 app 层）

## 6. 落盘 JSON 改造示例

### 6.1 pageDesign gateRules 改造

**现状**（`definition.json:310-327`）：

```json
"gateRules": [
  { "kind": "pageDesignMutationGate" },
  { "kind": "allowedOperations" },
  { "kind": "forbiddenScriptMarkers", "markers": ["editNodeTree","editDataSet","setFileText","writePageFile"] }
]
```

**改造后**（业务名词以数据形式存在于 when/then/reason 模板）：

```json
"gateRules": [
  {
    "when": {
      "type": "and",
      "children": [
        { "field": {"source":"runtimeContext","path":"moduleInstanceId"}, "op":"is not null", "value": null },
        { "field": {"source":"editorState","path":"planningProjection.{{moduleInstanceId}}.effectiveDescription"}, "op":"is null", "value": null }
      ]
    },
    "then": { "action":"reject", "reason":"page \"{{moduleInstanceId}}\" effectiveDescription 为空，策划尚未定稿。", "fix":"补全 navigation description / descriptionContext，使 effectiveDescription 非空后再运行 pageDesign。" }
  },
  {
    "when": {
      "type": "and",
      "children": [
        { "field": {"source":"runtimeContext","path":"moduleInstanceId"}, "op":"is not null", "value": null },
        { "field": {"source":"editorState","path":"planningProjection.{{moduleInstanceId}}.implGate"}, "op":"!=", "value":"open" }
      ]
    },
    "then": { "action":"reject", "reason":"page \"{{moduleInstanceId}}\" implGate=closed，实现闸门未放行。", "fix":"人工确认数据流与上游契约后，将 navigation meta.implGate 设为 open，再运行 pageDesign。" }
  },
  {
    "when": {
      "type": "and",
      "children": [
        { "field": {"source":"runtimeContext","path":"moduleInstanceId"}, "op":"is not null", "value": null },
        { "field": {"source":"editorState","path":"planningProjection.{{moduleInstanceId}}.upstreamContractsSatisfied"}, "op":"==", "value": false }
      ]
    },
    "then": { "action":"reject", "reason":"page \"{{moduleInstanceId}}\" upstreamContractsSatisfied=false，上游数据契约未就绪。", "fix":"补齐 iPaaS / pagedata 契约或等待联调通过，再将 upstreamContractsSatisfied 设为 true。" }
  },
  {
    "when": {
      "type": "and",
      "children": [
        { "field": {"source":"toolName","normalize":"lowerTrimAlnum"}, "op":"in", "value":["model_script","writepagefile","openpagedesign"] },
        { "field": {"source":"toolName","normalize":"lowerTrimAlnum"}, "op":"==", "value":"model_script" },
        { "field": {"source":"toolArgs","path":"script"}, "op":"contains", "value":"editNodeTree" }
      ]
    },
    "then": { "action":"reject", "reason":"pageDesign: model_script 禁止调用 editNodeTree；当前 allowedOperations 未放行该操作域。", "fix":"调整 allowedOperations，或改写 script 只调用已放行的 API。" }
  }
]
```

（其余 marker 每个一条 rule，或用 `or` 子树合并；为简洁此处省略）

**注意**：改造后业务名词 `pageDesign`/`effectiveDescription`/`implGate` 等只出现在 definition 数据里（when.path / then.reason 模板），运行时代码不认识它们。

### 6.2 projectPlanning gateRules 改造

**现状**（`definition.json:273-291`）：

```json
"gateRules": [
  { "kind": "projectPlanningToolGate" },
  { "kind": "projectActionLookup" },
  { "kind": "forbiddenScriptMarkers", "markers": ["openPageDesign","writePageFile","setFileText","editNodeTree","editDataSet"] }
]
```

**改造后**（PP2 projectActionLookup 两条规则 + PP1 marker 扫描）：

```json
"gateRules": [
  {
    "when": {
      "type": "and",
      "children": [
        { "field": {"source":"toolName","normalize":"lowerTrimAlnum"}, "op":"==", "value":"model_attribute_guide" },
        { "field": {"source":"toolArgs","path":"kind"}, "op":"==", "value":"project" },
        { "field": {"source":"toolArgs","path":"attributeName"}, "op":"in", "value":["readProjectPlanningInput","readNavigationPlanningInputs","replaceNavigationChildren"] }
      ]
    },
    "then": { "action":"reject", "reason":"projectPlanning: {{attributeName}} 是 ProjectModel action，不是 attribute。", "fix":"改用 model_action_guide({ kind: \"project\", actionName: \"{{attributeName}}\" })，然后在 model_script 中通过 this.{{attributeName}}(...) 调用。" }
  },
  {
    "when": {
      "type": "and",
      "children": [
        { "field": {"source":"toolName","normalize":"lowerTrimAlnum"}, "op":"==", "value":"model_attribute_guide" },
        { "field": {"source":"toolArgs","path":"kind"}, "op":"==", "value":"project" },
        { "field": {"source":"toolArgs","path":"attributeName"}, "op":"in", "value":["ProjectNodeData"] }
      ]
    },
    "then": { "action":"reject", "reason":"projectPlanning: {{attributeName}} 是参数结构名，不是 project attribute。", "fix":"改用 model_action_guide({ kind: \"project\", actionName: \"replaceNavigationChildren\" }) 查看 paramsSchema.children，然后在 model_script 中构造 children 数组。" }
  },
  {
    "when": {
      "type": "and",
      "children": [
        { "field": {"source":"toolName","normalize":"lowerTrimAlnum"}, "op":"==", "value":"model_script" },
        { "field": {"source":"toolArgs","path":"script"}, "op":"contains", "value":"openPageDesign" }
      ]
    },
    "then": { "action":"reject", "reason":"projectPlanning: model_script 禁止调用 openPageDesign；本阶段只处理 navigation 策划，不涉及四文件或 openPageDesign。", "fix":"改用 readProjectPlanningInput / readNavigationPlanningInputs / replaceNavigationChildren 等 ProjectModel action；完成概要后 agent_complete。" }
  }
]
```

（其余 marker 每个一条 rule，或 `or` 子树合并）

### 6.3 reason/fix 模板插值的字段引用

reason/fix 模板里的 `{{attributeName}}` / `{{moduleInstanceId}}` 需要运行时从 gate context 取值插值。设计：reason/fix 模板支持引用 `when` 谓词里出现过的 value ref，运行时求值 reject 时把命中的 field value 注入插值上下文。或更简单：reason/fix 只支持 `runtimeContext` / `toolArgs` / `input` 的固定插值变量（运行时统一构造 values map）。

推荐后者：运行时构造 `values = { moduleInstanceId, toolName, ...toolArgs, ...input }` 传给 `interpolateRuntimeTemplate`，reason/fix 模板用 `{{moduleInstanceId}}` / `{{attributeName}}` / `{{script}}` 等引用。这样不耦合谓词结构。

## 7. 运行时去业务化清单

运行时（`packages/spark-ai/src/agent/workflow/`）需删除/改写的业务名词位置：

### 7.1 `agent-workflow-definition.ts`

- `:144-147` `AgentWorkflowNodeGateRule = { kind: string, [key: string]: unknown }` → 改为 §5.1 的 `when` + `then` 通用结构（删除 `kind`）
- `:153-156` `AgentWorkflowNodeResolveInstance.editorSource: string` → 保留 string（不收紧为业务字面量联合）。**editorSource 是 app 层路由 key，运行时不认识它的值**，保持 `string` 即可，删除"是否收紧为 `'pageDesign' | 'projectPlanning'`"的讨论（见 §8 对计划文件待确认点 4 的影响）
- `:134-137` `AgentWorkflowNodeKnowledge` 补 `workerUrlRef: string`（与本任务相关但非 gate 核心，计划文件已覆盖）

### 7.2 `agent-workflow-runtime.ts`

- `:43-47` `AgentWorkflowRuntimeGateCommand` → 删除（不再透传 editorSource + rules 给 app 层）
- `:49-54` `AgentWorkflowRuntimeSystemPromptCommand.editorSource: string` → 保留（systemPrompt interpolator 去业务化是另一任务，但同样原则：editorSource 保持 string，运行时不认识值）
- `:56-62` `AgentWorkflowRuntimeBindings` → 删除 `gateExecutor?`，新增 `editorStateProjector?`
- `:186-211` `createBeforeFunctionCall` → 改为调用 `evaluateAgentWorkflowGateRules`（解释器内置），不再调 `bindings.gateExecutor`。需要拿到 editor 实例（`resolveInstance` 返回的 TInstance）传入 gate context
- `:116-121` systemPrompt 回调 → 去业务化（另一任务，但同原则）

### 7.3 `agent-workflow-validation.ts`

- `:700-737` `validateOptionalBeforeFunctionCall` → `kind` 非空字符串校验改为 `when` 谓词结构校验 + `then` action 校验
- `:660` `conditionalHints[].when` 只校验是 object → 收紧为谓词结构校验（Q1 已定，与本任务同源）

### 7.4 app 层删除的业务名词（非运行时，但配套）

- `agent-workflow-bindings.ts:48-58` `PAGE_DESIGN_GATE_RULE_KINDS` / `PROJECT_PLANNING_GATE_RULE_KINDS` → 删除
- `agent-workflow-bindings.ts:270-314` `executeAgentWorkflowGate` / `assertKnownGateRules` / `beforeFunctionCallDirectiveToGateResult` → 删除
- `agent-workflow-bindings.ts:123` `gateExecutor` 注入 → 删除
- `page-design-agent-workflow-binding.ts:188-190` `PAGE_DESIGN_GATE_RULE_KINDS` → 删除
- `page-design-agent-workflow-binding.ts:217-250` `evaluatePageDesignBeforeFunctionCall` → 删除（逻辑搬进 definition + 解释器）
- `page-design-agent-workflow-binding.ts:274-299` `executePageDesignGate` → 删除（死代码）
- `project-planning-agent-workflow-binding.ts:296-446` `evaluateProjectPlanningBeforeFunctionCall` / `evaluateProjectPlanningToolGate` / `evaluateProjectActionLookupGate` / `findForbiddenProjectPlanningScriptMarker` / `normalizeProjectPlanningToolName` / `FORBIDDEN_SCRIPT_MARKERS` / `PROJECT_ACTION_NAMES` / `PROJECT_PARAM_TYPE_NAMES` → 删除（逻辑搬进 definition + 解释器）
- `page-design-gates.ts` → **保留** `evaluatePageDesignMutationToolGate` / `evaluatePageDesignScriptOperationGate` / `readPageDesignGateState` / `validatePageDesignRunGate`（这些是 editorState projector 内部实现，app 层纯函数，不被运行时直接调用）；删除模块级 `pageDesignRunContexts` Map 若改 input 透传（见 §2.5）

### 7.5 editorSource 字面量处理

`editorSource` 在运行时只作为 `editorGetterRegistry` 的 key（`agent-workflow-runtime.ts:178-182`），运行时不认识 `'pageDesign'`/`'projectPlanning'` 字面量。app 层 `agent-workflow-bindings.ts:44-46` 定义这些常量并注入 registry。**运行时去业务化无需改 editorSource**——它已是 string，运行时只做 key 查找。

计划文件待确认点 4（`editorSource` 是否收紧为字面量联合）的答案：**不收紧**，保持 `string`，因为运行时不应认识业务字面量。app 层的 registry key 由 app 层自己管理。

## 8. 风险与边界

### 8.1 通用原语能否完全覆盖现有 gate 逻辑？

| 规则 | 覆盖情况 | 说明 |
|---|---|---|
| P3 / PP1 / PP3 forbiddenScriptMarkers | **完全覆盖** | `toolArgs.script` + `contains` 谓词，纯声明式 |
| PP2 projectActionLookup | **完全覆盖** | `toolName` + `toolArgs.kind` + `toolArgs.attributeName` + `==`/`in` 谓词，纯声明式 |
| P2 allowedOperations marker 扫描 | **完全覆盖**（若改 input 透传）| `input.allowedOperations.${op}` + `toolArgs.script` + `contains` 谓词；若不改 input 透传则需 editorState projector |
| P1 pageDesignMutationGate 三重校验 | **需 editorState projector 钩子** | `effectiveDescription`/`implGate`/`upstreamContractsSatisfied` 必须读 ProjectModel 运行时（readPlanningProjection），无法纯声明式化 |

**结论**：通用原语能覆盖所有现有 gate 逻辑，但 P1 三重校验必须保留 app 层 `editorStateProjector` 钩子（运行时调 `projector(editor, path)`，app 层内部认识 ProjectModel）。

### 8.2 哪些 gate 逻辑无法纯声明式化必须保留 app 层纯函数钩子？

- **P1 三重校验**：读 `project.readPlanningProjection().find(s=>s.pageId===pageId)` 的 `effectiveDescription`/`implGate`/`upstreamContractsSatisfied`。这些字段在 ProjectModel 运行时实例上，不在 input 里。必须通过 `editorStateProjector` 钩子。
- **P2 allowedOperations**（若不改 input 透传）：读 `readPageDesignRunContext(pageId).allowedOperations`（模块级 Map）。但若改 input 透传则可纯声明式化。
- **`pageDesignRunContexts` 模块级 Map**（`page-design-gates.ts:55`）：是进程内状态，运行时无法直接读。若 P2 改 input 透传，此 Map 可移除（或仅保留给 toolLoopNudge 用）。

### 8.3 风险项

1. **editorStateProjector 的 path 契约**：运行时和 app 层需约定 path 语法（`planningProjection.{{moduleInstanceId}}.effectiveDescription` 等）。这是新的隐式契约，需文档化。风险：path 语法演进时两端需同步。
2. **reason/fix 模板插值变量**：运行时需统一构造 values map（`moduleInstanceId`/`toolName`/`toolArgs.*`/`input.*`），reason/fix 模板只能引用这些变量。若引用未提供的变量会得到空字符串（`interpolateRuntimeTemplate` 现有行为，`:237`）。风险：模板写错变量名静默为空。
3. **`or` 子树膨胀**：marker 扫描若每个 marker 一条 rule，gateRules 数组会膨胀（pageDesign 4-8 条、projectPlanning 5-8 条）。缓解：用 `or` 子树合并同质 marker，或生成脚本 helper。
4. **FilterOperator `contains` 语义**：spark-data 的 `contains` 是 `includesFilterValue(rowValue, resolvedValue)`（`data-view.ts:607-608`），对大小写敏感。现有 `findForbiddenScriptMarker` 是 `script.includes(marker)`（大小写敏感），语义一致。但 `normalizeProjectPlanningToolName` 做了 `toLowerCase`，需在 value ref 的 `normalize` 字段体现。
5. **`is null` 语义**：spark-data 的 `is null` 判断 `rowValue === null || rowValue === undefined || rowValue === ''`（`data-view.ts:615-616`）。P1 的 `planningReady` 是 `effectiveDescription.trim().length > 0`（`page-design-gates.ts:176`），与 `is null` 语义不完全一致（trim 后空字符串）。需在 projector 里做 trim，或扩展 operator。
6. **gate 求值需要 editor 实例**：现有 `createBeforeFunctionCall`（`agent-workflow-runtime.ts:186`）返回的函数签名是 `(instance, options) => directive`，已有 instance（editor）。改造时把 instance 传入 gate context 即可，无需新取。
7. **editorStateProjector 未注入时的行为**：若 definition 用了 `source:'editorState'` 但 app 层未注入 projector，运行时 fail-fast（`projector is undefined` → throw）。符合 ai-spec 2.11 错误处理。

### 8.4 边界：不属本任务但同原则

- **systemPromptInterpolator 去业务化**：另一任务（计划文件 §1），但同原则——运行时不认识 `editorSource` 值，prompt 模板 + conditionalHints 谓词化。
- **knowledge workerUrlRef**：另一任务（计划文件 §3），符号引用由 app 层路由。
- **resolveInstance identityField**：另一任务（计划文件 §4），运行时不认识 `pageId`/`projectScopeKey` 字面量。

## 9. 对计划文件的影响

`notes/plan-business-factory-single-workflow.md` 以下章节需改写：

### 9.1 §2 gate DSL 章节（`:163-206`）— **整体作废重写**

原方案是 `gateRules[].kind` 字面量联合（4 种业务 kind）+ 每 kind 参数 type。新方案是 `when` + `then` 通用谓词 + 动作原语。原 §2 的 TypeScript type 定义（`:168-194`）、解释器 `evaluateGateRules` 分发逻辑（`:196-200`）全部作废，替换为本文件 §5 的 schema 草案。

### 9.2 待确认点 3（`:202-206`，`:274`）— **作废**

原待确认点 3 问 `allowedOperations`/`pageDesignMutationGate` 如何处理（4 选项 A/B/C/D）。新方案答案明确：
- `forbiddenScriptMarkers`/`projectActionLookup`/`projectPlanningToolGate` → 纯声明式（when + then）
- `allowedOperations` → 改 input 透传，纯声明式
- `pageDesignMutationGate` 三重校验 → 保留 app 层 `editorStateProjector` 钩子（原选项 A 的思路，但 projector 是通用字段投影，非 gate 专用钩子）

### 9.3 待确认点 4（`:275`，`:279`）— **作废**

原待确认点 4 问 `gateRules[].kind` 枚举定哪些、是否合并 `projectPlanningToolGate` 到 `forbiddenScriptMarkers`。新方案删除 kind 枚举，不存在"定哪些 kind"问题。合并问题也消失——所有规则统一为 when+then，"合并"体现为 definition 里是否写成一条 rule 还是多条。

### 9.4 待确认点 8 的 editorSource 部分（`:279`）— **作废**

原待确认点 8 末尾问 `editorSource: string` 是否收紧为字面量联合 `'pageDesign' | 'pageDataDesign' | 'projectPlanning'`。新方案答案：**不收紧**，保持 `string`，运行时不认识业务字面量（见 §7.5）。

### 9.5 §1.2 conditionalHints when 谓词（`:137-158`）— **保留但与 gate 谓词统一**

原方案定义 `AgentWorkflowNodeHintOperator`（4 种 operator）+ `AgentWorkflowNodeHintCondition`。新方案建议 hint when 也复用 `AgentWorkflowGatePredicate`（同构于 FilterExpression，17 个 operator），不再单独定义 hint operator。原待确认点 1（`:272`，operator 范围）答案：复用 FilterOperator 全集，不单独限制。

### 9.6 影响范围章节（`:68-95`）— **更新**

- `agent-workflow-bindings.ts` 影响描述：删除 `gateExecutor` 注入（原 §68-74 保留），新增 `editorStateProjector` 注入
- `page-design-agent-workflow-binding.ts` 影响：`evaluatePageDesignBeforeFunctionCall` / `executePageDesignGate` / `PAGE_DESIGN_GATE_RULE_KINDS` 全部删除（原 §76-85 部分保留，需明确 page-design-gates.ts 保留为 projector 实现）
- `project-planning-agent-workflow-binding.ts` 影响：gate 相关 8 个函数 + 3 个常量全部删除（原 §87-94）
- 落盘 JSON gateRules 改造：从 kind 形式改为 when+then 形式（原 §103-114 更新）

### 9.7 技术方案章节新增 — **通用 gate 原语设计**

计划文件技术方案应新增章节，引用本研读文件 §2-§5 的设计（取值表达式 / 谓词 / 动作 / schema 草案）。

### 9.8 复杂度分级（`:226-236`）— **维持复杂**

本设计不降低复杂度（仍跨包改公共契约 + 删大量 app 层函数 + 新 DSL），反向提问 8 题仍合适。但待确认点从 8 个减为 5 个（3/4/8-editorSource 作废，1/2/5/6/7 保留 + 新增 projector path 契约确认）。

### 9.9 风险项（`:259-268`）— **更新**

- 风险 2（gate 声明式化丢失运行时上下文）更新：明确 editorStateProjector 钩子覆盖 P1，P2 改 input 透传
- 风险 7（page-design-gates.ts 模块级 Map）更新：若 P2 改 input 透传，Map 可移除
- 新增风险：editorStateProjector path 契约演进（见 §8.3）
- 新增风险：reason/fix 模板插值变量静默为空（见 §8.3）

---

## 附：研读源码行号索引

上表是 2026-06-21 的记录，行号已过期，保留作对照。现行位置见下一节。

| 源码位置 | 关键符号 | 行号（2026-06-21，已过期） |
|---|---|---|
| `packages/spark-data/src/types.ts` | `FilterOperator` / `FilterValueExpression` / `FilterFieldValueReference` / `FilterExpression` | `:543-626` |
| `packages/spark-data/src/data-view.ts` | `_matchesFilterCondition` / `_matchesFilterExpression` / `_resolveFilterValueExpression` | `:569-652` |
| `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` | `AgentWorkflowNodeGateRule` / `AgentWorkflowNodeBeforeFunctionCall` / `AgentWorkflowNodeResolveInstance` | `:144-156` |
| `packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts` | `AgentWorkflowRuntimeGateCommand` / `AgentWorkflowRuntimeBindings` / `createBeforeFunctionCall` / `interpolateRuntimeTemplate` | `:43-62,186-211,233-238` |
| `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` | `validateOptionalBeforeFunctionCall` / `validateOptionalConditionalHints` | `:640-737` |
| `src/services/ai/agent-workflow-bindings.ts` | `PAGE_DESIGN_GATE_RULE_KINDS` / `PROJECT_PLANNING_GATE_RULE_KINDS` / `executeAgentWorkflowGate` / `assertKnownGateRules` | `:48-58,270-314` |
| `src/services/page-design/page-design-agent-workflow-binding.ts` | `evaluatePageDesignBeforeFunctionCall` / `executePageDesignGate` / `PAGE_DESIGN_GATE_RULE_KINDS` | `:188-190,217-299` |
| `src/services/page-design/page-design-gates.ts` | `pageDesignRunContexts` / `validatePageDesignRunGate` / `evaluatePageDesignMutationToolGate` / `evaluatePageDesignScriptOperationGate` / `OPERATION_FALSE_SCRIPT_MARKERS` | `:55,188-220,233,261-309` |
| `src/services/project-planning/project-planning-agent-workflow-binding.ts` | `evaluateProjectPlanningBeforeFunctionCall` / `evaluateProjectPlanningToolGate` / `evaluateProjectActionLookupGate` / `FORBIDDEN_SCRIPT_MARKERS` / `PROJECT_ACTION_NAMES` / `PROJECT_PARAM_TYPE_NAMES` | `:296-446` |
| `spark-ai-server/data/.../agent.workflow.pageDesign/definition.json` | `beforeFunctionCall.gateRules` | `:310-327` |
| `spark-ai-server/data/.../agent.workflow.projectPlanning/definition.json` | `beforeFunctionCall.gateRules` | `:273-291` |
| `tools/generate-workflow-design-data.mjs` | pageDesign / projectPlanning gateRules 生成 | `:261-269,413-421` |
| `packages/spark-project-model/src/navigation/project-node.ts` | `ProjectPageNodeSummary`（editorState 读取目标）| `:250-277` |
| `packages/spark-ai/src/agent/business/lifecycle-types.ts` | `AiAgentBeforeFunctionCallOptions` | `:53-58` |
| `packages/spark-ai/src/agent/business/scope-types.ts` | `AiAgentRuntimeContext`（moduleInstanceId 等）| `:86-93` |

## 2026-10-05 行号核对

符号仍在，行号和两处路径已变。`spark-ai-server/` 已不在本仓；definition 现位于 `config/agent-workflows/`。`ProjectPageNodeSummary` 现位于蓝图节点，不再位于 `navigation/project-node.ts`。

| 源码位置 | 关键符号 | 现行行号 |
|---|---|---|
| `packages/spark-data/src/types.ts` | `FilterOperator` / `FilterValueExpression` / `FilterExpression` | `:503-508` / `:517` / `:582-586` |
| `packages/spark-data/src/data-view.ts` | `_resolveFilterValueExpression` / `_matchesFilterCondition` / `_matchesFilterExpression` | `:593` / `:603` / `:657` |
| `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` | `AgentWorkflowNodeGateRule` / `BeforeFunctionCall` / `ResolveInstance` | `:169` / `:174` / `:178` |
| `packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts` | `GateCommand` / `Bindings` / `createBeforeFunctionCall` / `interpolateRuntimeTemplate` | `:41` / `:54` / `:189` / `:236` |
| `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` | `validateOptionalConditionalHints` / `validateOptionalBeforeFunctionCall` | `:804` / `:864` |
| `src/services/ai/agent-workflow-bindings.ts` | `PAGE_DESIGN_GATE_RULE_KINDS` / `PROJECT_PLANNING_GATE_RULE_KINDS` / `executeAgentWorkflowGate` / `assertKnownGateRules` | `:49` / `:55` / `:268` / `:288` |
| `src/services/page-design/page-design-agent-workflow-binding.ts` | `PAGE_DESIGN_GATE_RULE_KINDS` / `evaluatePageDesignBeforeFunctionCall` / `executePageDesignGate` | `:186` / `:215` / `:272` |
| `src/services/page-design/page-design-gates.ts` | `pageDesignRunContexts` / `validatePageDesignRunGate` / `OPERATION_FALSE_SCRIPT_MARKERS` / `evaluatePageDesignMutationToolGate` / `evaluatePageDesignScriptOperationGate` | `:59` / `:182` / `:226` / `:252` / `:278` |
| `src/services/project-planning/project-planning-agent-workflow-binding.ts` | `evaluateProjectPlanningBeforeFunctionCall` / `FORBIDDEN_SCRIPT_MARKERS` / `PROJECT_ACTION_NAMES` / `PROJECT_PARAM_TYPE_NAMES` / `evaluateProjectPlanningToolGate` / `evaluateProjectActionLookupGate` | `:303` / `:327` / `:338` / `:344` / `:348` / `:400` |
| `config/agent-workflows/lmspark/homepage/agent.workflow.pageDesign/definition.json` | `beforeFunctionCall.gateRules` | `:118-134` |
| `config/agent-workflows/lmspark/homepage/agent.workflow.projectPlanning/definition.json` | `beforeFunctionCall.gateRules` | `:111-128` |
| `tools/generate-workflow-design-data.mjs` | pageDesign / projectPlanning `gateRules` 生成 | `:463` / `:598` |
| `packages/spark-project-model/src/blueprint/project-blueprint-node.ts` | `ProjectPageNodeSummary` | `:181` |
| `packages/spark-ai/src/agent/business/lifecycle-types.ts` | `AiAgentBeforeFunctionCallOptions` | `:53` |
| `packages/spark-ai/src/agent/business/scope-types.ts` | `moduleInstanceId` | `:90` |
