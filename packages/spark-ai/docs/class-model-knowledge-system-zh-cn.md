# ClassModel 知识体系

> 状态：有效（2026-06）。本文是 `packages/spark-ai` 的 ClassModel 知识体系主文档，覆盖生成协议、索引、查询、按需加载、运行时参数检测、Vue/H 函数链和去冗余原则。

## 1. 定位

ClassModel 的目标不是保存一份“声明文件副本”，而是把原生源码语义投影成可查询、可校验、可执行前置阅读的知识索引。

| 层级 | 真源 | 产物或消费 | 说明 |
|------|------|------------|------|
| Authoring SSOT | `packages/*/src/**/*.ts`、`*.vue` | 业务源码、组件 Props、JSDoc | 人维护的唯一业务语义来源 |
| Compiler semantic boundary | TypeScript / Vue declaration emit in memory | 编译器语义树 | 只作为投影输入，不作为生成物命名和查询口径 |
| JSON projection | `generated/dts-class-model/manifest.json`、`files/**/*.json` | shard、`classIndex`、`componentIndex` | 生产读取的薄索引和缓存 |
| Knowledge runtime | loader、knowledge service、tools、native runtime | `model_query`、guide、`model_script` | LLM 和脚本执行前的查询面 |

核心原则：

- JSON 表示层按原生物命名：源文件是 `.ts` 就落 `*.ts.json`，源文件是 `.vue` 就落 `*.vue.json`。
- 编译阶段可以存在内存声明 emit，但它不是用户可见 JSON 的领域概念。
- JSON 只保留消费层需要的数据。没有消费的字段不持久化，旧字段只在 reader 兼容层兜底。
- 索引要像数据库一样查询：manifest 保存全局表和倒排索引，shard 保存局部模型详情。

## 2. 端到端链路

```text
原生 .ts / .vue 源码
  -> TypeScript / Vue 编译语义 in memory
  -> buildDtsClassModelBundle()
  -> generated/dts-class-model/manifest.json
  -> generated/dts-class-model/files/<source-path>.json
  -> DtsClassModelBundleLoader
  -> ClassModelKnowledgeService / DtsBundleClassModelKnowledgeService
  -> ClassModelRuntime 7 工具闭集
  -> model_query / model_*_guide / model_script
```

代码入口：

| 职责 | 文件 |
|------|------|
| 投影协议类型 | `src/class-model/class-model/bundle/dts-bundle-types.ts` |
| 类型模型 | `src/class-model/class-model/types.ts` |
| 编译投影与 bundle 构建 | `src/class-model/class-model/bundle/build-dts-class-model-bundle.ts` |
| 源声明投影 | `src/class-model/class-model/declaration/project-from-declarations.ts` |
| JSON 读取与兼容 | `src/class-model/class-model/bundle/read-dts-class-model-bundle-json.ts` |
| 按需加载与索引查询 | `src/class-model/class-model/bundle/dts-class-model-bundle-loader.ts` |
| 知识查询与 guide 渲染 | `src/class-model/knowledge/class-model-knowledge-service.ts` |
| bundle knowledge provider | `src/class-model/knowledge/dts-bundle-class-model-knowledge-service.ts` |
| tool schema | `src/class-model/tools/class-model-tool-specs.ts` |
| 运行时参数检测 | `src/class-model/runtime/class-model-runtime.ts` |
| 业务注册恢复提示 | `src/agent/business/class-model-agent-adapter.ts` |

## 3. JSON Bundle 结构

### 3.1 manifest

`manifest.json` 是全局目录和索引，不保存完整模型详情。

| 字段 | 角色 | 主要消费 |
|------|------|----------|
| `schemaVersion`、`protocol` | 协议版本 | reader fail-fast |
| `scannedFileCount` | 编译统计 | assert / diagnostics |
| `files` | `sourcePath -> shard file + module meta` | `ensureSourcePath()` |
| `classIndex` | `className -> sourcePath + shard file` | `ensureClassName()`、BFS 子模型链 |
| `componentIndex` | 组件查询表和倒排索引 | 分级查询、按需加载 |
| `duplicates` | 同名模型冲突记录 | assert / diagnostics |

### 3.2 shard

