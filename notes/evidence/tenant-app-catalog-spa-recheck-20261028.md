# Tenant 应用目录与数据空间目录 SPA 复核（2026-10-28）

## 浏览器诊断

- 已有 IAB 标签在 inventory 中仍可见；按旧 tab ID 和按 URL 附着都返回 `browser.user is unavailable`。这不是 SPA 登录回执。
- 新建 IAB 标签可正常访问 `http://127.0.0.1:5273/`；走本次用户授权的本地测试账号登录后，SPA 显示“王涛”。不保存或输出凭据。
- 在应用列表中通过“进入应用”切换到 D99 后，原 `homepage/app-list` 临时出现“无法确定系统页面”；等待应用上下文切换完成后，SPA 原生导航自动打开 D99 的服务器管理页。再从 D99 导航树进入“数据空间管理”，页面正常加载。这证明旧标签句柄错误与未注册路由/应用切换等待是两个不同状态，直接私有 URL 导航不能替代原生路由。

## 只读业务观察

- `/t/NewApp/homepage/app-list?__sparkNavigationId=appworks-tenant-app-list` 的原生应用列表显示 62 个应用卡片。
- `/t/NewApp/homepage/apps?__sparkNavigationId=appworks-tenant-apps` 的平台应用管理，租户选择为“领码科技 (NewApp)”，加载完成后表格有 62 个数据行。初次进入短暂显示 `No Data`，待查询完成后才有记录；不把过渡状态计作结果。
- D99 数据空间目录加载显示 `Total 1348`，每页 10 条；当前页 10 条的“应用系统”均为“未解析应用”。这是当前页观察，不据此推断全量 1,348 条的 owner 状态。
- 只读打开第一条“资产管理”数据空间，目标 ID `A651B6600F623DD7F22F127CF3B12B56`。设计面板显示模型数 0、关系 0、尚无视图配置；随后关闭面板，未保存模型、关系、视图或布局。
- 已有正式作用域对照见 [`application-catalog-scope-live-20261028.json`](application-catalog-scope-live-20261028.json)：root 目录与 D99 `Base_AppSystemList` DataView 结果分别为 61 与 1，headers 和查询身份也不同。该观察是同日较早快照；本次重测 root UI 为 62，提示目录会变化。两组结果均不能据此证明 D99 DataView 等价于 root/tenant 目录。

## 结论

- 旧标签的 `browser.user is unavailable` 可通过新建标签恢复；登录/SPA 导航分别验证。真实浏览器运行是只读检查。
- 当前数据空间设计器确能打开并维护一个显式目标空间，但“资产管理”空间无模型和视图定义；当前证据没有给出可安全补入的业务模型、正式 root owner 或 tenant 行/字段授权合同。
- 不创建 DataSpace、不选择/猜测 `sysid`、不补造 DataView owner。后续需先有正式 tenant/root owner 身份及其 DataTable、DataView、授权范围和总数/分页合同，再将 root SPA 结果与同范围 DataView 比对。
