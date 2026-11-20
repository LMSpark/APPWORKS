# @spark-appworks/spark-json-document API 文档

> 通用 JSON 文档编辑与 JSON Schema 工具包

## 安装

```bash
pnpm add @spark-appworks/spark-json-document
```

## 导入入口

| 入口 | 用途 |
|---|---|
| `@spark-appworks/spark-json-document` | 主入口，导出所有公共符号 |
| `@spark-appworks/spark-json-document/schema` | 仅 Schema 子域（类型/构造器/校验器/解析/withMeta） |
| `@spark-appworks/spark-json-document/tree` | 仅树编辑子域（类型/构建/变更/平铺/策略） |

---

## 1. Core — JSON 基础类型与工具

### 1.1 类型

#### `JsonValue`

```ts
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
```

JSON 可序列化的递归值类型。不含 `function`、`undefined`、`symbol`、`bigint` 等运行时形态。

#### `JsonObject`

```ts
type JsonObject = { [key: string]: JsonValue }
```

JSON 对象：键值对映射。

#### `JsonDocument`

```ts
type JsonDocument = JsonObject | JsonValue[]
```

文档顶层：仅允许对象或数组。

#### `JsonParams`

```ts
type JsonParams = Readonly<Record<string, JsonValue>>
```

函数/业务参数对象的运行时宽形态。

#### `JsonParamShape<TShape>`

```ts
type JsonParamShape<TShape extends object> = Readonly<TShape>
```

参数对象的具名字段形态。与 `JsonParams` 不同，本类型不引入 `string` 索引签名，`keyof` 保留字段级约束。

```ts
// 用法：具体业务输入类型
type PageDesignInput = JsonParamShape<{
  pageId: string
  description: string
  mode: 'create' | 'edit'
}>
```

#### `JsonPath`

```ts
type JsonPath = Array<string | number>
```

JSONPath 路径段数组。`string` 表示对象键，`number` 表示数组索引。

---

### 1.2 运行时守卫

#### `isRecord(value)`

```ts
function isRecord(value: unknown): value is Record<string, unknown>
```

判断值是否为普通对象（非 null、非数组）。从 `@spark-appworks/spark-utils` 重新导出。

#### `isJsonObject(value)`

```ts
function isJsonObject(value: unknown): value is JsonObject
```

判断值是否为 `JsonObject`。内部委托 `isRecord`。

#### `asJsonValue(value)`

```ts
function asJsonValue(value: unknown): JsonValue | null
```

将未知值安全收窄为 `JsonValue`；不符合时返回 `null`。递归检查数组和对象的每一层。

#### `toPrimitive(value)`

```ts
function toPrimitive(value: JsonValue): string | number | boolean | null
```

已知非容器值收窄为原始类型。对容器值（对象/数组）返回 `null`。

---

### 1.3 路径操作

#### `formatJsonPath(path)`

```ts
function formatJsonPath(path: JsonPath): string
```

将路径段数组格式化为 JSONPath 风格字符串。

| 输入 | 输出 |
|---|---|
| `[]` | `'$'` |
| `['foo']` | `'$.foo'` |
| `['items', 0]` | `'$.items[0]'` |
| `['a', 'key with spaces']` | `'$.a["key with spaces"]'` |

#### `getValueAtJsonPath(root, path)`

```ts
function getValueAtJsonPath(root: JsonDocument, path: JsonPath): JsonValue
```

从 JSON 文档中读取指定路径的值。路径不存在或类型不匹配时抛异常。

---

### 1.4 解析与序列化

#### `parseJsonDocument(rawText)`

```ts
function parseJsonDocument(rawText: string): JsonDocument
```

解析 JSON 字符串为 `JsonDocument`。顶层仅允许对象或数组。

#### `serializeJsonDocument(value)`

```ts
function serializeJsonDocument(value: JsonDocument): string
```

将 `JsonDocument` 序列化为格式化 JSON 字符串（2 空格缩进 + 尾换行）。