每个 shard 对应一个原生源码入口。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schemaVersion": 3,
  "module": {
    "name": "...",
    "sourcePath": "packages/.../foo.ts",
    "sourceFile": "packages/.../foo.ts",
    "symbols": ["Foo"]
  },
  "$defs": {},
  "models": {
    "Foo": {}
  },
  "generatedAt": "..."
}
```

字段关系：

| 字段 | 含义 | 约束 |
|------|------|------|
| `module` | 文件级语义入口 | 只描述当前 shard 的模块，不等于所有模型集合 |
| `module.symbols` | 当前 shard 导出的模型名 | 必须和 `models` 键集合一致 |
| `$defs` | 共享 JSON Schema 池 | `models.*.jsonSchema` 通过 `$ref` 回指 |
| `models` | `className -> DtsTypeDeclarationModel` | 保存强语义模型的精简 JSON 形态 |
| `generatedAt` | 源文件更新时间快照 | 仅用于增量/诊断，不参与语义查询 |

### 3.3 module 与 models 的关系

`module` 是文件级入口，`models` 是该文件导出的类型声明集合。二者不是父子模型关系。

```text
manifest.files[sourcePath].module
  -> 定位 shard、模块 JSDoc、组件归属、sourceFile

shard.models[className]
  -> 类型声明本体、成员、类型树、组件画像

manifest.classIndex[className]
  -> 反向定位 className 所在 shard
```

查询时的实际路径：

```text
kind = RendererTableProps
  -> manifest.classIndex.RendererTableProps
  -> sourcePath
  -> files[sourcePath].file
  -> shard.models.RendererTableProps
```

## 4. 模型结构

`DtsTypeDeclarationModel` 保存 type-space 语义，当前主要分支是 class、interface、typeAlias、enum。

| 字段 | 保留理由 | 消费层 |
|------|----------|--------|
| `name` | 全局模型主键 | `classIndex`、guide、query |
| `jsdoc` | 模型摘要和语义说明 | guide、semantic gap |
| `declarationKind` | 判别模型分支 | reader、guide |
| `jsonSchema` | 参数/属性 schema 投影 | runtime metadata、schema assert |
| `component` | 可查询组件画像 | componentIndex、model_query |
| `provenance` | 内存和兼容层溯源 | gap/fixHint、旧 bundle 读取 |
| `relations` | 继承、alias、union、intersection | 子模型链、guide 上下文 |
| `members` | constructor、attributes、methods | query includeMembers、guide、runtime |

持久化原则：

- 新 JSON 持久层保留 `component`，不再把 `provenance.component*` 作为主要查询字段。
- reader 可以读旧 `provenance.component*`，但会映射成新的 `component` 画像。
- 成员级 `provenance` 不应作为常态持久字段。除非有明确消费，否则删除。

## 5. 属性类型和子模型链

属性、参数、返回值都要尽量保留结构化类型树，而不是只存字符串。

| 类型入口 | 数据 | 用途 |
|----------|------|------|
| attribute | `schema`、`type`、`writable/readable` | 属性 guide、读写校验、字段级查询 |
| method parameter | `parameters[].type`、`paramsSchema` | action guide、function calling schema |
| method return | `type`、`returnSchema` | resultApis、后续链式调用 |
| constructor | `parameters`、`paramsSchema` | 构造语义、guide |
| relation | `typeText`、`targetName` | alias / extends / union 链 |

子模型链解析不是靠字符串搜索，而是按以下顺序收敛：

```text
rootClassName
  -> ensureClassName(root)
  -> listLinkedClassNames(manifest, model)
     -> constructor signature / params schema
     -> attributes schema
     -> methods signature / parameter type / return type / return schema
  -> manifest.classIndex[targetName]
  -> ensureSourcePath(target.sourcePath)
  -> loadedModels
