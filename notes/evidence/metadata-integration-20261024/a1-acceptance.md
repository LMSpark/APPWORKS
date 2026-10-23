# A1 参数声明恢复链验收

- 日期：2026-10-24（Asia/Shanghai）；代码基线：`5297c9b37786d9e3d82713d74c2a76a95a6bc2a0`，本文件随 A1 实现提交。
- 实施：gpt-6-luna；主控完成派工、裁决、工程检查和真实浏览器烟测；独立复审第1轮已通过，无残留 Critical/Important/Minor。
- 范围：输入参数编辑/取消/精确保存/未知核验；不表示阶段A、模型字段链或整平台验收完成。

## 工程证据

临时日志目录：`node_modules/.cache/metadata-integration-20261024/`。

| 检查 | 最终结果 | 日志 |
| --- | --- | --- |
| 参数 UI 恢复反例 | 10 passed / 327 skipped | a1-round1-ui-regression.log |
| 元数据参数/权限/上下文回归 | 35 passed / 46 skipped | a1-round1-metadata.log |
| typecheck | exit 0 | a1-round1-typecheck.log |
| 修改文件 ESLint | exit 0 | a1-round1-eslint.log |
| 主控 verify:rules | exit 0；既有2项 AI model warning | a1-round1-controller-rules.log |
| 主控 build:fe | exit 0；依赖构建警告保留 | a1-round1-build-fe.log |

较早全参数 UI 过滤47项通过发生在第1轮修复前，不冒充最终代码检查；330+项整文件长跑曾异常终止，不计通过。测试数不与历史全仓结果累加。

## 真实浏览器用例

本地Vite `127.0.0.1:5273` 连接实际服务；租户 NewApp，应用 `D99A1DCE9894698799101EFD70F8FC76`，原导航节点 `90A82E287930A234FEC3E687C94A93EA`。目标仅为隔离空间 `944DEE5A0E5170F903E0E008172C4CD2 / LivePilot_T_20261017`。

1. 从原数据空间目录打开设计对话框，读取空间原定义、3个已有模型的配置画布；没有启动Java或修改导航URL。
2. 打开“输入参数”，正式编辑器显示参数 `sourceDatabaseProbe`，主业务参数为false，原描述为“来源参数引用测试 20261018；共享行回读核验，隔离定义，勿用于业务”。
3. 描述追加“；A1 smoke 20261024”后点击取消；重新打开参数，DOM值逐字等于原描述。
4. 再次追加同一标记并点击确定；界面返回“输入参数已保存并回读确认”。关闭整个设计对话框，从目录再次打开新的设计实例，再打开参数，DOM值包含完整标记；截图 `parameter-smoke-reopened.png`。单行输入框宽度导致截图未显示完整长文本，完整值以本次DOM读数为依据。
5. 把描述恢复为原文，点击确定并得到同一保存回读确认；再次关闭设计对话框并从目录重开，参数名称、描述、主业务参数与原值一致，DOM严格比较返回true；截图 `parameter-smoke-restored.png`。退出参数编辑，未遗留烟测标记。

本次记录两次真实UI保存动作（烟测值和恢复值），没有独立统计底层网络写请求次数，不将动作次数当作传输次数。真实烟测未人为注入未知响应、部分成功或会话失效；这些异常当前只有上述自动化反例，跨刷新/重新登录未知恢复仍属阶段A待办。此用例证明设计参数持久化与独立重开，尚未验证下游运行工具消费。

## 元数据引导阻断处理

用户已确认 E62ResourceProbe 是废弃测试配置。主控沿既有文件语义 DataView/DataSet 提交仅删除该绑定（含 default/probeEmpty）和该模型布局坐标。原始保存调用的回执校验异常，停止写入；独立只读workspace/DataSet回读完整JSON与精确候选完全一致，详见 `retired-probe-readback.json`。未重放、未回滚，未删除数据库模型。原文与带时间戳备份在cache保留；原失败调用没有成功原生保存回执，不能用后续回读改写这项事实。

清理后真实目录→设计对话框正常打开，原C引导阻断解除。此清理不是对装配守卫的放宽，也不是补造丢失模型。
