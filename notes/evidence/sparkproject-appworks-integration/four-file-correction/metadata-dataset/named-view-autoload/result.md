# 命名视图自动查询验收

本闭环通过，完整 DataSet / AppWorks 目标仍未完成。主控直接执行，3 个生产文件和 1 个既有集成测试文件；无 UI、Java 或线上写入。

triggerAutoLoad 消费全部明确开启的命名视图；子视图复用父 requestData 在途请求；正式模型父行变化通过查询 owner 重新取数。文件保存、新工作区重开、独立视图、失败恢复、销毁后迟到响应及配置隔离均覆盖。

三个断点依次由 red.log、dependency-red.log、cascade-red.log 复现，每次生产修改立即最小复验；green.log 10 项、edges.log 12 项通过。最终前后 typecheck、四路径 lint、AI 扫描 1019 文件通过；focused.log 10 套件 113 项、root-suite.log 210 套件 2730 项全部通过。聚焦测试包含于全套，不重复累计。四个最终哈希在全套结束后再次比对一致。

前像在 before/，局部差分 changes.patch，门禁汇总 verification.json。未验证直接 loadFromServer 在途父依赖及失败刷新保留旧行的额外情形，不扩大本轮结论。

用户最新指令优先纠正字段级联配置入口：父字段实际值驱动子字段选项视图。
