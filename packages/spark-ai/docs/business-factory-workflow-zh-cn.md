# Agent Workflow Designer

> 本文是 Agent Workflow Designer 的产品层契约。它描述流程、业务节点、ClassModel 绑定、LLM 工作内容、验证和步骤线投影；不描述运行时执行器内部实现。

## 定位

Agent Workflow 是低代码 AI 产品里的流程定义，不是 Chatflow、App factory 或工具注册表。

- Workflow 表达流程级输入、输出、节点图、验证状态、运行状态和最终数据结果。
- 业务节点表达一个 ClassModel model context 下的工作站。
- 步骤线表达上游输出到下游输入、子模型或 workflow output 的投影和分支。
- 运行时如何调度、重试、通用参数校验，属于后续运行时实现。

## 节点类型

发布态 graph 只允许三种节点类型：

| type | 语义 |
|---|---|
| `start` | Workflow 入口边界，承接流程入参并投影到后续节点 |
| `node` | 唯一业务节点，绑定 model context、LLM 工作和验证 action |
| `output` | Workflow 完成边界，收集最终输出并检查上游验证结果 |

不再保留结构性 `tool`、`chatflow`、`workflow`、`condition`、`llm`、`agent`、`code` 节点。Chat、LLM、workflow invocation 和业务步骤都只能作为 `node` 的能力/配置出现。

## 业务节点

业务节点持久结构：

```json
{
  "id": "node.projectPlanning",
  "type": "node",
  "data": {
    "type": "node",
    "title": "Project Planning",
    "model": {
      "rootClassName": "ProjectModel",
      "className": "ProjectModel",
      "contextPath": "$"
    },
    "inputs": {},
    "outputs": {},
    "llm": {
      "task": {},
      "knowledge": {},
      "functionCalling": {
        "mode": "freeWithinModelContext"
      },
      "output": {}
    },
    "validation": {
      "action": {
        "className": "ProjectModel",
        "actionName": "completeProjectPlanning",
        "inputProjection": {},
        "expectedResult": {}
      },
      "status": "draft",
      "issues": []
    },
    "state": {},
    "result": {},
    "capabilities": []
  }
}
```

### `model`

`node.model` 绑定当前节点的 ClassModel model context。

- `rootClassName`：可达模型闭包的入口。
- `className`：当前节点工作的模型 class。
- `contextPath`：当前模型上下文在流程 cargo 中的位置。

`model` 不绑定普通工作 action。普通工作由 LLM 在当前 model context 内自由编排。

### `llm`

`node.llm` 表达节点内部的 LLM 工作内容。

- `task`：目标、业务需求、上下文入参。
- `knowledge`：允许读取的 root/class/actions/attributes。
- `functionCalling`：函数调用模式和约束；默认语义是 `freeWithinModelContext`。
- `output`：结构化中间结果，以及交给 validation 的数据。

LLM 不能直接声明节点完成。节点完成只能通过 `validation.action`。

### `validation`

`node.validation.action` 必须显式绑定验证 action。

- `className`：验证 action 所在模型。
- `actionName`：验证 action 名。
- `inputProjection`：从流程输入、上游节点输出、当前模型属性或 LLM 结果投影到 action 参数。
- `expectedResult`：验收期望。

发布前必须绑定真实 model 和 validation action。设计稿允许占位，但占位 definition 不能发布。

## 步骤线

Edge 是投影和分支载体：

```json
{
  "id": "edge.start.node",
  "source": "start",
  "target": "node.projectPlanning",
  "data": {
    "projection": {
      "sourceRef": "start.outputs",
      "targetRef": "node.projectPlanning.inputs"
    },
    "branch": {
      "label": "default",
      "default": true
    },
    "validation": {}
  }
}
```

- `projection` 只描述 cargo 从哪里来到哪里去。
- `branch` 描述分支条件、标签、优先级和默认路径。
- Edge 不关心 cargo 的具体业务类型；类型由源节点输出、目标节点 model context 和后续运行时参数校验共同决定。

## ClassModel 对接

Designer 不维护手写 registry，也不把 `generated/dts-class-model` 当人工真源。

- 语义真源是 TypeScript 业务 class 和 JSDoc。
- `generated/dts-class-model` 是可查询索引和缓存。
- 设计器读取 DTS ClassModel knowledge provider，展示可用 class、attribute、action、签名和 action guide。
- 节点输出可理解为所选模型属性、action result 或 LLM structured result 的引用。

## 旧结构处理

发布态 definition 必须拒绝以下旧结构：

- `provider`
- `toolName`
- `workflowRef`
- `toolParameters`
- `inputMapping`
- `outputMapping`
- `x_spark.classModel`
- structural `tool` / `chatflow` / `workflow` / `condition` / `llm` / `agent` / `code`

旧设计稿需要迁移到 `start -> node -> output` 后再发布。
