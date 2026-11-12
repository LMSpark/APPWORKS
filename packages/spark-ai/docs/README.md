# spark-ai 文档

## 主文档（优先阅读）

| 文档 | 说明 |
|------|------|
| [`spark-ai-platform.md`](spark-ai-platform.md) | 平台级入口索引：ClassModel、Agent Workflow Designer、传输、runtime、pageDesign 专题跳转 |
| [`business-factory-workflow-zh-cn.md`](business-factory-workflow-zh-cn.md) | **Agent Workflow Designer 权威文件**：流程、业务节点、ClassModel model context、LLM 工作、验证 action 和步骤线投影 |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | 包边界与生成命令（薄版） |

## 专题深潜

| 文档 | 说明 |
|------|------|
| [`transport-and-session-zh-cn.md`](transport-and-session-zh-cn.md) | V4 传输、session-turn / app-sse、ai-turn-bridge 序列与排错 |
| [`class-model-knowledge-system-zh-cn.md`](class-model-knowledge-system-zh-cn.md) | ClassModel 知识体系：SSOT、JSON bundle、componentIndex、消费矩阵、按需加载、参数检测 |
| [`pagedesign-devsystem-zh-cn.md`](pagedesign-devsystem-zh-cn.md) | APP 层 pageDesign × 蓝图 接线与排错 |

## 附录（已并入主文档，保留速查）

| 文档 | 说明 |
|------|------|
| [`native-runtime-and-agent-flow-zh-cn.md`](native-runtime-and-agent-flow-zh-cn.md) | native-runtime 文件索引与排错表 |

**阅读顺序：** `ARCHITECTURE.md` → `spark-ai-platform.md` →（查 ClassModel / JSON / componentIndex）`class-model-knowledge-system-zh-cn.md` →（查 Agent Workflow Designer）**`business-factory-workflow-zh-cn.md`** →（按需）transport / runtime / pagedesign 专题。
