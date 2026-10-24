# B1 字典主目录范围修复验收（2026-10-24）

本批处理用户反馈“应该不止这个几个字典啊”。主目录原先把请求上下文 X-AppId 固定为业务过滤，只返回当前应用5条；现在默认查询所有正式可读字典，保留原生分页和可清空的应用筛选。当前正式 Count=353；不把该数字解释成其它租户、账号或将来的全库总数。

## 实现与合同

- 删除 DictionaryCatalogInput 静态表及常驻 AppId 级联。目录、过滤、选项、字段读写仍绑定 SPARK DataView；原请求应用存在性和 token 失效守卫保留。
- 目录场景 EDB0E34486FFB903E896E5C281230961 正式模型 Base_AppSystemList（EDB…p002）提供应用选项。新建设计通过独立选项 DataSet 与编辑空间69B…共同交给 PageRuntime，分别释放。编辑空间未注册应用模型，未伪造绑定或借用父实例。
- 新定义通过原 DataView 选择非空 AppId；既有定义按唯一 dictionaryId 读取实际归属，允许保留历史空值，但要求归属字段存在且可读，拒绝改写归属。首次新建保存后的页面状态派生自原 pendingCreateIds，不另建状态真源。
- 当前仓无实际项目子系统范围消费者，本批不添加 fixedApplicationId 或子系统框架；参考入口的固定范围语义留待真实宿主接入时验证。

## 自动化与复核

低价单写者 gpt-6-luna。Phase1目录和跨应用反例先失败；目录fixture最初不执行Filter产生假绿，修正后保留真实RED。最终领域64项、目录/工作区71项通过，共135项，不叠加早轮计数。独立任务复核先发现首存后应用仍可编辑，修复轮1补同一弹窗第二次保存反例并通过；另修复exactOptionalPropertyTypes测试构造和未使用导入。复审原3项均ADDRESSED，新增0。

主控最终 typecheck、lint、正式ClassModel生成、consumer台账生成、verify:rules、build均退出0。首次rules因删除静态输入后page-thin基线应收紧而失败，正式 --update 仅删除该项旧豁免，重跑通过。保留既有两项fromJson警告及构建体积/动静态导入告警。18个ClassModel实际差异中12个仅编译器symbol ID变化、6个为本组源码投影和声明清单；产物均由正式生成器生成。原始命令日志/退出码在node_modules/.cache/metadata-integration-20261024，hash见 b1-scope-verification.json。

## 真实 SPA

浏览器原标签页、同一登录和应用壳。13个分段请求窗口完整、无截断、无Document请求、无网络失败；开发期HMR发生在分段验收之外，不充作正常流程。

| 操作 | 正式结果 |
| --- | --- |
| 主目录刷新 | _Base_DictType Filter null，page1/20，Count353、Items20 |
| 第二页 | page2/20，Count353、Items20，返回另一批记录 |
| 选择元数据管理并查询 | AppId=D99…，Count5、Items5 |
| 重置筛选 | Filter null，page1/20，Count353 |
| 打开异应用px_lsq_status设计 | ID D39BC0D2B65836CD7D80AC84C53C5B99，AppId06CB…，1定义/7条目 |
| 编辑描述后取消 | 关闭被保护；放弃后0写请求；重开仍为原描述“客户状态” |
| 独立打开其数据工作区 | 原7条目及正确目标，无旧草稿 |
| 切换保留B1Sort字典 | ID327D74EC0ABC4196AA75C56D944B8201，1定义/0条目，未串入前7条 |
| 新建草稿不选应用保存 | 前端明确拒绝，窗口0请求；随后绑定正式应用候选并取消 |
| 最终目录刷新 | Count353，无未提交草稿 |

请求及白名单业务字段见 b1-scope-spa-windows.json；初始过滤证据见 b1-catalog-scope-current.json；独立原生只读查询/应用模型核验见 b1-catalog-scope-native-read.json。截图 b1-scope-final-total353.png、b1-scope-foreign-data.png、b1-scope-create-app-required.png。implementation-preview截图只记录开发中预览，不算最终验收。

## 精确边界及剩余项

- 本批线上0业务写入、0资源新增、0删除。异应用保存以及新建首存后同窗继续编辑由正式DataView/RuntimeApi夹具覆盖；本批真实烟测只验证读取、编辑取消、应用选择和缺应用拒绝，不宣称已线上验过这些成功保存。
- 正式应用选项 Filter null 仍只返回元数据管理1条；其它字典的应用名称未返回时保留原AppId。未补造候选或切换请求身份扩大范围。
- 原 B1 排序已提交实现继续保留；typeid SystemData 计算输出阻断新增条目，真实A/B/C排序保存/重开仍待验收。本批不改该合同、不改Java、不核销AI候选、删除引用完整性和下游消费。
- 本批仅本地提交，不自动推送；完整整合goal继续active。

最终整批独立复核：Spec PASS / Quality PASS，新增发现0；9/9源码与13/13命令日志hash一致，生成物与13个窗口回执一致。13窗口共51个GetData全部HTTP/Code200，page1/page2无重复；未扩大线上成功保存或完整B1的证明范围。经明确40路径提交，不推送。
