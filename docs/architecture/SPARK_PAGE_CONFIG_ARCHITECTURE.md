# spark-project-model 架构

本包承载项目设计、工具、场景文件和调用生命周期，不引入 Vue、Vue Router、Element Plus 或应用 service。主合同是 [MODEL-HIERARCHY.md](../../packages/spark-project-model/src/MODEL-HIERARCHY.md)，目录边界见 [STRUCTURE.md](../../packages/spark-project-model/src/STRUCTURE.md)。

## owner 分层

```text
ProjectWorkspace
 ├─ ProjectBlueprint
 │   ├─ ProjectBlueprintDesign: 节点索引 + 工具索引
 │   └─ ProjectSession: 选中、草稿、dirty
 └─ ScenarioViewFile: 单场景视图配置、基线、历史
PageTool: rule / script / style
PageRuntime: 一次工具调用 + 多个独立场景 DataSet
```

正式节点 DTO 包含 nodeId、parentNodeId、projectId、kind、capability，以及可选 navigation、dataSpace、prototype 和原 source。kind 为 module/page/embedded/service/content；unknown 只保留读入诊断，不能通过正式策划完成。树 children 是投影。

工具 pageId 与节点 nodeId 独立。PageTool 不继承节点，`project.openPageDesign(pageId)` 返回工具。工具只持 rule.json、script.js、style.css：PageRuleFile 管理 SparkNodeTree，两个 PageTextFile 管理文本与历史。toDefinition() 要求工具已加载，输出 pageId/rule/script/css，不含业务数据。

## 场景与调用

ScenarioViewConfig 校验单场景 tables/modelBinding/views/viewCascades；正式模型字段与关系通过平台读入。动态项目的ScenarioViewFile位于`SysForm/<scenarioId>/pagedata.json`，与`<appId>/<pageId>`下工具文件分离。AppWorks系统程序的四个清单场景配置已迁入仓内`config/pages/**/pagedata.json`，不再从远端系统程序目录读取；其他正式业务目标仍使用其原ScenarioViewFile来源。ProjectWorkspace的场景文件方法是底层文件管理能力；数据空间设计页经ScenarioDefinitionResource接入元数据DataSet，目标先由Base_DataSet DataView核实，再经原ProjectWorkspace owner读取，查询、编辑、取消和提交使用DataView/DataSet API。

PageRuntime 构造入口接收 tool 或系统页 pageId（二选一）、scenarioIds、loadScenario，可显式提供 mainScenarioId、instanceId；loadTool 仅用于工具。load() 加载全部声明场景并按需加载工具，拒绝共享 DataSet 和错误身份。工具 materialize() 返回调用内定义并校验视图绑定；系统页没有三文件，读取 tool 或 materialize 明确拒绝。resolveView/getDataSet 只解析本次调用的数据。

页面绑定格式为 `scenarioId@modelName@viewId`，即数据空间 ID、模型名称、视图 ID；正式模型按 modelBinding.modelName 定位，本地模型按自身 tableName 定位，重名拒绝。已有带`#`三段配置仍可读取。局部格式需要明确主场景。dispose 释放本实例所有场景并使旧代次失效；工具 reload 拒绝未保存业务编辑，系统页则须由宿主重新打开完整会话，不能仅重载 DataSet。多个调用不能共享数据、脚本状态或组件 registry。

## IO、版本与保存

宿主提供 ProjectWorkspace 的蓝图、页面文件和引用 gateway；包不拥有服务器 URL 或认证策略。PageContentLoader 只读工具三文件，缓存清理同时使在途读取失效。

工作文件用裸文件名，快照为后端真实 N__filename。列表摘要含 version/fileName/lastModified，没有独立版本表。创建候选编号后必须上传并读回最终字节；编号不表示发布状态。source.VersionId 的 rule/script/style 引用决定运行读取，缺段拒绝。恢复写回工作内容，dirty 目标拒绝覆盖，不修改发布引用。

ScenarioViewFile 保存执行写前原文比较与写后字节回读。无后端 CAS，不声称原子并发保护；保存失败可能已经发生远端写入。

## 公共消费

```ts
import { ProjectBlueprint, ProjectWorkspace, PageTool, PageRuntime,
  PageContentLoader, ScenarioViewFile, ScenarioViewConfig }
  from '@spark-appworks/spark-project-model'
```

UI 通过 subscribe/read*Projection 消费项目状态；数据空间定义通过正式元数据DataView消费。blueprintDirty、工具 dirtyFiles、场景 isDirty 和运行业务 isDirty 各有明确归属，不能据此给业务页面另开保存入口。

当前AI pageDesign仍经ProjectWorkspace直接编辑、交付场景文件，这是尚未统一到SPARK data的旧链路；见[工作流现状与差距](../spark-project-skills-to-appworks-ai-workflow-zh.md#现行接线)。它不是新页面或设计器可复用的例外，不能据本文宣称全仓数据操作已统一。

## 验证

```bash
pnpm --filter @spark-appworks/spark-project-model run typecheck
pnpm --filter @spark-appworks/spark-project-model run test:run
```

相关链路见 [DATAFLOW_ARCHITECTURE.md](DATAFLOW_ARCHITECTURE.md)。
