# 数据空间目录查询绑定执行结果

## 修改范围

按 `notes/plan-data-space-query-bindings.md` 完成五个批准目标：新增正式 7AB `pagedata.json`，更新目录 `script.js`、`rule.json`、`style.css`，并扩展 `tests/runtime/page/catalog/data-space-four-file.test.ts`。实现使用原 DataView 查询所有者和字段权限、当前 `r-dialog` 组件 API、完整祖先路径投影及关闭/目标变化失效保护；未改后端、宿主或其他页面。

## 验证

- `pnpm run typecheck`：通过。
- `pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts`：通过。
- `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts`：1 个文件，64/64 测试通过。
- `pnpm exec vitest run tests/ui/renderer/renderer-dialog-drawer-steps.test.ts`：1 个文件，8/8 测试通过。
- `pnpm run verify:pages-config`、`pnpm run verify:ai-codegen`、`pnpm run verify:dirs`：均通过。

## 已覆盖的计划行为

测试实际覆盖 7AB 查询配置与请求字段、当前 SysId 过滤、rowid 排序及两页完整读取；0 绑定成功态、缺失第三场景错误、目录身份字段不可读、7 个蓝图字段隐藏/脱敏、错误应用 SysId、重复/缺失 rowid、主键与 rowid 不一致、缺少 conid、父节点缺失/循环、缺总数和第二页截断均拒绝输出部分路径；还覆盖目录行切换/刷新/sysid 变化、7AB rows 替换、query owner scope 撤权、关闭期间 busy 保持到原查询 finally、迟到结果不回填，以及真实 Renderer/r-dialog 打开、路径渲染、关闭和关闭期间的迟到响应。

## 仍需主控验收

本次没有运行浏览器或线上写入/回读；主控需按计划使用已保留的 `pilot-binding-remote-before.json` 做在线资产基线核对和部署回读，并完成管理员三场景真实浏览器验收。上述本地验证不能代替线上验收。

`git diff --check` 曾扫描到既有无关 `src/views/tenant/AppList.vue` 的行尾空白；本次五个目标均未因此扩改。未执行全量构建、提交、推送或建分支。

## 主控签收（2026-10-08 02:38）

主控逐项审查差异，并要求修复两个延迟测试的真实挂起/第二次请求信号问题及沿compiler类型声明。最终独立复跑2文件72项通过，见pilot-binding-root-tests.log。未重复全量测试/build。

在线先比6资产原文，新增7AB共享配置、保存目录三文件后6项回读一致（pilot-deploy-bindings.json）。三场景工具URL实际查询84/84蓝图行，显示1条：`软件工坊[AppWorks] / 数据空间管理`，节点ID90A，导航地址与源相同；关窗重开、整页刷新再次查询一致，复制API仍19行且与已验文本相同。4次GetData均HTTP200、0业务写、0console error，见pilot-binding-online.json/png。

计划中预期根标题“元数据管理”来自应用目录AppDesc；正式蓝图FunName是“软件工坊[AppWorks]”，实际投影正确，已按源码和线上行核准而非改代码凑预期。首次自动化在筛选完成前选择旧行被随后响应失效，等待1-1分页结果后普通选择通过；不以点击旧行充当功能失败。

冻结SHA256：7AB pagedata `4B9B9BBDCF87B175D6F63CF2A562697F6FE7D80A9E13FDDF40685005E30D0F3D`；目录rule `82448FF3231D61E2E91A44D9AF5E111095D439392DA318D974C7283DCE6A1DCB`，script `23EC0A53BDD5D7CAD496EE91033D2D5832FF62F1678F6832352C09FEE1562893`，style `08659B5C3395783B2FDC52FB91AD7A6074FD2DE34BBD299372AC51AAB68C78DF`；catalog test `FAE5A7D92FB9517D826294E7EB5FBC5F8E670BF607C5156098AB89A44FB9647B`。

知识候选：完整祖先路径依赖全应用蓝图集合；当前r-dialog API可供四文件使用，隔离样式在线有效；迟到测试必须有对应请求的可控gate。待用户确认再写knowledge。完成子计划按AGENTS删除；M0设计工作台、正式入口和实际删除仍未完成，不能签署整页零回归。