#### `normalizeJsonDocument(value)`

```ts
function normalizeJsonDocument(value: unknown): JsonDocument
```

归一化任意值为 `JsonDocument`。非对象/数组时抛异常。

---

### 1.5 JSON 值规整

#### `coerceJsonValue(value)`

```ts
function coerceJsonValue(value: unknown): JsonValue | undefined
```

尽力转换（lossy）任意运行时值为 JSON 安全值：

| 输入类型 | 处理 |
|---|---|
| `string`/`number`/`boolean`/`null` | 原样返回 |
| `undefined` | 返回 `undefined`（跳过） |
| `NaN`/`Infinity` | 返回 `undefined`（跳过） |
| `bigint` | 转为字符串 |
| `symbol` | 转为字符串 |
| `Date` | 转为 ISO 字符串（无效日期返回 `undefined`） |
| `URL` | 转为字符串 |
| `ArrayBuffer`/`TypedArray` | 转为 `number[]` |
| `Set` | 转为数组 |
| `Map` | 转为对象 |
| 循环引用 | 返回 `undefined`（跳过） |

#### `coerceStrictJsonValue(value)`

```ts
function coerceStrictJsonValue(value: unknown): JsonValue | undefined
```

严格转换：遇到 `NaN`/`Infinity`/`bigint`/`symbol`/循环引用/无效 Date 时直接返回 `undefined`，不做静默转换。

---

## 2. Schema — JSON Schema 类型、构造与校验

### 2.1 类型

#### `JsonSchemaType`

```ts
type JsonSchemaType = 'null' | 'boolean' | 'object' | 'array' | 'number' | 'integer' | 'string'
```

JSON Schema `type` 字段允许的类型字符串。支持联合类型数组如 `['string', 'null']`。

#### `JsonSchema`

```ts
type JsonSchema = boolean | JsonSchemaObject
```

Schema 节点：`true` = 接受任意值，`false` = 拒绝任何值，`JsonSchemaObject` = 完整约束。

#### `JsonSchemaObject`

```ts
type JsonSchemaObject = {
  readonly [keyword: string]: unknown

  // 引用
  readonly $ref?: string

  // 类型元数据
  readonly type?: JsonSchemaType | readonly JsonSchemaType[]
  readonly title?: string
  readonly description?: string

  // 对象约束
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: readonly string[]
  readonly additionalProperties?: JsonSchema

  // 数组约束
  readonly items?: JsonSchema
  readonly prefixItems?: readonly JsonSchema[]

  // 枚举与常量
  readonly enum?: ReadonlyArray<string | number | boolean | null>
  readonly const?: string | number | boolean | null

  // 默认值与示例
  readonly default?: unknown
  readonly examples?: readonly unknown[]

  // 组合 schema
  readonly oneOf?: readonly JsonSchema[]
  readonly anyOf?: readonly JsonSchema[]
  readonly allOf?: readonly JsonSchema[]
  readonly not?: JsonSchema

  // 字符串校验
  readonly maxLength?: number
  readonly minLength?: number
  readonly pattern?: string
  readonly format?: string

  // 数字校验
  readonly minimum?: number
  readonly maximum?: number
}
```

标准 JSON Schema Draft 2020-12 常用子集。索引签名 `[keyword: string]: unknown` 保留对标准扩展关键字（如 `$defs`）的兼容。

> **注意**：因 `noPropertyAccessFromIndexSignature`，在 TypeScript 严格模式下访问非显式声明的字段需用方括号语法：`schema['$defs']`、`schema['properties']`。

#### `JsonSchemaInfo`

```ts
type JsonSchemaInfo = {
  title: string
  description: string
  required: boolean
  enumValues: string[]
}
```

`resolveSchemaInfoForPath` 返回的路径元信息。

---

### 2.2 Schema 构造器

所有构造器返回 `JsonSchemaObject`，纯工厂函数，无副作用。

#### `anySchema(description?)`

