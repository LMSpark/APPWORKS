# DataSpace 创建 owner scope 只读复核

日期：2026-10-28  
环境：认证 SPARK SPA，租户 `NewApp`，应用 `D99A1DCE9894698799101EFD70F8FC76`（元数据管理）  
页面：`/t/NewApp/D99A1DCE9894698799101EFD70F8FC76/features/data-platform/data-set-management/ui/data-set-list-page?__sparkNavigationId=90A82E287930A234FEC3E687C94A93EA`

## 观察

- 通过正式“数据空间管理”导航节点进入目录；目录显示 `Total 1335`、当前页 10 条。
- 当前 `新增`按钮可用；`编辑`和`删除`因没有选中行而禁用。这修正了更早现场记录中的“新增也禁用”。
- 打开“新增数据空间”后只检查所属应用选择项。下拉仅显示“元数据管理”一个正式选项。
- 未选择应用、未输入名称/描述、未点击“确定”；点击“取消”关闭表单。
- 最终仍在原 D99 数据空间目录。没有创建数据空间、保存 pagedata、写业务行或调用 Java。

## 结论

设计器当前可通过正式流程新增归属元数据管理应用的数据空间；这不能创建或证明根 `/app-list` 的平台 owner/scope。`sysid=homepage` 在当前正式目录预览为 0 行，不能通过给 D99 空间改名或复用其 ID 来补根 owner。根 owner 应从服务端正式应用/导航目录身份与维护合同确认，再用设计器补充对应 DataSet 定义。
