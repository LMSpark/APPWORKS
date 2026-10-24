# A4 已知保存过程显示验收

日期：2026-10-24。基线提交 f57f1be19，产品由低价实施者完成，主控复核、门禁与真实烟测。独立复审 R2 PASS，原问题全部解决，无未关闭 P1/P2。

## 修改与边界

普通模型保存由原 ModelEditSession 复用完整身份、查询上下文、行与字段读取权限校验，识别已知 pending/mutating；公共 current/read/write 守卫仍严格。页面不复制身份检查或业务值缓存，已知进行中显示“正在保存模型配置…”。失效身份仍显示原错误；同一 owner 的混合批次恢复指引保留。独立字段新增 saving 显示“正在保存新增字段…”，unknown/readback/different 保持核验警示。

## 本地证据

原真实 pending 反例为 2 失败、2 个 unknown 对照通过。R1 增补行身份、字段读取权限和失效会话反例；最终 owner 全套 26、field-create 全套 49 通过。模型 UI 五项、主控原恢复/权限/锁定三项，以及 R2 混合批次恢复三项分别留证，不将子集重复相加，不声称全设计页测试通过。

R2 六文件冻结哈希与独立复审一致。typecheck、scoped/full lint、完整 verify:rules、build:fe 退出 0；正式 generate:class-model-surface 生成 963 文件，semantic gaps 3110。12 个外围包产物经核仅编译符号数字 ID 变化，未手改。既有 AI 模型 warning 与动态 import 构建提示保留。

原始命令、日志、退出码、冻结哈希与三轮审查在本地 node_modules/.cache/metadata-integration-20261024，主要为 task-a4-save-display-report.md、task-a4-save-display-r2-review.md 和 a4-r2-parent-*。

## 真实服务烟测

T 空间 944DEE5A0E5170F903E0E008172C4CD2，临时模型 7026EA5EB0FC7DEE00E001C7031E3892（IntegrationLifecycle_20261024）。只编辑说明：内容类型 → 内容类型｜A4保存提示烟测 20261024 → 内容类型。每次保存后关闭整个设计器，再由目录新开实例核对。

- 9000.5647 与 9000.5660 分别返回 Code 200；各自完整网络窗口只有一条 CRUD，Base_DataModel 精确一条目标 description 修改、0 新增、0 删除、无额外查询或文件写入。
- 两次捕获的可访问性树均出现“正在保存模型配置…”，没有 DATA_SPACE_MODEL_CONTEXT 或“提交尚未完全确认”。保存中控件锁定，完成后恢复。
- 独立重开分别确认标记和原文；最终正式查询 9000.5670 读到四模型，目标说明为原文，UI 保存禁用、关闭可用。
- 保存中证明来自即时可访问性树。a4-model-saved.png 捕获时请求已经完成，不能当作进行中截图。

脱敏详情见 [a4-save-display-live.json](a4-save-display-live.json)，图证见 [标记重开](a4-model-marker-reopened.png) 与 [恢复重开](a4-model-restored-reopened.png)。

本轮未再创建字段；字段 saving 与未知结果、身份失效的证明为真实 DataSet 夹具自动化，不冒称线上故障注入。临时模型及九字段保留待删除确认。A4 本窄组完成；阶段 A 的任意 C/T 双空间绑定、其他来源未加载保存、跨实例未知恢复、整页对照等仍未完成。
