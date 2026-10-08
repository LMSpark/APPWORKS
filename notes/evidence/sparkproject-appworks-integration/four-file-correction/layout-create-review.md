# 缺失布局首次创建主控验收

状态：限定本地闭环通过；完整设计页继续 implementing。

## 验收结论

主控核实际宿主与脚本链、正式查询投影指纹、行为测试和日志。创建只接受明确缺失文件，完整正式模型/关系构图，预览取消零写，确认前重新读取正式数据和文件，调用独立 createDataSpaceLayout，成功后完整重载。关系条件以正式完整过滤表达式保留，图文件只保存 ID、端点和几何，没有退化成字段映射或另一份关系真源。

主控退回补齐了真实重开：原 Renderer 测试只有卸载，现在从实际保存原文建立新 PageRuntime/Renderer，核节点坐标及不二次创建；另补上传已确认而后续正式读取失败的提示与禁止重复创建。没有将旧 context 拒绝回调等同于跨 Renderer 在途状态保留。

## 当前证据

- 五套合并测试：layout-create-final-tests.log，202/202，11:07:21 开始，exit 0。
- 此后仅补测试，未改生产：layout-create-reopen-postwrite-smoke.log，真实重开及写后读失败 2/2，11:08:53 开始，exit 0；不把两批直接相加当最终全量测试数。
- 最后根 typecheck exit 0：layout-create-final-typecheck.log。九文件精确 lint 及最后测试文件 lint 均 exit 0，命令范围见 layout-create-result.md；空 lint 日志不等于日志中包含命令本身，退出码来自执行者冻结回报。
- 主控独立 pages-config 和 AI 门禁 exit 0（1002 文件）：layout-create-root-pages.log、layout-create-root-ai-codegen.log。
- 保留首次红例、类型失败与拓扑期望修正日志。JSDOM 的 requestSubmit 未实现提示不冒充浏览器验证。

## 未完成边界

- PageRuntime 目前不持有布局草稿/在途/未知状态，关闭、刷新及重挂载保护待 layout-lifetime-review.md 接续；当前局部通过不表示整图/整页安全交付。
- 后端缺失检查与写入非原子，isReplace=false 仍可能产生副文件或存在竞争窗口；不承诺 CAS，不自动删除。
- 无新部署或在线写入，没有浏览器持久化验收。开工清单只有 SHA-256，未保留字节预像；已纠正报告，不能据此宣称可按文件恢复。