```

消费结论：

- `typeText` 适合作为可读回退，不应成为唯一关系来源。
- `DtsTypeMeta.reference` 和 JSON Schema `$ref` 是子模型链的优先证据。
- `classIndex` 是跨 shard 子模型加载的唯一全局跳表。

## 6. componentIndex

`componentIndex` 是组件知识体系的数据库式索引。它由 manifest 持有，不需要扫描所有 shard。

```ts
type DtsClassModelBundleComponentIndex = {
  entries: Record<className, DtsClassModelBundleComponentEntry>
  byName: Record<componentName, className[]>
  byType: Record<componentType, className[]>
  byLevel: Record<componentLevel, className[]>
  byLayer: Record<componentLayer, className[]>
  byDirectory: Record<componentDirectory, className[]>
}
```

### 6.1 component entry

| 字段 | 用途 |
|------|------|
| `className` | 模型主键 |
| `sourcePath` | 按需加载 shard |
| `file` | manifest 中的 shard 文件 |
| `component.name` | 精确组件名查询，如 `RendererTable` |
| `component.type` | 渲染类型查询，如 `r-table` |
| `component.level` | 表格级、行级、字段级等分级查询 |
| `component.layer` | 架构分层查询，如 `data-view-container` |
| `component.directory` | 目录域查询，如 `containers/data-views` |

### 6.2 level

| level | 含义 | 典型对象 |
|-------|------|----------|
| `table-level` | 数据视图/列表/表格级组件 | `RendererTableProps`、`RendererListProps` |
| `row-level` | 行上下文/行作用域组件 | `RendererFieldScopeProps` |
| `container` | 布局容器组件 | `RendererSectionProps`、`RendererTabsProps` |
| `field-level` | 字段输入组件 | `FieldTextProps` |
| `display` | 展示组件 | `DisplayTextProps` |
| `infrastructure` | 编辑器、基础支撑、非渲染基础设施 | editor / support 类型 |

### 6.3 layer

| layer | 含义 |
|-------|------|
| `data-view-container` | 数据视图容器 |
| `row-scope` | 行级作用域 |
| `layout-container` | 布局容器 |
| `zone-container` | header/footer/filter 等区域容器 |
| `data-field` | 数据字段 |
| `field-support` | 字段支撑工具 |
| `data-display` | 数据展示 |
| `static-display` | 静态展示 |
| `editor` | 编辑器 |
| `support` | 通用支撑 |

## 7. 查询面

### 7.1 model_query 参数

| 参数 | 含义 | 类型 |
|------|------|------|
| `kind` | 精确模型名 | string |
| `keyword` | 模型名、摘要、成员文本关键词 | string |
| `componentName` | 精确组件名 | string |
| `componentType` | 精确组件 type | string |
| `componentLevel` | 组件层级 | enum |
| `componentLayer` | 组件架构分层 | enum |
| `componentDirectory` | 组件目录 | string |
| `includeMembers` | 返回成员摘要 | boolean |

示例：

```json
{ "componentLevel": "table-level" }
```

```json
{ "componentLevel": "field-level", "includeMembers": true }
```

```json
{ "componentLayer": "row-scope", "includeMembers": true }
```

```json
{ "componentType": "r-table" }
```

### 7.2 查询执行语义

```text
model_query(component*)
  -> DtsBundleClassModelKnowledgeService.query()
  -> loader.ensureComponentQuery()
  -> manifest.componentIndex 倒排命中
  -> ensureSourcePath() 只加载命中的 shard
  -> ClassModelKnowledgeService.query()
  -> 按 component、kind、keyword 二次过滤
```

没有 component 条件时：

```text
model_query(kind/keyword)
  -> ensureReachableClosure(rootClassName)
  -> 只在 root 属性链可达模型中查询
```

有 component 条件时，surface 模式会在已加载模型中按组件画像过滤。bundle provider 会先通过 `componentIndex` 加载命中 shard，因此不会退化为全量扫 shard。

## 8. 消费矩阵

| 消费层 | 使用字段或结构 | 为什么需要 |
|--------|----------------|------------|
| reader | `schemaVersion`、`protocol`、`$defs`、enum whitelist | fail-fast、防止旧协议静默错读 |
| manifest loader | `files`、`classIndex` | `ensureSourcePath()`、`ensureClassName()` |
| 子模型链 | `classIndex`、`DtsTypeMeta.reference`、schema `$ref`、relations | 从 root 找到属性、参数、返回值关联模型 |
| 按需加载 | `componentIndex.entries[].sourcePath` | 组件查询只拉命中 shard |
| 分级查询 | `componentIndex.byLevel`、`byLayer` | 表格级、行级、字段级查询 |
| 组件精确查询 | `byName`、`byType`、`byDirectory` | H 函数链、组件定位、目录域定位 |
| knowledge query | `model.component`、`jsdoc`、members | `model_query` 返回可读目录 |
| class guide | `declarationKind`、members、type tree、relations | 渲染单模型完整契约 |
| attribute guide | attributes、schema/type、readable/writable | 属性读写前置阅读 |
| action guide | methods、parameters、paramsSchema、returnSchema | action 调用前置阅读 |
| runtime 参数检测 | tool schema、runtime whitelist、component enum sets | 拒绝未知参数和非法 component 枚举 |
| model_script | `buildRuntimeApiMetadata()`、paramsSchema、returnSchema | 脚本执行前的 API 元数据 |
| semantic gap | module/model/member JSDoc、provenance/sourceFile | 修复提示和质量门禁 |
| Vue/H 函数链 | component name/type/level/layer/directory + Props model | 从组件域定位 props 契约，不反向写运行时注册表 |

## 9. Vue / H 函数链

早期 Vue 侧按 H 函数链恢复时，ClassModel JSON 的角色是“查询 Props 契约”，不是保存 Vue runtime 注册表。

推荐链路：

```text
componentType = r-table
  -> model_query({ componentType: "r-table", includeMembers: true })
  -> RendererTableProps
  -> model_class_guide({ kind: "RendererTableProps" })
  -> 读取 props、slot-like fields、事件/action 契约
  -> 由业务侧 H/render builder 消费