```ts
function anySchema(description?: string): JsonSchemaObject
```

无类型约束的 schema，仅带可选描述。

#### `stringSchema(description, options?)`

```ts
type StringSchemaOptions = Readonly<{ nullable?: boolean; minLength?: number }>

function stringSchema(description: string, options?: StringSchemaOptions): JsonSchemaObject
```

字符串 schema。`nullable: true` 生成 `type: ['string', 'null']`。

#### `numberSchema(description, options?)`

```ts
type NumberSchemaOptions = Readonly<{ nullable?: boolean }>

function numberSchema(description: string, options?: NumberSchemaOptions): JsonSchemaObject
```

数字 schema。

#### `booleanSchema(description, options?)`

```ts
type BooleanSchemaOptions = Readonly<{ nullable?: boolean }>

function booleanSchema(description: string, options?: BooleanSchemaOptions): JsonSchemaObject
```

布尔 schema。

#### `enumSchema(values, description, options?)`

```ts
type EnumSchemaOptions = Readonly<{ type?: 'string' | 'number'; nullable?: boolean }>

function enumSchema(
  values: ReadonlyArray<string | number | boolean | null>,
  description: string,
  options?: EnumSchemaOptions,
): JsonSchemaObject
```

枚举 schema。自动推断 type：值中含 `number` 则为 `'number'`，否则为 `'string'`。

#### `arraySchema(items?, description?)`

```ts
function arraySchema(items?: JsonSchema, description?: string): JsonSchemaObject
```

数组 schema。`items` 默认为 `anySchema()`。

#### `objectSchema(properties?, options?)`

```ts
type ObjectSchemaOptions = Readonly<{
  required?: readonly string[]
  description?: string
  additionalProperties?: JsonSchema
}>

function objectSchema(
  properties?: Readonly<Record<string, JsonSchema>>,
  options?: ObjectSchemaOptions,
): JsonSchemaObject
```

对象 schema。`additionalProperties: false` 禁止额外属性。

#### `paramsSchema(properties?, required?, description?)`

```ts
function paramsSchema(
  properties?: Readonly<Record<string, JsonSchema>>,
  required?: readonly string[],
  description?: string,
): JsonSchemaObject
```

函数参数根 schema。等价于 `objectSchema(properties, { required, description })`，但返回类型明确为 `JsonSchemaObject`。

#### `noParamsSchema(description?)`

```ts
function noParamsSchema(description?: string): JsonSchemaObject
```

无参数函数的 schema。`additionalProperties: false` 告诉 LLM 不要传任何参数。

---

### 2.3 校验器

#### `JsonSchemaValidator`

```ts
class JsonSchemaValidator {
  private constructor()

  static validateDeserializedParams(params: unknown, schema: unknown): JsonValidationResult
  static validateJsonValue(value: unknown, schema: JsonSchema): JsonValidationResult
  static formatJsonValidationIssues(issues: readonly JsonValidationIssue[], maxCount?: number): string
}
```

基于 AJV 2020 的 JSON Schema 校验器。全 static 方法，无实例状态。

**校验流程**（`validateDeserializedParams`）：

1. `params` 必须是普通 JSON 对象（非 null/非数组）
2. `schema` 根必须是 `type: 'object'` 的标准 JSON Schema
3. AJV 编译并校验
4. 收集所有错误（`allErrors: true`）
5. 失败时通过 `formatJsonValidationIssues` 生成中文诊断

#### `JsonValidationIssue`

```ts
type JsonValidationIssue = {
  path: string    // 如 "$.items[0].name"
  message: string // 中文诊断消息
}
```

#### `JsonValidationResult`

```ts
type JsonValidationResult = Readonly<{
  ok: boolean
  issues: readonly JsonValidationIssue[]
}>
```

**中文诊断映射**：

