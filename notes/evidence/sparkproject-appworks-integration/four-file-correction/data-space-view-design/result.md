# 数据空间视图配置本地闭环

状态：生产文件冻结，等待主控集中类型、精确 lint、配置门禁和真实浏览器验收。

前像为 manifest.json、supplemental-manifest.json 对应相对路径下的原字节副本；新增服务与测试无前像。当前差异与 SHA-256 见 final-manifest.json，共 17 个文件，未提交或推送。

行为：真实 DOM 选择正式模型、新建 Orders 表绑定、summary/detail 两个命名视图；通过现有 ScenarioViewFile/ProjectWorkspace 写入并重开。正式字段候选随模型切换，迟到读取不覆盖新选择；未应用表单通过 PageLocalDraft 随同 PageRuntime 卸载重挂载恢复并阻止切换，取消清理。基础配置显式 null 清除旧 override；已有其他视图属性保留。视图预览走同一 DataView 请求，visible/masked/hidden 隔离，失败时销毁实例。保存未知由共享 owner 核验远端，写前页面代次检查阻止迟到派发，已派发由 owner 结算。

限定验证日志及退出码：page-ui-targeted.log / .exit-code.txt（3 passed）；view-service-targeted.log（6 passed）；project-owner-targeted.log（86 passed）；sandbox-fixture-targeted.log（25 passed）。均 exit 0。早期红例在工具记录中，最终日志仅记冻结状态。

界限：在线浏览器 UI/真实后端写入由主控独立验收；本地预览测试使用正式查询上下文夹具。数据空间完整多父字段值/选项级联未在本首个视图配置闭环交付。

冻结候选复验：修正三处精确 lint（只读数组类型、owner optional chain、基本属性清除的过滤构造）；旧 readonly DOM 用例只对原六入口做精确作用域断言，保留零写请求和 5→10 正式查询断言。readonly-regression-recheck.log 与 lint-recheck.log 均 exit 0；最终四文件 SHA 已更新 final-manifest.json。
