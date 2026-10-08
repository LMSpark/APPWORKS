# 数据空间四文件页面真实来源新增验收

2026-10-08，限定当前授权测试空间。完整页面尚未验收；后续五类创建结果见末节，数据库表与非表运行消费结论分别保留。

## 已证实结果

- 工具 `8D1AB14DD8277F3E7017CD38F77B09FD` 的 script/rule/style 经正式 `LowcodeDesignFileUpload` 更新并逐字节回读；共享场景 pagedata 原本一致。应用为 `D99A1DCE9894698799101EFD70F8FC76`，没有改导航、场景身份或发布指针。原始文件字节备份与 SHA 在 manifest.json，各文件 `.before`；结果在 sync-result.json。上传不具备服务端 CAS，不声称原子提交。
- 真实浏览器发现 View_TblList 第一条可读空 dbid/DbName 使整个列表失败。已把非空校验移至 prepare 的身份重查和比较之后、字段查询之前：列表保留首条及原 total=1188；选中该条提示无法创建；有效条继续可选。隐藏/脱敏检查保持。两文件预像、红绿测试和主控审查见 `../model-source-null-database/result.md`。
- 页面真实点击新增 `copyTable`，正式模型 ID `536CACBAE8A723F65264B47003D15850`，11 字段，数据库 `testAdd`。首次写入后页面明确报告布局缺失；接受正式结果后，显式预览并创建布局，逐字节回读、完整重新装载。没有重复提交模型。刷新后同一模型和 11 字段仍可见。
- 下游验证发现 `testAdd` 对应实库不存在，500 结果保留在 readback-testadd-unavailable.json；没有修改/伪造库身份或删除测试记录。随后从设计场景实际正在使用的 Base_DataSet 模型核定 `QYVirtualPlat`（reference-result.json），在页面选择同名物理来源，保存第二个模型 `B7B0D0E8F824E9CBFA2BEBEE6A76F465` 及 17 字段，现有布局追加节点成功。
- 精确正式回读：目标空间 `97DCB03F75AADEAE6B102B062DB71CEA` 共 2 模型、28 字段。新 Base_DataSet 正式读取主键为 rowid、17 字段；使用该目标空间与模型注册名调用现有 runtime.query，返回 countReported=true、total=1185、当前页 10 行。只保存数量，不记录业务数据内容。详见 readback-result.json。
- 浏览器整页刷新后第一次读取失败；点击现有“重新加载”后恢复。新页面实例显示已保存布局/2 节点，两节点身份与正式模型一致，证据 reopened-graph.txt / reopened-graph.png。页面没有残余未确认创建操作。该次首次读取失败原因尚未定位，不能写成无异常重开或零回归。

## 验证和消耗边界

低阶执行者 gpt-6-sol medium 修改仅 Reader/现有测试，主控核原字节差异、最后文件哈希与真实网页；gpt-6-luna medium 只读核空库语义。Reader 新增两类数据库来源混合空库用例，12/12 通过；根类型和精确 lint 通过；最后具名测试类型修正只复验类型和 lint，未重复 197/25 大套。仅节点可见、成功提示和 HTTP 200 均未单独当作交付证据。

本阶段当时未证明其余五类来源的真实创建与下游使用；创建部分随后在下节验明，下游缺口分别保留。D04 替换/同步、D07 页面运行预览及主计划其余整页缺口、初次刷新读取失败根因、全页/全仓零回归仍未完成。没有物理业务表写入、没有提交或推送。新增模型及布局留在原测试空间，不自动清除。

待沉淀候选：可读 null 与无权读取不同；来源登记存在不表示实库可达。这里只记录证据，不写未经用户确认的 knowledge 或用户记忆。

## 其余五类来源真实验收（14:28）

通过同一四文件页面依次创建并回读，未改生产代码、未重复已验本地大套：

| 来源 | 新模型 ID | 注册名 | 初始字段/入参 |
| --- | --- | --- | --- |
| 字典 | 23242F5DF24156A738D99A9270802B24 | shif | rowid/val/txt/ordIdx 共 4 字段，均输出、IsPKey=0 |
| JSON | 4F2240B23F1F951EC6356AA576F28165 | TestJSON0819 | id/pid/name/type/haschild/value 共 6 字段，均输出、IsPKey=0 |
| 接口 | 2E2EE885581B4B21940479EBDC3402C9 | Json转数组 | 6 个 dataModel 定义、1 个 inputParams：json |
| 逻辑视图 | 3A91837FD1EFF10F2B9FF90FF771989C | db_relation_show | 25 个 dataModel 定义、2 个 inputParams：sysid/database |
| 数据库视图 | 49B82918D1DF5273C5EC752D208621EE | View_TblList | 47 个 dataModel 定义，DbId=EBEFF17BBB6443B185D6FB32FF69F0BB |

准确的每字段 ID、类型、归属、IsPKey/IsOutput、别名/值函数是否为空见 additional-readback-result.json。所有入参初始 ValueFun 为空，不使用源 testvalue；五个模型均没有臆造主键。包含前轮两表后共 7 模型、119 字段/参数，字段全部属于此次目标模型集合。每次新增均完成已有布局追加；整页刷新后 7 条正式模型及 7 节点仍在。本次刷新记录的 responseReceived/loadingFailed 没有网络失败，不能据此抹去前轮故障。

接口首次确认时发生 Network Error。页面保持 input 阶段；代码在重新 prepare 之后才构造/派发保存，此次没有 dispatched 或未知写入状态。显式重新预览的三次 GetData 均 200，随后保存和回读成功。原错误发生时尚未启用网络追踪，根因仍未知；后续成功请求不能反推失败原因。保存阶段截图/DOM、脱敏后的后续网络记录在 additional-browser-proof.json；刷新后模型截图为 reopened-six-source-models.png。临时 Network 观察已关闭，没有留页面修改。

下游证据区分：shif 通过同一新空间的正式 runtime.query 返回 2/2 行；而设计 API readModel 对全部五个非数据库表模型都拒绝“正式主键无法映射到唯一有效输出字段”。其中 formalDatabaseTable 只识别数据库表，不含数据库视图，不能错误声称视图已经走来源主键反查。JSON 查询被后端以 Base_JsonData 数据权限不足拒绝；没有修改授权或 admin 特判，没有执行接口/逻辑视图业务调用。创建与设计页重开已成立，通用 DataSet 消费及页面预览仍待恢复，不能称六来源运行全部通过。

证据脚本由 gpt-6-luna 编写，主控完整读后执行；仅固定测试空间元数据回读，以及明确白名单的字典/JSON 查询，输出不包含业务结果行、凭据或值函数内容。D03 创建闭环冻结；下一实施关注上述非表消费者的真实合同，不重复当前验证。