| AJV keyword | 中文消息 |
|---|---|
| `required` | 缺少必填字段 |
| `additionalProperties` | 未声明的字段 |
| `type` (array) | 应为数组 |
| `type` (object) | 应为对象 |
| `type` (string) | 应为字符串 |
| `type` (number/integer) | 应为数字 |
| `type` (boolean) | 应为布尔值 |
| `enum` | 必须是以下枚举之一: ... |
| `const` | 必须等于 ... |
| `maxLength` | 长度不能超过 N |
| `minLength` | 长度不能少于 N |
| `minimum` | 数值不能小于 N |
| `maximum` | 数值不能大于 N |

---

### 2.4 Schema 路径解析

#### `resolveSchemaInfoForPath(schema, path)`

```ts
function resolveSchemaInfoForPath(
  schema: Record<string, unknown> | null | undefined,
  path: JsonPath,
): JsonSchemaInfo
```

在 JSON Schema 中解析指定路径的元信息。支持：

- `$ref` 解析（`#/$defs/` 前缀）
- `oneOf` 分支选择（按段类型匹配候选分支）
- `items` / `properties` / `additionalProperties` 导航
- `required` 列表检查（检查路径最后一段是否在父节点的 `required` 中）

---

### 2.5 元数据注解

#### `withMeta(title, description, schema)`

```ts
function withMeta<T extends Record<string, unknown>>(
  title: string,
  description: string,
  schema: T,
): T & { title: string; description: string }
```

为 JSON Schema 节点合并 `title` 和 `description`。`title` 和 `description` 放在展开属性之前，确保不会被 `schema` 中的同名字段覆盖。

```ts
const nodeSchema = withMeta('组件节点', 'SparkNode 结构定义', {
  type: 'object',
  properties: { type: { type: 'string' } },
})
// → { title: '组件节点', description: 'SparkNode 结构定义', type: 'object', properties: { ... } }
```

---

## 3. Tree — UUID 稳定树编辑引擎

### 3.1 核心类型

#### `JsonNodeType`

```ts
type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
```

#### `TreeNode`

```ts
type TreeNode = {
  readonly id: string              // 节点 UUID（12 字符 hex）
  readonly parentId: string | null // 父节点 ID；根节点为 null
  readonly segment: string | number // 对象键或数组索引
  readonly type: JsonNodeType
  readonly value: string | number | boolean | null // 叶子值；容器节点为 null
  readonly order: number           // 同级排序权重
}
```

纯数据模型，6 字段，无行为。UUID 基于 `crypto.randomUUID()` 生成。

#### `TreeModel`

```ts
type TreeModel = ReadonlyMap<string, TreeNode>
```

内部树模型：以 UUID 为键的只读 Map。所有 mutation 返回新的 `Map` 实例。

#### `TreeDisplayNode`

```ts
type TreeDisplayNode = TreeNode & {
  readonly depth: number        // 嵌套深度（根 = 0）
  readonly path: JsonPath       // 从根到此节点的路径
  readonly childCount: number   // 直接子节点数量
  readonly keyEditable: boolean
  readonly typeEditable: boolean
  readonly deletable: boolean
}
```

`toDisplayRows` 输出的显示行，附加策略派生的 UI 元数据。

#### `MutationResult`

```ts
type MutationResult = {
  readonly model: TreeModel        // 变更后的新树模型
  readonly focusId: string         // 操作后应聚焦的节点 ID
  readonly expandId: string | null // 操作后应展开的节点 ID
}
```

所有 mutation 函数的返回类型。

#### `FlatJsonTreeDocument`

```ts
type FlatJsonTreeDocument = {
  readonly rootType: 'object' | 'array'
  readonly rows: TreeNode[]
}
```

平铺文档格式，用于编辑态序列化。

---

### 3.2 策略注入

#### `JsonTreePolicy`

