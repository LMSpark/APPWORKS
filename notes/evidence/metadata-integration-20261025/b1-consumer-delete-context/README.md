# B1 消费读回与删除查询状态验收

唯一计划状态见 `notes/data-space-retirement-ledger.md`。本目录保存本窄组的证据，不是另一份实施计划。产品基线为 `fe003c69da209edf488b29431e764181995ec465`。

## 正式消费对象

- 字典：`B1Sort_20261024_1925F4C2` / `327D74EC0ABC4196AA75C56D944B8201`，原七条业务记录保留。
- 测试空间：`LivePilot_T_20261017` / `944DEE5A0E5170F903E0E008172C4CD2`。
- 本次新增正式模型：`F9F01665D4A98E1FF996CD8A48D3C373`，注册名及来源名均为 `B1Sort_20261024_1925F4C2`，`Type=字典`、`DbId=327D74EC0ABC4196AA75C56D944B8201`。原三个模型未修改。
- 八个字段：`rowid, val, txt, exVal_1, exVal_2, exVal_3, exVal_4, ordIdx`。来源弹窗“确定”直接调用既有模型新增保存链；2180.3831只含一模型、八字段Added，无Changed/Deleted，HTTP/Code200。
- 正式视图键：`944DEE5A0E5170F903E0E008172C4CD2@B1Sort_20261024_1925F4C2@b1Consumer`。`pagedata.json`独立保存`valueField=val`、`labelField=txt`、`sortExpression=[{field:ordIdx,direction:asc}]`，绑定正式模型ID及名称，并保留原配置和布局。

## 真实 SPA 证据范围

1. `b1-consumer-inspection-network.json`是新增与首次预览窗口：48请求、一个模型/字段CRUD，未加载Document。首次预览的两个元数据查询返回HTTP401；认证失效后现有执行域守卫拒绝预览。正常关闭后重新登录，未绕过守卫，未改Java。
2. 认证恢复与应用引导独立于业务验收窗口。`b1-consumer-runtime-readback.json`记录其后同一SPA内模型查询、命名视图保存、关闭、独立重开及正式查询：48个GetData，47个回执完整成功，0Document、0事件截断、0数据库CRUD。最后2180.5413是clean close后触发的目录刷新，冻结时尚无回执；随后开发HMR后其浏览器响应体已不可取得，不能记成功或服务失败。
3. 模型预览返回七条、完整八字段、模型排序升序。命名视图未配置排序时请求没有排序，不能推断其继承模型排序；随后通过标准排序编辑器显式保存ordIdx升序。独立重开后命名视图正式查询仍为七条，排序值0/0/1/2/3/4/5，六业务字段及rowid与G4保留结果一致。
4. 两个`*-file-proof.json`来自对已观察文件请求的CDP只读取证：两次UploadFile回执均HTTP/Code200，随后DownFile及content/text确认配置。两个视图保存前后，其他表配置及布局摘要一致。上传multipart正文不可从观察事件取得，未伪造原文。模型新增时自动布局保存仅有界面回读提示，本观察器没有捕获该文件请求。
5. `b1-consumer-evidence-check.mjs/json`只读审计这些证据。最初审计发现关闭目录请求未完成；后续脚本显式保留这一边界，另一次脚本空响应访问错误也保留原输出。最终审计通过不表示那条目录请求有回执。

标准表格确实绑定运行DataView显示了正式数据。此证据没有新增业务选项控件页面；其他消费组件的具体值/标签交互仍须按其真实业务验收。测试字典、七条数据、新模型及视图均保留，没有执行资源删除。

## 删除状态修复

公开领域API的真实反例：成功读取后`entries.resetState()`产生Idle空集0/0，旧可用性仍为true且能暂存定义删除；definition或entries独立刷新处于Loading时，也可暂存整字典删除。测试通过原生DataSet/DataView和延迟HTTP夹具触发，未改私有状态。正常页面首次加载已有ready守卫，不将API反例夸大为已发生的线上误删。

最小修复在`canRemoveDefinition`共用只读预检中要求当前DataSet/两视图存活、Loaded、无查询错误/刷新/保存/未知回执；`removeDefinition`继续复用它，在任何暂存前拒绝。没有新增查询、保存器、行副本或权限推导。后一条权限不足已有完整预检，定义reset已有身份守卫；这些作为对照保留。

RED v1/v2含随后纠正的目标断言，不能视为最终测试合同；v3为正确拒绝原因和无修改断言，101项96通过/5失败。GREEN与门禁原始输出、最终审查和文件摘要随本目录归档。测试中两处无效`await`同步destroy曾导致lint失败，修正及复验输出分别保留。

按仓内文档命名规则，原cache报告`red-v2.md`在归档中名为`b1-delete-context-red-rejected-state.md`，`red-v3.md`名为`b1-delete-context-red-validated-contract.md`；内容字节不变，原始日志文件名保持。文档门禁对版本后缀及低信息量命名报错的输出亦保留。

## 尚未核销

- 全局删除引用完整性。T空间现在有明确B1模型引用；现有单空间元数据查询的正命中可证明存在引用，零命中不能证明全局无引用。未以全表拉取、猜测服务协议或删除试探规避。
- 旧AI轮次CANCELLING与原Agent创建未知结果。原标签页和进程仍保留，新消费者通过不代替旧捕获处置。
