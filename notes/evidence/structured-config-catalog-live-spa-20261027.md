# 结构化配置及半结构化目录 SPA 只读烟测（2026-10-27）

## 范围与方法

- 本地 SPA：`http://127.0.0.1:5273`，租户 `NewApp`，应用 `D99A1DCE9894698799101EFD70F8FC76`。
- 使用用户授权的测试会话登录，单个浏览器标签保持登录态；从应用顶部功能组和组内导航菜单切换页面，没有整页刷新。
- 仅加载目录、观察正式导航 URL、无障碍树显示和浏览器控制台；没有选择行、编辑、保存、删除或执行设计命令。
- 检查五个之前未完成现场烟测的目录：数据编码、数据工作流、Excel 导入、PDF 识别，并复核逻辑视图和 JSON 目录。

## 结果

| 页面 | 正式导航 ID | 可见结果 | 判定 |
| --- | --- | --- | --- |
| 数据编码 | `A133D679691178F192D7E9DA06829506` | `正式数据空间模型必须唯一且属于当前数据空间: _Base_CodeDesign` | 失败；正式模型身份/归属校验未通过。与既有缺口现场复现一致 |
| 逻辑视图 | `EB720370EF06A5A656838F87E0716D6B` | 目录表显示 `Total 16` | 通过，只读查询 |
| 数据工作流 | `5E9676B1E38860B023921F48FB4370DE` | `正式数据空间模型必须唯一且属于当前数据空间: Base_UserInfo` | 失败；正式模型身份/归属校验未通过 |
| Excel 导入 | `36B01771C627B9BF5CD493DC75B996A1` | `正式数据空间模型必须唯一且属于当前数据空间: _Base_ImportConfig` | 失败；正式模型身份/归属校验未通过 |
| PDF 识别 | `A2D63AB2AAEF156E7727094A23AEA433` | `正式数据空间模型必须唯一且属于当前数据空间: Base_UserInfo` | 失败；正式模型身份/归属校验未通过 |
| JSON 数据 | `FFDEF2AED3E19A38C0FCDDC748CF939B` | 目录表显示 `Total 11` | 通过，只读查询；内容 DataView 的历史同会话验收另见台账前条 |

各页面路由由同一 SPA 的应用导航菜单触发，浏览器标签未更换。末页切回逻辑视图后再次确认 `Total 16`。本次浏览器控制台读取结果为 **0 error**；页面内的模型校验错误显示为业务加载错误，不伴随浏览器控制台错误。

## 结论边界

本烟测证明两个目录当前可通过 SPA/DataView 展示列表，并现场确认另外四个目录受正式模型身份或归属校验阻断。错误文案本身不能区分模型缺失、重复或归属错误，需沿各自正式 DataSet 装配结果继续诊断。客户端控制台无错误不代表服务端权限或跨应用隔离完整。没有 Java 修改、线上业务写入或数据清理。

## 正式模型身份回包复核

在同一已认证 SPA 标签中复核四个失败目录。网络请求均由目录 DataView 正常触发，地址统一为 `POST /api/DataOperation/GetData`，资源表为 `Base_DataModel`，没有调用其它元数据通道。先在同一请求链读到正式 `Base_DataSet` 场景记录 1 条，随后按下列 `dataSetId + Name` 条件精确查询。所有响应包络 `Code=200, Message=操作成功`：

| 页面场景 | 模型名 | 正式查询结果 | 判定 |
| --- | --- | ---: | --- |
| 数据编码 `A133D679691178F192D7E9DA06829506` | `_Base_CodeDesign` | 0 条 | 当前 DataSet 缺少 loader 所需模型 |
| 数据编码同场景 | `Base_UserInfo` | 1 条，MetaName 与名称一致 | 有效模型行存在 |
| 数据编码同场景 | `Base_StructureType` | 1 条，MetaName 与名称一致 | 有效模型行存在 |
| 数据工作流 `5E9676B1E38860B023921F48FB4370DE` | `_Base_DataWorkFlow` | 0 条 | 当前 DataSet 缺少 loader 所需模型 |
| 数据工作流同场景 | `Base_UserInfo` | 0 条 | 当前 DataSet 缺少 loader 所需模型 |
| Excel 导入 `36B01771C627B9BF5CD493DC75B996A1` | `_Base_ImportConfig` | 0 条 | 当前 DataSet 缺少 loader 所需模型 |
| Excel 导入同场景 | `Base_UserInfo` | 1 条，MetaName 与名称一致 | 有效模型行存在 |
| PDF 识别 `A2D63AB2AAEF156E7727094A23AEA433` | `_Base_PdfInspectRule` | 0 条 | 当前 DataSet 缺少 loader 所需模型 |
| PDF 识别同场景 | `Base_UserInfo` | 0 条 | 当前 DataSet 缺少 loader 所需模型 |

这把四页的现场错误从笼统“模型必须唯一且属于当前数据空间”进一步定位为当前目录 DataSet 下精确过滤无记录；不属于同一 DataSet 的重复，也不是 `MetaName` 投影失败。此结果不能证明同名模型在其它空间不存在，也不能确认这些导航目标场景是否指向产品预期空间。工作流、PDF 页会并行读多个模型，页面展示的错误名只代表首先显示的拒绝项；这里按真实响应覆盖了各自所有必需模型。保持只读，未建模、未改绑定、未修改数据。

实现链复核：各目录页读取 `route.meta.blueprintScenarioId`；loader 调用 `loadStructuredConfigCatalog`；后者通过 `DataSpaceDesignApi.readModel` 同 `Base_DataModel` DataView 按 `dataSetId + Name` 查正式记录后，以回包模型 `id/metaName` 形成 DataTable binding。上述请求过滤与响应计数均与该链一致。后续须先比对蓝图正式场景指向、参考页业务语义及批准的模型目录，再决定是否修蓝图或按正式设计界面补建 DataTable；不得用其它空间同名模型回退。
