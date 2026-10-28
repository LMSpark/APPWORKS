# 平台应用管理真实 SPA 验证（2026-10-28）

- 复用本地 5273 已授权登录态，导航栏显示王涛；当前企业为领码科技。没有新增前端 tenant/root owner，也没有传入租户过滤代替后端登录授权。
- 通过应用工场原生“平台应用管理”导航打开 `/t/NewApp/homepage/apps?__sparkNavigationId=appworks-tenant-apps`。标准表格正式读回 62 条，62 个“进入”操作，0 个“删除”操作；服务端模型缺少可用 IsSys 投影，不猜成非系统应用。
- 首行 ID `00BE6ED455CD4BD7B785C61A12A1E67D`，名称/描述均显示“数据资产管理”。字段由标准 RendererTable 子组件绑定原 DataView，未使用页面数组补值。
- 点击标准“刷新”，状态由 Loading 恢复 Loaded，行数/总数均为 62。主控发现可选布尔 prop 省略不足以保证元信息可见，显式设置 showDataViewMeta=true，并增加组件绑定断言；真实再读与刷新均显示“行数 62 总数 62 状态 Loaded”。未人为制造线上服务错误；错误链由自动化用例验证。
- 打开“新建应用”表单后取消，没有创建提交。创建/删除写合同依然未完成，不将表单打开视为写入通过。
- 在 D99 元数据管理行点击“进入”，原切换回执链成功，同一 SPA 到达 `/t/NewApp/D99A1DCE9894698799101EFD70F8FC76/features/data-platform/database-management/ui/service-management-page?__sparkNavigationId=78C58A7FE34F2987267A1E8AF10B2990`，显示服务器管理与 D99 应用壳。浏览器返回平台目录后仍正常读取 62 条；通过原生“应用列表”导航回卡片页。正常流程没有整页刷新。
- 没有业务/元数据写入或 Java 改动。现场验证覆盖正式读取、标准刷新、表单打开取消与 SPA 应用切换；不是创建/删除验收。

## 主控工程验证

- PlatformApps、AppList、application-switch：3 文件，31/31，通过；最后一轮包含显式状态栏 prop 断言。
- 三个改动代码/测试文件 ESLint：exit 0。
- 根 typecheck：exit 0。
- verify:rules：exit 0，包含 49 项 ClassModel 门禁测试；既有 2 warnings/1 info 保留。
- generate:class-model-surface 与 generate:lowcode-contracts：exit 0；生成物未手改。
- 最终模板修改后 build:fe：exit 0；保留既有 CodeMirror 动态导入告警。
