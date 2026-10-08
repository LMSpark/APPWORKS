# 真实 pagedata 保存、重开和值级联

2026-10-09，本验收通过。完整 DataSet / AppWorks 目标仍未完成；本轮未修改生产源码、测试、Java 或界面。

## 实际结果

授权测试目标仍为 `97DCB03F75AADEAE6B102B062DB71CEA`。仅在其原有 Base_DataSet 模型下临时增加两个命名视图和一个 query 值级联，两个视图复用同一正式 DataTable，候选范围明确限制为两个已知空间 ID。

1. 原生设计会话 stageDefinition 验证候选后，正式查询验证单选、多选、切换及清空，精确返回 1/2/1/0 条对应记录。
2. session.saveViews 经既有文件 owner 确认保存；独立文本与下载字节校验匹配候选。
3. 新建 ProjectWorkspace 重新读取配置，再经 loadScenarioDataSet 装配、正式查询，得到同样 1/2/1/0 结果。两次消费均验证 DataMember.Value 是主键数组，DataView.value 是原竖线分隔字符串；只换指针不发查询，原 default rows 保持未加载。
4. 通过同一 ProjectWorkspace 保存入口恢复原文，再独立文本和字节回读。元空间文件未变化。

最终报告 `verification-result.json`：178 次读取、2 次文件上传、0 次业务 CRUD。saveConfirmed/reopened/restored/remoteOriginal/metadataUnchanged 均为 true，退出 0。第一次上传是候选，第二次是恢复；没有自动重传或未知结果被忽略。

- 原文及恢复后 SHA256：`f86a7ff9cd155435d7a9c6a14f38e92a38b3e6f1eab04051fe8964fd2ba0c6b5`
- 候选 SHA256：`06b886c662a4fe1c167f06e92c70a5cb4012ca7743194c4fb8164bd286326139`
- 元空间 SHA256：`86ccf1cd4ae3b0a792ff91458074a691dd738955ce99bd21e65033267881a0c1`

当前远端已恢复原配置，临时验收视图不作为正式业务视图发布。源码没有新变化，本轮未重复类型、Lint 或完整回归，也不将上一轮 2773 项历史通过当作本轮新执行结果。

## 真实限制和保留的失败

`inspect-result.json` 对当前测试目标读取发现：shif 可查询两条字典选项，但正式字段无主键，全部只读；TestJSON0819 查询被资源 Base_JsonData 的数据权限拒绝；copyTable 查询返回数据库 testAdd 不存在。Base_DataSet 只有正式 rowid 输出，不能用其主键冒充可写子字段。

最初 shif 字段级联候选在上传前失败：无正式主键无法建立选中集合，DataView.value 为空。`field-preflight-result.json`、失败脚本及候选保留，写入 0。未伪造主键、放宽权限、修改模型或建立业务数据。正式 keyless 只读合同见 DataSpaceDesignApi 的 FormalModel 及 readModel 解析、Assembler 对正式 primaryKey 的装配。

因此本轮证明真实命名视图、query 值级联及字符串兼容能够持久重开；不证明 field 级联对可写子字段的线上清理/写回。这部分现有本地行为与接口夹具证据仍有效，线上还需要有正式主键和可写非主键字段的已授权测试模型。整体实现继续，不将测试源限制解释为所有数据空间均有问题。

## 复验与边界

`verify.mjs.txt` 为实际执行脚本；先无参数运行作零上传预验证，再以 `--persist` 运行保存闭环。账号由已授权 DPAPI 包装对象的 Credential 属性送入 stdin；未记录密码或 token。请求白名单只允许正式查询、文件读取和仅该目标 pagedata 的两次上传。Node Buffer 仅在证据脚本转成浏览器 ArrayBuffer 形状，未修改生产传输。

脚本写前比较及恢复前比较用于检测并发更改，不承诺后端不存在的原子 CAS。未写 knowledge，未委派、commit、push 或建分支。
