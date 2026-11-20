# AI 生成模型规范（AI_MODEL_SPEC）

> AI 要读写的 **business class** 长什么样。目录、命名、导出见 `../../ai-coding-kit/AGENTS.md`。
>
> **无额外 registry、无自定义标签、无 metadata 第二真源。** 模型 class 与其 `.d.ts` 声明就是 AI 知识真源。

---

## 1. 协议基类

凡 AI 要改数据的 class → **`extends SparkAIModel`**（`packages/spark-utils/src/ai-model.ts`）。

```typescript
export abstract class SparkAIModel {
  constructor(_options: Record<string, unknown>) { void _options }
  abstract toJson(): Record<string, unknown>
}
```

协议**只强制 `toJson`**。这是 **AI 编辑协议**，不是 DDD 领域基类。

---

## 2. 子类

```typescript
export class 某模型 extends SparkAIModel {
  constructor(options: { /* 结构化 object，不用 JSON string */ }) {
    super(options)
  }

  // 公开字段（标量 + 子模型引用）
  title: string
  items: 行模型[]
  leaf: 叶子模型 | null

  toJson(): Record<string, unknown> { /* ... */ }
  // 按需：save()、static load()、static fromJson()、subscribe …
}
```

### 字段

| 类型 | 例子 |
|------|------|
| 标量 | `title`、`parentId`、`dirty` |
| 子模型 | `leaf: 叶子 \| null`、`items: 行[]` — **class 实例**，不是 plain object |

- 树 = **`items[]` + `parentId`**，不用嵌套 `children` 当真源。
- AI / Vue **同一实例**，写字段或调 API；不要 draft、不要 projection DTO。
- 根模型可加过程态（`selectedId`、`dirty`）+ `subscribe`；AI 无事件，靠字段/API 读。

### 禁止

跳过 `SparkAIModel`；每模型一个 interface；IO / UI 进 class；机械多子类；`readXxxProjection()` 第二知识面。

---

## 3. 持久化与序列化（按需）

| 方法 | 何时有 | 规则 |
|------|--------|------|
| `toJson()` | **必有**（协议） | 纯 object；子模型递归 `toJson()`；无 `undefined` key |
| `save()` | 有存储边界时 | 只写**本模型**；IO 在方法体内；可为 `async`；依赖经 **options 传入**，不挂公开字段 |
| `static load()` | 同上 | 恢复本模型；`new 子模型` 挂到字段上；可为 `async` |
| `static fromJson()` | 快照容器 | DataSet、节点树等；可代替 load |

- 快照类可以**只有** `toJson` + `fromJson`，不要 `save`。
- 操作流程写在 **class / 方法 JSDoc**（如 `ConfigPageNode` / `ProjectModel`），不在规范或 SOP 里再抄一份。

---

## 4. 分层与 LLM 知识

```text
AI 运行时  →  读写字段 / 调 API（与 Vue 共实例）
模型 class  →  SparkAIModel + 公开字段 + JSDoc + toJson [+ save/load]
IO          →  save/load 内部（options 传入，AI 不见 client）
UI          →  subscribe，读字段 / 调 API
```

### 知识真源 = 模型 class

| 做什么 | 从哪取 |
|--------|--------|
| **改数据** | 运行时模型实例（public 字段 + 方法） |
| **懂结构** | 同上 class 的 TS 声明 + JSDoc（直接读源码语义） |
| **工具侧重静态索引** | 内存 emit → `generated/dts-class-model/` → Worker 内按 **className** BFS 按需加载 shard |

**没有** 额外 registry、没有约定标签、没有 metadata 第二真源、没有额外 catalog。

### 知识有界

| 有界 | 无边（禁止） |
|------|-------------|
| 当前会话 **root 实例** 上的字段 + API | 整包 dts manifest 全量灌 prompt |
| 实例 **已引用** 的子 model class（根 → 行 → 页配置） | 仓库里所有 export class |
| 各 class **短 JSDoc**（流程、约束） | 规范全文、SOP 副本 |

边界靠 **模型结构设计**：class 少、public 字段少、API 少——三层例子即标准。过大的 `ProjectModel` + projection 会把知识撑爆。

---

## 5. 参考例子（项目域）

```text
ProjectModel（项目根）
  projectId, design, session
  + readProjectPlanningInput / replaceNavigationChildren
  + openPageDesign(pageId) → ConfigPageNode

ConfigPageNode（配置页）
  rule, dataSet, script, style 子模型
  + editNodeTree / editDataSet / writePageFile（内存）
  落盘由 ProjectWorkspace.save* 编排
```

实现：`packages/spark-project-model/src/project/` + `packages/spark-project-model/src/page/`

---

## 6. 参考例子（快照域）

```text
DataSet       toJson + fromJson，无 save（已 extends SparkAIModel）
SparkNodeTree toJson/fromJson，文件持久化在模型外
```

---

## 7. 相关文档

- 代码组织与命名：`../../ai-coding-kit/AGENTS.md`
- dts-class-model 投影（工具索引，非设计中心）：`scripts/generate-dts-class-model.mjs` → `build-dts-class-model-bundle.ts`
- 协议基类：`packages/spark-utils/src/ai-model.ts`