```ts
type JsonTreePolicy = {
  rootLabel?: string                                       // 默认: '$'
  isProtected?(path: JsonPath): boolean                    // 默认: () => false
  canEditKey?(path: JsonPath): boolean                     // 默认: 对象属性可改，数组索引不可改
  canEditType?(path: JsonPath): boolean                    // 默认: 除根节点外均可
  suggestChildKey?(target: JsonObject, parentPath: JsonPath): string // 默认: ensureUniqueObjectKey(target, 'newKey')
  createDefaultArrayItem?(parentPath: JsonPath): JsonValue // 默认: () => ''
  createDefaultObjectValue?(parentPath: JsonPath, key: string): JsonValue // 默认: () => ''
  getValueOptions?(path: JsonPath): string[] | undefined   // 默认: () => undefined
  getValueLabels?(path: JsonPath): Array<{ label: string; value: string }> | undefined // 默认: () => undefined
  getAutoPopulate?(changedPath: JsonPath, newValue: JsonValue): AutoPopulateEntry[] | undefined // 默认: () => undefined
}
```

策略注入接口：所有方法可选，缺省使用默认实现。领域特化逻辑（如 SPARK 规则树的保护字段、默认值建议）通过实现此接口注入。

**下拉选项优先级**：`getValueLabels` > Schema `enum` > `getValueOptions`

#### `AutoPopulateEntry`

```ts
type AutoPopulateEntry = {
  targetPath: JsonPath
  entries: Record<string, JsonValue>
}
```

值变更后需要自动填充到文档的补丁。对已有键不覆盖（除非新旧值都是对象则递归一层补缺）。

---

### 3.3 构建、导出与显示

#### `buildTreeModel(doc, policy?)`

```ts
function buildTreeModel(doc: JsonDocument, policy?: Partial<JsonTreePolicy>): TreeModel
```

从 JSON 文档构建内部树模型。每个节点分配稳定 UUID。

#### `exportJsonDocument(model)`

```ts
function exportJsonDocument(model: TreeModel): JsonDocument
```

从 `TreeModel` 重建 JSON 文档。根节点必须是对象或数组。

#### `toDisplayRows(model, policy?)`

```ts
function toDisplayRows(model: TreeModel, policy?: Partial<JsonTreePolicy>): TreeDisplayNode[]
```

将 `TreeModel` 展开为深度优先的显示行数组。每行附加策略派生的 UI 元数据。

#### `buildJsonTreeRows(doc, policy?)`

```ts
function buildJsonTreeRows(doc: JsonDocument, policy?: Partial<JsonTreePolicy>): TreeDisplayNode[]
```

便捷入口：`toDisplayRows(buildTreeModel(doc, policy), policy)`。

#### `filterTreeNodes(rows, predicate)`

```ts
function filterTreeNodes<T extends Pick<TreeNode, 'id' | 'parentId'>>(
  rows: T[],
  predicate: (row: T) => boolean,
): T[]
```

过滤行，保留命中行及其所有祖先。用于关键词/类型/Schema 过滤。

#### `getNodePath(model, uid)`

```ts
function getNodePath(model: TreeModel, uid: string): JsonPath
```

从根到目标节点重建 `JsonPath`。

#### `rootOf(model)`

```ts
function rootOf(model: TreeModel): string
```

查找根节点 ID（`parentId === null` 的唯一节点）。无根节点时抛异常。

---

### 3.4 变更操作

所有变更操作是**纯函数**：不修改输入 `model`，返回包含新 `Map` 实例的 `MutationResult`。

#### `addChildNode(model, uid, policy?)`

```ts
function addChildNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult
```

在容器节点内添加子项。对数组使用 `createDefaultArrayItem`，对对象使用 `suggestChildKey` + `createDefaultObjectValue`。非容器节点返回 unchanged。

#### `addSiblingNode(model, uid, policy?)`

```ts
function addSiblingNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult
```

在同级后方添加兄弟项。对数组会移位现有兄弟的 order。根节点退化为 `addChildNode`。

#### `deleteNode(model, uid, policy?)`

```ts
function deleteNode(model: TreeModel, uid: string, policy?: Partial<JsonTreePolicy>): MutationResult
```

