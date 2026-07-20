# 工作流连线线型支持研读

## 需求

工作流设计器的节点连线支持常规流程图线型，包括正交、直连、曲线等。

## 涉及文件及职责

- `src/views/app/WorkflowDesigns.vue`
  - 工作流可视化编辑入口。
  - 使用 Vue Flow 渲染节点和连线，并处理连线创建、选择、端点更新和属性编辑。
  - 当前 `connection-line-type` 固定为 `ConnectionLineType.SmoothStep`，默认边选项也统一控制所有已有连线的渲染。
- `src/services/workflow-designs.ts`
  - 定义 `WorkflowDesignGraphLine`、设计稿读写、连线增删改及 definition 投影。
  - 连线已有可选 `type?: string` 字段；新建连线当前写入 `type: 'custom'`，尚未形成受约束的视觉线型协议。
- `tests/services/workflow-designs.test.ts`
  - 覆盖连线创建、更新、删除、图收集和 definition 投影。
- `tests/views/workflow-designs.test.ts`
  - 覆盖 Vue Flow 连线选择、属性编辑、端点重连和保存行为。

## 调用链与数据流

1. 后端读取 `design.json`，得到 `WorkflowDesignDocument.workflow.graph.lines`。
2. 页面通过 `flowConnectionsForGraph` 将设计态连线映射为 Vue Flow edges。
3. Vue Flow 使用页面提供的连接线类型和默认边选项渲染新建预览线及已有连线。
4. 新建连线调用 `addWorkflowDesignLine`；端点拖拽或属性编辑调用 `updateWorkflowDesignLine`。
5. 页面标记设计稿 dirty，保存时将同一个 `WorkflowDesignGraphLine` 写回 `design.json`。
6. 发布时 `createAgentWorkflowDefinitionFromDesign` 将设计图连线投影到 `definition.json`。

## 已识别约束

- 当前所有节点只有顶部 target、底部 source 两个 Handle；线型支持可先复用现有端口，不必同时改变端口模型。
- 线型应是显示属性，不应改变节点执行顺序、端点语义或工作流运行逻辑。
- 旧设计稿可能没有线型字段，必须定义兼容默认值。
- 当前 `type: 'custom'` 可能是历史/业务类型值，不能在未确认语义前直接覆盖为 Vue Flow 的边类型枚举。
- 页面同时渲染主图及循环/迭代子图，线型能力应在所有图层一致生效。
- 保存、重新打开、端点重连后都应保持所选线型。

## 潜在影响面

- 连线属性面板需要提供线型选择入口。
- Vue Flow edge 映射需要按每条连线输出对应渲染类型。
- 新建连线需要明确默认线型。
- 设计稿模型可能需要新增独立显示字段或规范化既有字段。
- 服务层及页面层测试需要覆盖默认值、切换、保存恢复和旧数据兼容。
- 若线型进入 definition 投影，还会扩大运行契约影响；当前建议只作为设计态显示元数据。

## 复杂度分级

中等：预计涉及页面、设计稿连线模型和两处测试，存在明确调用方，但不涉及导航、数据资源或平台元数据。

