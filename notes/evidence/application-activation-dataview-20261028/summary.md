# 应用选择目录 DataView 统一与 SPA 验证

## 目录读取核心（已验证，布局验收继续进行）

- 现有应用选择 fence 内调用宿主构造注入的 `readApplicationById`，缺配置明确失败，不回退旧列表 HTTP。共享 `readLowcodeApplicationById` 经正式 DataSet/DataView 查询并释放资源；显式目标导航删除重复实现，复用同一 helper。
- 可选应用元信息未返回/不可读时省略，不推断 IsSys=false 或从登录会话拼造归属；store 兼容旧完整快照，拒绝显式非法可选字段；项目设置未知分类省略，已知 true/false 行为保留。现有小写字段别名回退继续使用。
- RED 包级 7 fail/58 pass，helper 7 fail/2 pass（后者失败于新 helper 导出缺失，不能当成已执行行为证明）；项目类型消费反例另见 `RED-project-settings.txt`。GREEN 原始输出为实施者 API 66、应用侧 67、typecheck 与包 lint。
- 主控独立复跑 API/上下文四文件 70/70、导航/切换/目录/分类/两个目录页面六文件 82/82 通过；独立复审 PASS。主控 app lint 另发现名称 `||` 与未用导入三项错误，交回修正；共享 helper 10/10、两个源码 lint 通过，窄复审 ADDRESSED。名称仍按非空 description→code→id 回退。
- 主控完整 `build`、修正后的 `build:fe`、`verify:rules`、正式 ClassModel 生成及 lowcode 合同生成通过。ClassModel 981 文件、2017 symbols、1614 index entries；lowcode 611 endpoints、211 consumers；产物未手改。保留既有 AI model spec 2 warnings/1 info 和 CodeMirror 动态导入告警。
- 权限测试经正式 `lingma_sys_params.h` 解析到 DataView，不使用 fieldAccess mock；r 为必填而非读取白名单。重复回包可在正式权限/查询层或 helper 层明确拒绝，不为了匹配错误文字手工添加 DataView 行。metadata stale 只证明装配前停止；已创建 DataSet 的 query stale/error/重复拒绝覆盖销毁。

## 真实 SPA 已取得的证据与未通过项

- 使用既有授权账号建立本地会话，目录 62 条。标准平台表格进入 D99，原生导航到服务器管理；通过原生用户菜单“应用工场主页”返回目录，仍显示登录用户与 62 张卡片，没有业务数据写入或整页刷新。
- 卡片再次点击“进入”无请求/导航。现场证据 `spa-card-overflow-before.json/png`：实际 cell 192.5px，card 502px，内部 24 列和 20px gap 迫使 body 达 460px；按钮中心命中后续卡片 body。该布局缺陷仍需标准组件与页面配置修复，不作为目录 reader 失败，也不宣称卡片验收通过。
- 第一轮网络观察因开发模块请求挤出缓冲而 `truncated:true`，不能证明完整选择请求链；最终稳定代码后重采，禁止以截断记录宣称无旧查询。
- 保留旁路：导航根 `resolveNavigationRootId` 仍直接 GetData；projectReferences 与 project-settings 仍有旧目录读取；公开 selectApplication 的旧对象入口尚未纳入本批。整体统一目标继续进行，未改 Java。
