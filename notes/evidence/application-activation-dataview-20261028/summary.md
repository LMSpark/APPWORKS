# 应用选择目录 DataView 统一与 SPA 验证

## 目录读取核心（已验证，提交 702cf6c90 已推送）

- 现有应用选择 fence 内调用宿主构造注入的 `readApplicationById`，缺配置明确失败，不回退旧列表 HTTP。共享 `readLowcodeApplicationById` 经正式 DataSet/DataView 查询并释放资源；显式目标导航删除重复实现，复用同一 helper。
- 可选应用元信息未返回/不可读时省略，不推断 IsSys=false 或从登录会话拼造归属；store 兼容旧完整快照，拒绝显式非法可选字段；项目设置未知分类省略，已知 true/false 行为保留。现有小写字段别名回退继续使用。
- RED 包级 7 fail/58 pass，helper 7 fail/2 pass（后者失败于新 helper 导出缺失，不能当成已执行行为证明）；项目类型消费反例另见 `RED-project-settings.txt`。GREEN 原始输出为实施者 API 66、应用侧 67、typecheck 与包 lint。
- 主控独立复跑 API/上下文四文件 70/70、导航/切换/目录/分类/两个目录页面六文件 82/82 通过；独立复审 PASS。主控 app lint 另发现名称 `||` 与未用导入三项错误，交回修正；共享 helper 10/10、两个源码 lint 通过，窄复审 ADDRESSED。名称仍按非空 description→code→id 回退。
- 主控完整 `build`、修正后的 `build:fe`、`verify:rules`、正式 ClassModel 生成及 lowcode 合同生成通过。ClassModel 981 文件、2017 symbols、1614 index entries；lowcode 611 endpoints、211 consumers；产物未手改。保留既有 AI model spec 2 warnings/1 info 和 CodeMirror 动态导入告警。
- 权限测试经正式 `lingma_sys_params.h` 解析到 DataView，不使用 fieldAccess mock；r 为必填而非读取白名单。重复回包可在正式权限/查询层或 helper 层明确拒绝，不为了匹配错误文字手工添加 DataView 行。metadata stale 只证明装配前停止；已创建 DataSet 的 query stale/error/重复拒绝覆盖销毁。

## 首轮真实 SPA 与发现的问题（历史调查范围）

- 使用既有授权账号建立本地会话，目录 62 条。标准平台表格进入 D99，原生导航到服务器管理；通过原生用户菜单“应用工场主页”返回目录，仍显示登录用户与 62 张卡片，没有业务数据写入或整页刷新。
- 初次卡片“进入”无请求/导航。现场证据 `spa-card-overflow-before.json/png`：实际 cell 192.5px，card 502px，内部 24 列和 20px gap 迫使 body 达 460px；按钮中心命中后续卡片 body。该布局缺陷随后按下节修复，不作为目录 reader 失败。
- 第一轮网络观察因开发模块请求挤出缓冲而 `truncated:true`，不能证明完整选择请求链；最终稳定代码后重采，禁止以截断记录宣称无旧查询。
- 保留旁路：导航根 `resolveNavigationRootId` 仍直接 GetData；projectReferences 与 project-settings 仍有旧目录读取；公开 selectApplication 的旧对象入口尚未纳入本批。整体统一目标继续进行，未改 Java。

## 布局修复与最终 SPA 验收

- RList 独立 itemGridGap 缺省继承 gridGap；AppList 显式项内 0 / 外层 20，并使用继承行上下文的全宽标准 toolbar。卡片内容支持 shrink，隐藏动作不占 grid 格，原数据链不变。
- `layout-RED.txt` 保存新增属性/配置缺失的失败；实施者最终 5 文件 68/68、typecheck 和定向 lint 通过。主控独立 5 文件 70/70（列表、toolbar、两个目录页与应用切换），6 文件定向 ESLint、正式 ClassModel/lowcode 合同生成、完整 build、verify:rules 与 diff check 通过，独立复审 PASS。没有用 JSDOM 的零尺寸断言伪造浏览器几何结果。
- `spa-card-layout-after.json/png`：D99 卡片宽 192.5px 等于 cell，body 150.5px，内 gap 0、外 gap 20；原生焦点滚动到可视区后，按钮中心命中其 span/button。`spa-all-cards-after.json`：62 张卡片，越界集合为空。
- 按标准卡片“进入应用”真实选择 D99，成功到达服务器管理；从原生用户菜单返回工场，登录态与 62 张卡片保留。正常业务流程没有 reload/goto 导航；开发期间源代码 HMR 与正式业务烟测分开。
- `spa-activation-catalog-network.json`：最终采集 truncated=false，一次 DataView 刷新按 20 条分页 4 次，回读 20/20/20/2，Count=62，全部 HTTP/Code 200。正式请求 Fields、OutputFieldMode=REQUEST、DISTINCT、rowid升序；仅目录 FormKey，不传客户端 app/tenant 头；响应无 IsSys。选择段 Document 请求 0。文件不含密码、Bearer、完整回包或原始权限凭据。
- `spa-d99-navigation-header.png` 只截导航壳和页面标题，避开服务器连接记录。最终停在应用工场目录；没有保存、删除或改写业务数据/元数据。
