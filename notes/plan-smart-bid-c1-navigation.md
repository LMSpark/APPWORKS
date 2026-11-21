状态：implementing

## 任务目标

将 D849 SmartBid 已存在的 C1 原生页面接到“平台运营”蓝图导航；只修改正式蓝图导航字段并通过冷重开验证，不新建页面、数据空间、模型、owner 或服务协议。

## 阶段与业务语义

- 本阶段交付的是 C1 的入口闭环：从 SmartBid 顶层菜单进入“平台运营”，再进入三个已建页面。
- 三个叶节点复用已注册系统页：
  - 租户生命周期 -> 入驻管理
  - 公共能力发布 -> 申请列表
  - 服务运行与恢复 -> 数据恢复
- 原生页面仍按 `vue-pages.json` 的正式 scope 与 `dataSpaceId` 装配；不复制 pagedata、不绑定 SmartBid 数据空间替代系统页。
- 页面业务语义是否已满足标书全部 C1 要求属于后续页面验收；本轮只证明导航身份、读取和冷重开。

## 影响范围

- 在线蓝图节点 `平台运营`：仅导航显示字段。
- 在线蓝图节点：
  - `E09340CD2AC684C7A71D9EFFE62BEFAF`
  - `DB6C825F05A702239399686005521F1A`
  - `27D2DA31B2848E8A17C1214AA330E11D`
- 每个叶节点的正式 `NavigationUrl`、`IsShowAtNav`；必要时 `NavigationType`/`conType` 按已接通系统页字段组合调整。
- 平台运营模块的 `IsShowAtNav`、`IsShowChildItem` 和子项位置。
- `notes/data-space-retirement-ledger.md`：记录修改前后、回读和烟测。
- 不修改仓内页面源码、`vue-pages.json`、pagedata、模型、标准组件或公共运行器。

## 技术方案

1. 重新登录并只读回读三个叶节点及父模块当前导航字段。
2. 对照项目执行模块的已接通配置：模块 URL 为空、显示到导航、显示子项、子项位置为 Left。
3. 将三个叶节点分别设置为：
   - `vue:/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page`
   - `vue:/features/application/enterprise-app-auth-application/ui/enterprise-app-auth-application-page`
   - `vue:/features/system/data-recovery/ui/data-recovery-page`
4. 叶节点启用“显示到导航”；平台运营模块启用“显示到导航”和“显示子项”，子项位置与项目执行保持一致。
5. 每项编辑沿原蓝图 DataView 保存并精确回读；不同时创建工具、数据空间或修改节点类型。
6. 刷新 D849 导航，依次进入三个入口；只读确认页面标题、DataView 装配、首屏结果或明确空结果。
7. 对三个入口执行关闭/重开或整页刷新，核验登录身份、节点标记和页面场景未串线。
8. 不执行企业审核、授权审批、数据恢复、保存、删除或发布动作。
9. 若保存后某节点不能生成系统页身份、立即停止并回读保存字段；不通过复制 cfg 工具或修改页面源码兜底。

## 兼容性

- 无源码兼容层；导航字段直接采用当前 `vue:` 系统页合同。
- 原生页继续由各自正式 scope 和 dataSpaceId 装配。
- `cfg:` PageTool、VersionId、manifest 不适用于这三个已注册原生页，不额外创建。
- 其它应用现有系统导航保持不变。

## 验证计划

- 修改前逐节点截图/字段回读。
- 保存后对三个节点重新打开蓝图，核对字段值与正式节点身份。
- 顶层菜单出现“平台运营”，其下出现租户生命周期、公共能力发布、服务运行与恢复。
- 三个链接各冷打开一次，验证：
  - 入驻管理：正式企业列表可读取；
  - 申请列表：正式列表可读或明确空集合；
  - 数据恢复：应用/数据库/表选择入口可装配，无身份错误。
- 整页刷新或退出重进至少各一次，验证系统页 owner 与导航标记。
- 不发送任何 POST/保存请求。
- `pnpm run verify:docs`、`git diff --check`、`git status --short`。
- 本计划是在线导航配置；不运行类型检查或构建，除非发现代码层阻断并另行升级方案。

## 风险项

- 三页分别属于 platform/enterprise/app scope；若应用业务导航不能复用某 scope，需先修正式导航身份合同，不能通过 URL 拼接绕过。
- 页02“申请列表”与标书“公共能力发布”业务语义是否完全等价仍需后续验收；本轮只接现有页面，不修改业务模型。
- 导航保存是在线正式记录，失败或结果未知须保留原节点状态并按原 owner 核验，不重发。
- 登录态当前已过期，实施前必须由用户重新登录。