递归删除子树。根节点和受保护节点不可删除。数组删除后自动重索引。

#### `renameNodeKey(input)`

```ts
type RenameNodeKeyInput = Readonly<{
  model: TreeModel
  uid: string
  nextKeyInput: string
  policy?: Partial<JsonTreePolicy>
}>

function renameNodeKey(input: RenameNodeKeyInput): MutationResult
```

重命名对象键。确保同级唯一性（冲突时追加数字后缀）。非字符串 segment 或不可编辑键返回 unchanged。

#### `updateNodeType(input)`

```ts
type UpdateNodeTypeInput = Readonly<{
  model: TreeModel
  uid: string
  nextType: JsonNodeType
  policy?: Partial<JsonTreePolicy>
}>

function updateNodeType(input: UpdateNodeTypeInput): MutationResult
```

切换节点类型。移除所有子节点，赋予新类型的默认值。

#### `updateNodeValue(model, uid, nextValue)`

```ts
function updateNodeValue(model: TreeModel, uid: string, nextValue: JsonValue): MutationResult
```

直接替换节点值。如果新值是容器，递归重建子树。

#### `applyAutoPopulatePatches(doc, patches)`

```ts
function applyAutoPopulatePatches(doc: JsonDocument, patches: AutoPopulateEntry[]): boolean
```

将自动填充补丁应用到 JSON 文档。返回 `true` 表示有实际变更。

---

### 3.5 平铺往返

#### `flattenJsonDocumentForEdit(doc)`

```ts
function flattenJsonDocumentForEdit(doc: JsonDocument): FlatJsonTreeDocument
```

将 `JsonDocument` 展开为平铺行数组（带 UUID），用于编辑态。顶层条目的 `parentId` 为 `null`。

#### `restoreJsonDocumentFromFlat(flat)`

```ts
function restoreJsonDocumentFromFlat(flat: FlatJsonTreeDocument): JsonDocument
```

从平铺行还原 `JsonDocument`。按 `order` 排序同级子节点。`parentId` 引用缺失节点时抛异常。

#### `restoreJsonDocumentByOriginalType(rows, originalData)`

```ts
function restoreJsonDocumentByOriginalType(rows: TreeNode[], originalData: JsonDocument): JsonDocument
```

便捷入口：按 `originalData` 的类型（对象/数组）还原。

---

### 3.6 工具函数

#### `formatValuePreview(type, value, childCount)`

```ts
function formatValuePreview(type: JsonNodeType, value: JsonValue, childCount: number): string
```

人类可读的值预览：

| type | 示例输出 |
|---|---|
| `'object'` | `"3 个字段"` |
| `'array'` | `"5 项"` |
| `'null'` | `"null"` |
| `'boolean'` | `"true"` / `"false"` |
| `'number'` | `"42"` |
| `'string'` | 原始字符串 |

#### `ensureUniqueObjectKey(target, preferred, currentKey?)`

```ts
function ensureUniqueObjectKey(target: JsonObject, preferred: string, currentKey?: string): string
```

确保键在目标对象中唯一。冲突时追加数字后缀（`newKey1`、`newKey2`…）。`preferred === currentKey` 时直接返回。

---

## 4. 迁移指南

### 旧 `@spark-appworks/spark-ai/json` 已删除

该入口与 `AiJson*` 别名**已彻底删除**，无兼容转发。JSON 类型与校验只从 `@spark-appworks/spark-json-document` 导入正式名（`JsonValue`、`JsonSchema`、`JsonSchemaValidator`、`formatJsonValidationIssues` 等）。

### 从 `spark-project-model/with-meta` 迁移

```diff
- import { withMeta } from './with-meta'
+ import { withMeta } from '@spark-appworks/spark-json-document'
```

---

## 5. 依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| `@spark-appworks/spark-utils` | `workspace:*` | `isRecord` 类型守卫 |
| `ajv` | `^8.18.0` | JSON Schema Draft 2020-12 校验引擎 |
