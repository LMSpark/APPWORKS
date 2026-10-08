# C2 身份合同研读（只读）

用户授权低阶模型执行，主控决策、派工和验收。此任务仅为下一闭环提供源码事实和精确方案，不准修改生产/测试/配置文件，不运行全套门禁、不启动其他代理。

根目录 D:/SPARK_AppWorks；主计划 notes/plan-appworks-control-plane-integration.md 的 C2 是系统页节点身份、URL 恢复、导航、标签和缓存对齐；C1b 有另一个代理写四个加载策略文件，请勿触碰。

## 固定边界

- 当前宿主和 UI；参考 E:/r/sparkproject 固定 commit 842dec4f11b333df904b9a4e26b6566b0802bab8，以 git show 读取，不将工作树当参考。
- 前端，不改后端/schema，保留现有蓝图节点 ID、正式路径和 query/hash 语义，不新增 AI 入口。场景是显式消费，不给 data owner 增加隐式路由读取。
- 先实证，不根据 notes 当产品事实；完整读涉及源文件并反查调用者/测试。AGENTS 和相关 knowledge 适用。

## 主控已发现，需补全方案

1. DynamicRouter.registerRoutesFromNav 用 path 去重，第二个同路径节点被跳过；系统页 meta 缺 nodeId，_navRouteMap 目前无读取消费者。
2. useNavigation 按首个 path 路由导航/高亮，忽略 query/hash 节点选择。useTabPages 非配置页以 route.path 为 id；App.vue 系统页 keep-alive key=route.fullPath，关闭标签未明确释放系统页缓存。
3. lowcode-runtime.vue target 保留 target 的 query/hash，但 record.dataSpace.scenarioId 未投影；cfg 分支已明确。源 SparkDeliveredPageContext 读取授权 navigation 的 nodeId 和 scenarioId；不能复制其静默 catch。
4. 真实元数据管理应用有 7 组同路径；导航权限还有同路径同场景不同节点。文件管理无场景，不能强制每页必须有 scenario。
5. PageRuntimePool 只服务 config 页，有 dirty/版本/实例合同，不应为系统页伪造三文件 PageTool。

## 请输出

在本目录 report.md 写结构化报告：
- 当前确切数据流与文件/行依据；直接消费者/测试/对外 exports 影响面。
- C2a/C2b/C2c 如何拆最小可验证闭环，给精确文件路径（含新文件）；避免裸 helper/class/导出堆积。
- 推荐唯一长期方案：保留 path 的前提下如何表达与刷新恢复 nodeId，已有 URL 唯一/歧义/未授权时如何处理；避免把浏览器 history.state 当可书签事实；节点的场景/动态 query 优先级要有代码依据，无法判定列具体争点。
- 多标签实例隔离和关闭/重开/租户应用切换清理，系统页自身 dirty 能力当前有无；不要在无消费者时构建大型通用框架。
- 对现有 config、public/tenant/platform、ref、iframe 路径零行为变化的验收用例与实际测试命令。
- 尚需主控决策的问题 <=3 项，提出推荐和理由；不可猜默认。

重点完整读取 packages/spark-app/src/router/dynamic.ts、page-runtime-pool.ts、navigation/{runtime-navigation,useNavigation,useTabPages,runtime-target,nav-access}.ts；src/App.vue、src/lowcode/lowcode-runtime.ts；相关测试/路由守卫；参考固定commit的 packages/ui/base/vue/src/navigation/authorized-route-registration.ts 和 delivered-page-context.ts 实际路径通过 git ls-tree/grep 查询。

只写本目录报告，结论紧凑，不复制整源文件；不自行实施，不向用户提问。主控已读大部分主要文件，你聚焦合同遗漏与可执行拆分，不重述泛泛架构。
