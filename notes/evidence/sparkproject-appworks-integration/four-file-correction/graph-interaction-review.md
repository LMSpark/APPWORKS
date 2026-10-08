# 图交互与布局主控验收

状态：本轮限定本地验证通过；根类型返修已核实，真实浏览器及完整图验收未完成。完整页面及全部集成仍 implementing。

## 本轮边界

仅 graph-interaction-brief.md 的七文件：本页规则/脚本/样式、窄图组件及 props、两现有测试。模型关系仍使用完整过滤表达式，节点移动不改变关系定义、前端输入级联或 DataView 元数据。

## 主控复核与返修

- DataView 编辑缓冲之外的 pending 更新/新增也须阻止布局冲突，不能只扫描初始 snapshot.rows。已改用当前公共 hasEditingChanges/hasPendingChanges。
- 拖动在权限/上下文变化或页面拒收时须恢复 Vue Flow 投影，不能仅不发事件而留下错位预览；组件已加入上下文/禁用变化恢复及拖动后与 props 对齐。
- 冲突状态须在页级可见，不能只放隐藏的关系图页签；当前已移至页签外。
- 没有 pointsList 的边也可携带显式端点/文本坐标，节点移动须同步这些几何并保留扩展属性；已有定向反例。坐标不完整的扩展对象现保留原样，仅移动有限的明确坐标。graph-interaction-anchor-red.log 证明原实现把 anchor 对象添上 x/y:null，graph-interaction-anchor-green.log 证明修复。
- 首次根类型失败仅落在新增测试：返回 unknown 的脚本函数直接访问 props/children，以及可能缺失的 Vue Flow 节点。保留 graph-interaction-root-typecheck.log，不放宽类型或删行为断言。

## 已取得的验证记录

- 最终返修后两套测试 64/64（10:36:04 开始，17.89 秒）、精确 ESLint 退出 0，见 graph-interaction-final-tests.log / graph-interaction-final-lint.log；主控已核新测试、生产修复及实际输出。JSDOM 的 requestSubmit 未实现提示不作为浏览器成功证据。
- 最终根类型退出 0：graph-interaction-final-root-typecheck.log。首次失败日志保留，未用类型断言或放宽编译选项掩盖问题。
- 主控 pages-config 退出 0：graph-interaction-root-pages.log。
- 主控 AI 代码门禁退出 0（1002 文件）：graph-interaction-root-ai-codegen.log。
- 登录与旧样板读取成功，但当前远端页面未包含本轮入口且目标无布局文件；详见 graph-browser-readiness.md。未作线上写入，不将此称为新图浏览器验收。

## 尚未完成

真实浏览器拖动/保存/重开、保存后完整页面重开场景、缺失布局显式创建、新关系创建、自动排列和边手动调整，以及其余整页业务。本轮渲染测试证明组件事件到页面保存调用及输出原文，未证明真实鼠标拖动、真实后端写入或重开整页。模型关系、命名视图消费、多父字段输入级联的边界保持原计划，不能以本轮局部测试缩减全量目标。