```

边界：

- `childrenMode`、`hostTypes`、运行时注册表、真实渲染实现仍在组件源码或业务 runtime 中。
- JSON 可以记录 Props 模型和组件画像，但不应把运行时注册细节塞进 shard。
- 如果 H 链需要更多字段，先确认消费点，再把字段上升为 `component` 或模型成员的稳定契约。

## 10. 去冗余规则

保留：

| 数据 | 原因 |
|------|------|
| `module.sourcePath/sourceFile/symbols` | shard 定位和修复提示 |
| `classIndex` | 跨 shard 模型跳转 |
| `componentIndex` | 数据库式组件查询和按需加载 |
| model `component` | query/guide 实际消费 |
| attributes/methods/constructors | guide、runtime、script 都消费 |
| `paramsSchema` | function calling 和 script 校验必须 |
| `returnSchema` | result API 和链式调用 |
| type tree | 子模型链和签名渲染 |
| `$defs` | shard 自包含 schema |

删除或不新增：

| 数据 | 原因 |
|------|------|
| 旧声明式 JSON 文件名 | JSON 表示层必须按原生 `.ts/.vue` 命名 |
| `class-model-emit` 路径进入文件名 | 这是编译内部路径，不是源文件身份 |
| 持久化 `provenance.component*` | 已由 model `component` 和 `componentIndex` 承担 |
| 无消费的 member provenance | 只增加体积和误解 |
| runtime registry 元数据 | 不属于知识索引真源 |
| 可从 type tree 稳定派生的重复签名 | 降低漂移风险 |

判断一个新字段能不能进入 JSON：

1. 列出至少一个真实消费层。
2. 说明是否可由已有字段稳定派生。
3. 说明是否参与索引、校验、guide 或 runtime。
4. 增加 reader 校验和至少一个测试。

## 11. 验证矩阵

常规重建：

```bash
pnpm run generate:class-model-surface
```

完整校验：

```bash
pnpm run verify:class-model:full
```

聚焦校验：

```bash
node scripts/verify-class-model-guide-json-schema.mjs
node scripts/verify-class-model-semantic-gaps.mjs
pnpm exec vitest run packages/spark-ai/src/class-model/tests/read-dts-class-model-bundle-json.test.ts packages/spark-ai/src/class-model/tests/class-model-tool-schema-recovery.test.ts tests/scripts/class-model-bundle-assert.test.ts
pnpm --filter @spark-appworks/spark-ai run typecheck
```

协议改动必须覆盖：

| 改动类型 | 必测点 |
|----------|--------|
| 新 manifest 字段 | reader 校验、缺字段兼容、协议版本 |
| 新 component 分类 | enum whitelist、tool schema、runtime 参数检测 |
| 新索引 | manifest-only 查询、不扫全量 shard |
| 新 model 字段 | writer、reader、guide 或 runtime 消费 |
| 删除字段 | 旧 bundle fallback、生成物 diff、消费层回归 |
| H 函数链字段 | 组件定位、Props guide、运行时不污染 |

## 12. 常见问题

| 现象 | 检查 |
|------|------|
| `model_query({ componentLevel })` 返回空 | manifest 是否有 `componentIndex.byLevel`，组件是否被分类到对应 level |
| `row-level` 查不到 | 当前行级依据 `containers/support/scope/RendererFieldScope.vue` 等明确组件路径分类 |
| component type 异常 | 检查 `SPECIAL_COMPONENT_TYPES` 和 `inferComponentType()` 的优先级 |
| query 参数被拒绝 | 检查 `class-model-tool-specs.ts` 与 `ClassModelRuntime.rejectUnknownArgs()` 是否同步 |
| guide 缺参数 schema | 检查 `paramsSchema` 是否在投影阶段写入，schema assert 是否失败 |
| shard 文件名又出现旧声明式命名 | 检查 emit path 到 source path 的反推逻辑，JSON 文件名必须回到原生源码 |
| JSON 太大 | 先按消费矩阵删除无消费字段，不删 `$defs`、type tree、schema |
