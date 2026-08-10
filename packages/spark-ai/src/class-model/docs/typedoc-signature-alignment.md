# DtsTypeDeclarationModel 签名对齐 TypeDoc JSONOutput 改造清单

> 状态：设计有效（2026-06）。mutator 回调子模型从 TypeDoc 式 `reflection` 签名树解析。
> 参考：[TypeDoc JSONOutput](https://typedoc.org/api/modules/JSONOutput.html) · 现状类型 [`types.ts`](../class-model/types.ts)

## 目标

1. **结构化 type 树为 SSOT**；`signatureText` 仅作展示/cache，可由 type 树 + 参数列表**派生**。
2. **对齐 TypeDoc `SignatureReflection` + `ParameterReflection` + `Type` 判别联合**（最小子集 + SPARK 扩展 `sourcePath`）。
3. 修复已知失真：`T | undefined`、函数回调、`...rest`、单元素 union、ref 闭包漏挂。

## 真源优先级（改造后）

```text
.d.ts AST + declaration text
  → DtsTypeMeta 树 + ParameterReflection[]     ← bundle 持久化 SSOT
  → signatureText（可选，生成期写入，读侧可校验）  ← guide 展示
  → paramsSchema / returnSchema（可选，投影期）   ← FC 校验，可不进 bundle
```

---

## 1. 类型契约（`types.ts`）

### 1.1 扩展 `DtsTypeMeta`（对齐 TypeDoc TypeKindMap 子集）

| TypeDoc `type` | 现状 | 改造 |
|----------------|------|------|
| `intrinsic` | ✅ | 保持 |
| `reference` | ✅ + `sourcePath` | 保持；`name` 用解析后声明名 |
| `array` | ✅ | 保持；`ReadonlyArray<T>` 归一为 `array` |
| `union` / `intersection` | ✅ | union **不得**静默删 `undefined` |
| `literal` | ✅ | 保持 |
| `optional` | ❌ | **新增** `{ type: 'optional', elementType }` 表示 `T \| undefined` |
| `rest` | ❌ | **新增** `{ type: 'rest', elementType }` 表示 `...T[]` |
| `tuple` | ❌（→ unknown） | **新增** `{ type: 'tuple', elements: DtsTypeMeta[] }` |
| `reflection` | ❌（→ unknown） | **新增** 函数/对象字面量签名（见 §1.2） |
| `unknown` | ✅ fallback | 仅当 TS 无法结构化时使用 |

**规范化规则（生成期）：**

- `T | undefined` → `{ type: 'optional', elementType: T' }`（**不要** filter 后剩单成员 union）。
- `A | B | undefined` → `{ type: 'union', types: [optional?, ...] }` 或顶层 optional；**禁止** `{ union: [A] }`。
- 单成员 union（无 undefined）→ **折叠**为成员本身。
- `void` 在 union 内**保留**（回调 `void | Promise<void>` 需要）。

### 1.2 `reflection` 形状（TypeDoc `ReflectionType` 精简）

```typescript
type DtsReflectionSignature = Readonly<{
  name?: string
  parameters: readonly MethodParameterMeta[]
  type: DtsTypeMeta  // 返回类型；TypeDoc 字段名
}>

type DtsReflectionTypeMeta = Readonly<{
  type: 'reflection'
  declaration: Readonly<{
    signatures: readonly DtsReflectionSignature[]
  }>
}>
```

**用途：** `editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>)` 的 `run` 参数。

### 1.3 `MethodParameterMeta` 对齐 `ParameterReflection`

```typescript
type MethodParameterMeta = Readonly<{
  name: string
  type: DtsTypeMeta
  flags?: Readonly<{ isOptional?: boolean }>  // 对应 ? 与 默认值存在
  defaultValue?: string | number | boolean | null
}>
```

可选性来源：`parameter.questionToken`、`parameter.initializer`、或 `type` 为 `optional`。

### 1.4 `MethodMeta` 命名

| 现状 | TypeDoc 对齐 | 策略 |
|------|--------------|------|
| `type` | `type` | 当前协议只写 `type`，读侧只接受 `type` |
| `parameters` | `parameters` | 保持 |
| `signatureText` | 无（派生） | 保留；增加 `assertSignatureMatchesTypeTree` 校验 |

`ConstructorMeta` 同步：`parameters` + `type: void`（constructor 返回）。

### 1.5 schemaVersion

- bundle `schemaVersion: 1` 可不变；用 **`dtsTypeMetaVersion: 2`** 或文档级 note 标记新 discriminator。
- `read-dts-class-model-bundle-json.ts`：fail-fast 读取当前字段；缺 `module`、缺 `parameters`、缺 `type` 时直接报错。

---

## 2. 生成（`project-from-declarations.ts`）

### 2.1 重写 `dtsTypeMetaFromTypeNode`

| 节点 | 现状 | 改造 |
|------|------|------|
| `UnionTypeNode` | filter `undefined`/`void` | 见 §1.1 规范化 |
| `FunctionTypeNode` / `ConstructorTypeNode` | → `unknown` | → `reflection` + 单 signature |
| `TupleTypeNode` | → `unknown` | → `tuple` |
| `RestTypeNode`（`...T`） | 未处理 | → `rest` |
| `TypeReferenceNode` Promise | reference | 保持；渲染层可 unwrap |
| `TypeLiteralNode` | → `unknown` | 小对象可 `reflection`；过大仍 unknown |

### 2.2 参数投影 `methodParametersFromDeclaration`

- 读 `parameter.questionToken` → `flags.isOptional`
- 读 `parameter.initializer` → `defaultValue`（literal 化）
- 参数 type 走新 `dtsTypeMetaFromTypeNode`

### 2.3 删除 union 上的 `isUndefinedLikeTypeNode` filter

```typescript
// 删除或仅限 JSON Schema 路径（dts-type-schema.ts），
// DtsTypeMeta 路径改用 optional 包装。
```

同步修改 [`dts-type-schema.ts`](../class-model/dts-type-schema.ts)：`typeNodeToJsonSchema` 与 `DtsTypeMeta` **语义一致**（optional 映射 `type: [T, 'null']` 或 omit 策略文档化）。

### 2.4 `signatureText` 生成策略

- **Phase A**：继续 `member.getText(sourceFile)` 写入。
- **Phase B**：由 `renderMethodSignature(document, method)` 从 type 树生成；与 AST 文本 diff 仅 warn（CI golden）。

---

## 3. 渲染（`signature-renderer.ts`）

扩展 `renderDtsTypeMeta`：

| discriminator | 渲染 |
|---------------|------|
| `optional` | `${render(element)} \| undefined` 或 `${render(element)}?`（参数位用 `?`） |
| `rest` | `...${render(element)}` |
| `tuple` | `[${elements.join(', ')}]` |
| `reflection` | `(params): return` 或 `({ props })` |

**优先级调整：**

```typescript
// methodGuide / renderMethodSignature
// 1. 若 parameters + type 完整 → 从 type 树渲染
// 2. 否则 fallback signatureText
```

---

## 4. Bundle 读写

### 4.1 `build-dts-class-model-bundle.ts` · `compactMethodMetaForBundle`

- 持久化：`parameters`（含 flags）、`type`
- **不再**依赖 bundle 外 params/return 字符串字段做 ref 闭包

### 4.2 `read-dts-class-model-bundle-json.ts` · `parseDtsTypeMeta`

新增分支：`optional` | `rest` | `tuple` | `reflection`。

`parseMethodParameterMeta`：读 `flags`、`defaultValue`。

`parseMethodMeta`：读 `type` 字段；缺失时 fail-fast。

### 4.3 `dts-class-model-bundle-loader.ts` · `collectFromDtsType`

递归新 discriminator：

- `optional` / `rest` → elementType
- `tuple` → elements
- `reflection` → signatures[].parameters[].type + signature.type

**移除**对返回类型字符串字段的闭包依赖。

---

## 5. 知识层（`class-model-knowledge-service.ts`）

- `methodGuide`：签名行从 type 树渲染；JSDoc `@param` 保留。
- `collectDtsTypeRefs`：支持 `reflection` 内 `DataSetCrudTool` 等 reference 的 `sourcePath` 闭包。
- **mutator 子模型发现**：从 `parameters[name=run].type.reflection.signatures[0].parameters[0]` 取回调首参 type → 挂 linked kind。

---

## 6. 测试与验收

### 6.1 Golden 用例（必须）

| 用例 | 输入签名 | 期望 `parameters` / `type` |
|------|----------|------------------------------|
| `business-registry` · `get` | `(): T \| undefined` | `type: { optional, elementType: reference(T) }` |
| `business-registry` · `list` | `(): ReadonlyArray<T>` | `type: { array, elementType: reference(T) }` |
| `config-page` · `editDataSet` | `run: (tool: DataSetCrudTool) => void \| Promise<void>` | `run.type: reflection`; 首参 `reference(DataSetCrudTool)` + sourcePath |
| `config-page` · `editDataSet` 返回 | `Promise<void>` | `type: reference(Promise)<void>` 或渲染为 `Promise<void>` |
| rest 参数 | `(...args: string[])` | 末参 `{ rest, elementType: array<string> }` |

### 6.2 回归

- `read-dts-class-model-bundle-json.test.ts`：更新 `AiAgentRegistry.register/get` 断言。
- `reflection-connectivity` / semantic-gaps：mutator 边从 reflection 可达。
- 全量 `pnpm --filter @spark-appworks/spark-ai test:run`。

### 6.3 生成物

- 重跑 dts-class-model bundle 生成；`semantic-gaps.json` gapCount 仍为 0。
- spot-check：`business-registry.ts.json`、`config-page.ts.json`。

---

## 7. 实施顺序（建议 PR 切分）

```text
PR-1  types.ts + parseDtsTypeMeta + renderDtsTypeMeta（当前 discriminator）  ← 已完成
PR-2  project-from-declarations（生成 reflection/optional/tuple/rest；去 union filter）  ← 已完成
PR-3  bundle-loader ref 闭包 + knowledge methodGuide 改 SSOT  ← 已完成
PR-4  全量 regen generated/dts-class-model + golden 测试  ← 已完成
PR-5  MethodMeta.type 定稿；signatureText 改派生  ← 已完成
```

---

## 8. 文件索引

| 文件 | 改动 |
|------|------|
| [`class-model/types.ts`](../class-model/types.ts) | DtsTypeMeta / Parameter / Method 契约 |
| [`class-model/project-from-declarations.ts`](../class-model/project-from-declarations.ts) | AST → DtsTypeMeta |
| [`class-model/dts-type-schema.ts`](../class-model/dts-type-schema.ts) | 与 optional 语义对齐 |
| [`class-model/signature-renderer.ts`](../class-model/signature-renderer.ts) | 渲染新 discriminator |
| [`class-model/build-dts-class-model-bundle.ts`](../class-model/build-dts-class-model-bundle.ts) | 落盘字段 |
| [`class-model/read-dts-class-model-bundle-json.ts`](../class-model/read-dts-class-model-bundle-json.ts) | 解析 |
| [`class-model/dts-class-model-bundle-loader.ts`](../class-model/dts-class-model-bundle-loader.ts) | ref 闭包 |
| [`knowledge/class-model-knowledge-service.ts`](../knowledge/class-model-knowledge-service.ts) | guide + mutator 边 |
| [`tests/read-dts-class-model-bundle-json.test.ts`](../tests/read-dts-class-model-bundle-json.test.ts) | golden |

---

## 9. 与 native-runtime 边界

- **DtsTypeDeclarationModel 线**：`.d.ts` → TypeDoc 式 type 树 → methodGuide；mutator 回调首参从 `reflection` 解析。
- **Runtime metadata 线**：运行时执行元数据继续承载 `resultApis`；通过 **同一 .d.ts 声明** 保持语义一致，不要求 JSON 字段同名。
- **native-runtime**：继续消费 runtime `paramsSchema` / Proxy；DtsTypeDeclarationModel 改造**不阻塞** script 执行。

---

## 10. 参考：TypeDoc 对照表

| TypeDoc | SPARK 字段 |
|---------|------------|
| `SignatureReflection.parameters` | `MethodMeta.parameters` |
| `SignatureReflection.type` | `MethodMeta.type` |
| `ParameterReflection.flags.isOptional` | `parameters[].flags.isOptional` |
| `Type.optional` | `DtsTypeMeta optional` |
| `Type.reflection` | `DtsTypeMeta reflection` |
| `Type.rest` | `DtsTypeMeta rest` |
| `Type.tuple` | `DtsTypeMeta tuple` |

TypeDoc 文档：[SignatureReflection](https://typedoc.org/api/interfaces/JSONOutput.SignatureReflection.html) · [ParameterReflection](https://typedoc.org/api/interfaces/JSONOutput.ParameterReflection.html) · [TypeKindMap](https://typedoc.org/api/interfaces/JSONOutput.TypeKindMap.html)
