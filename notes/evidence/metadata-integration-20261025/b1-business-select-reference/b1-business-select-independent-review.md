# B1 业务选项组件 SPA 烟测独立复核

## 结论

**证据支持本次已有业务 select 路径通过：** 真实 SPA 使用已存在服务商打开公共请求头，标准下拉呈现正式字典值，选择“认证使用”后只暂存本地头部；放弃并关闭、同服务商重开后，正式头部查询仍为空。全窗观测到 44/44 请求均为 `/api/DataOperation/GetData` 且 HTTP 200 / Code 200；0 document load、0 事件截断、0 business write。未看到与该测试操作矛盾的额外产品请求。

## 证据核对

- `b1-select-network-observer.mjs` 仅观察 CDP 网络事件，字段投影排除了 token、cookie、密码及 `lingma_sys_*`；不主动请求 API。JSON 记有 44 个请求、空 errors/documents，全部为 POST `/api/DataOperation/GetData`，每项均有 response。身份 companion 覆盖同 44 个 request ID、无截断；全部 X-AppId 均为 `D99A1DCE9894698799101EFD70F8FC76`。响应中没有新增/删除保存请求。
- 字典定义查询按 `TypeName=接口公共头部信息使用类型` 返回唯一一项，rowid=`D7F531C8DA4842B682DD9248A8539DFC`；条目查询按该 `typeid` 返回 3 项（过期使用、固定使用、认证使用）。首次与重开查询均匹配。network identity 中这两张字典表均使用 `x-FormKey=69B79AB779DF4C12A5595DACDF3283F1`；源码正式 `LowcodeDictionary.editorScenarioId` 来自字典 pagedata，本地配置同为该 ID。头部查询则走 API configuration scenario，过滤当前 provider ID，首次和重开均 `Count=0`。完整 scope 是三段键 `scenario@_Base_DictData@default` 对应的正式字典 DataView，未见临时选项数组或伪造表身份。
- 截图 `b1-select-options.png` 显示下拉三个候选；`b1-select-draft.png` 显示临时 `B1-smoke-20261025-select-cancel` 行及已选择“认证使用”；普通关闭按钮在有草稿时保持受保护；经“放弃修改并关闭”后，`b1-select-reopened-empty.png` 显示重开后 No Data。重开阶段共发出 18 个新查询：`reopen-same-provider` 从 26 到 30（4个），`reopened-loaded` 从 30 到 44（14个），包括重新查询字典定义/条目和头部，而不是只凭旧 DOM 断言。

## 证据边界

- `b1-select-nav-clipped.png` 记录默认 1270 宽度时正式入口导航被裁切；主控临时将窗口扩至 2300 才能点击入口并随后 reset。因此本次只能证明在临时宽视口下可达后的业务交互，**不证明默认视口入口可达通过**。
- 界面证据证明关闭后弹层/下拉与临时行不再显示，且重开执行新正式查询；observer 没有访问隐藏 Vue/runtime 状态，故不证明 DataSet `destroyed` 属性。按提供的步骤属于 UI 生命周期可观察结果，不应扩写成对象销毁状态实测。
- 此证据只涵盖现有 API provider 的公共头“使用范围”字段和该已选服务商。它不证明所有租户/权限情形、默认窄屏可达、其他业务 select 消费者或通用组件所有生命周期；不涉及永久业务配置保存。本轮没有做 pagedata 文件持久化/读回验收。

## 源码通道交叉核对

`LowcodeApiProvider.loadHeaderTypes()` 由正式 `LowcodeDictionary.loadEditor()` 装配字典 DataSet，再按类型名称查询定义并核身份字段可见、唯一，随后以正式 rowid 配置条目 `typeid` filter 并刷新。`api-config-page.vue` 的 header list/form `r-select` 通过 `optionDataViewKey` 指向该字典 DataView；`PageRuntime` 同时装配配置与字典两个正式 scenario。标准字段选项链从 DataView 构建候选并写入头部原 DataView；`ApiRequestHeaderDesign.saveHeaders()` 再从字典视图校验类型且保存仅由显式“保存公共请求头”触发。本次没有按该按钮，44 请求均为查询；因此“只暂存、未持久写入”的界面与网络证据相互印证。
