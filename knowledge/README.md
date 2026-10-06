# 知识库

> AI 编码过程中发现的隐含规则和踩坑记录。
> 本目录是 `ai-coding-kit/` 的补充——规程告诉你"应该怎么做"，知识库告诉你"实际踩过什么坑"。

## 边界

`knowledge/` 属于 AI 编码赋能层，服务于 AI 助手在本项目中更准确地读代码、评估影响面、选择验证命令和避开重复踩坑。

- 这里的条目必须对接本项目真实源码、路径、命令和历史问题
- 这里不是产品架构 SSOT；涉及 Agent Workflow、ClassModel、pageDesign、projectPlanning 等产品事实时，仍以对应源码、模型 class、JSDoc 和产品层文档为准
- 一次性任务记录不写入 `knowledge/`；只沉淀可复用规则、隐含约束和踩坑路径

## 何时读

AI 在阶段 1（深度研读）时，除了读源码，还应根据任务涉及的领域读取对应知识文件：

| 任务涉及的包/目录 | 应读的知识文件 |
|---|---|
| `packages/spark-ai/` | `class-model-system.md`、`packages/spark-ai/docs/business-factory-workflow-zh-cn.md` |
| `packages/spark-project-model/` | `class-model-system.md`、`page-design.md` |
| `packages/spark-component/` | `vue-frontend.md` |
| `packages/spark-data/` | `page-design.md` |
| `packages/spark-utils/` | `monorepo-dependencies.md` |
| `src/`（应用壳） | `vue-frontend.md`、`monorepo-dependencies.md` |
| `packages/spark-lowcode-api/`、`src/lowcode/` | `vue-frontend.md`、`monorepo-dependencies.md` |
| 跨多个包 | `monorepo-dependencies.md` + 上述对应的文件 |

## 何时写

阶段 7（知识沉淀）时写入。判断标准：

**该写的**（满足任一）：
- 读了源码才发现的行为，文档没写，"常规经验"推断不出来
- 框架/API 的隐含约束（调用顺序、参数互斥、边界条件、编译报错但报错信息误导）
- 踩坑后回滚的路径（下次遇到直接跳过）
- 修改传播超出预期（改了 A 结果 B 也坏了）

**不该写的**：
- 从类型签名或已有文档可直接推断的常识
- 只与某次特定业务逻辑相关的一次性决策

## 写入格式

每条知识按此格式写入对应领域文件：

```markdown
### [简短标题]

- **场景**：什么情况下会遇到这个问题
- **规则**：应该怎么做
- **违反后果**：不这么做会怎样
- **发现来源**：哪次任务中发现的（可选，便于追溯）
```

## 文件索引

| 文件 | 领域 | 说明 |
|------|------|------|
| `monorepo-dependencies.md` | 工程结构 | 包间依赖传播、catalog 版本管理、验证命令 |
| `class-model-system.md` | AI/ClassModel | ClassModel 工具链路、知识边界、投影机制 |
| `packages/spark-ai/docs/business-factory-workflow-zh-cn.md` | AI/Agent | Agent Workflow Designer 权威口径：流程、业务节点、ClassModel model context、LLM 工作、验证 action 和步骤线投影 |
| `page-design.md` | 页面设计 | 工具三文件、场景配置、请求与运行实例隔离、保存回执 |
| `vue-frontend.md` | Vue 前端 | 组件开发、状态管理、路由约束 |
| `testing.md` | 测试 | 测试命令、验证套件、异步测试注意事项 |
| `ai-metrics.md` | 效果度量 | AI编码存活率、返工率、记录模板、行业基准 |
