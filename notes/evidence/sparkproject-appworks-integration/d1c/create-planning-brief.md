# D1d 原生目录新增闭环：只读方案委派

主控已读当前目录三文件、runtime.save/context/request、native pool/resolver、useTabPages、App 切应用/退出、ProjectNavigationGuard。继续用户既有低阶实施和主控长期利益裁决授权。当前只写本目录 create-dispatch-draft.md，不修改生产/测试/配置，不运行测试/build/browser/后端写。

参考：本目录 crud-feasibility.md、lifecycle-feasibility.md；上位 notes/plan-appworks-control-plane-integration.md。固定参考 Git 842dec4f11b333df904b9a4e26b6566b0802bab8，禁止读参考 dirty worktree。D1c creator 3文件已冻结，主控验收中。

## 主控已定边界

- 下一最小业务闭环仅新增 datasource + 精确 fresh readback，包含所必需原生生命周期，不混 edit/delete、后端/数据库/依赖/治理/AI。
- 普通关闭、关闭其它/全部、single 自动释放与跨应用选择：有草稿或保存中拒绝；必须在导航/激活 side effect 之前预检全部候选。普通 multi-tab 切换保留同实例/草稿，不拦。
- 撤权、owner 绑定变更、logout 属强制失效：立即使旧实例失去提交资格并取消 signal、移出 pool，不能因 dirty 保留旧授权。继续使用现身份失效界面；不引入草稿隔离库/新的恢复框架。不能保证已发到后端的写请求回滚，须明示证据边界。
- 复用 DynamicRouter.assertPageRuntimesClean 作为现 App/guard 公共统一门面，在其内部纳入 native pool。避免为同一 gate 新增平行命名并改所有消费者。resetSystemPageInstances 保留强制失效语义（logout 已依赖），普通切应用仍前置 clean gate；pool.close 防御性拒绝脏/提交中，reconcile/reset 强制取消。
- lifecycle 归原生 pool 每实例，有限 dirty/submitting 状态 + AbortSignal；provider 绑定 wrapper，消费 hook 从包根导出，只有实际目录表单消费者才新增。不要伪造 PageRuntime，不把原 context/字段/回调泄漏给壳；不创建插件框架。检查实际 API 暴露能否更小、目录限制、已有测试 import 路径。
- 表单打开后的草稿要有明确放弃入口；保存期间禁止关闭/重入/搜索换基线。当前 owner 需要 generation/发布 lease、同场景安全应用集合、原 context 私有保存、真实 addActionState；当前目录 query 开始使旧基线失效，旧 lookup 完成不得装回基线。保存必须验证生命周期 signal/current scope/当前 lease/已选应用，prepareNewRow 生成正式 rowid。
- 保存成功 receipt 后按新 rowid fresh query，逐个核对提交字段与可见权限再报告成功；未知提交/回读失败不得自动重试新增，保留 rowid 供只读重核。请核对现 save 返回合同后给出最小状态设计，避免用户点击重试造成重复记录。
- 表单仅 Name、sysid、description，Type 固定 datasource；显式应用选择，无隐式执行应用填充。用当前组件/交互，保持已接受读取、应用筛选、创建人解析。

## 输出

给出精确文件/方法清单、公开契约和生命周期真消费者、按依赖串行最小 RED/GREEN 子步、真正有辨别力测试与主控浏览器场景。若涉及公共根导出同步 import smoke，指出具体既有测试落点。先确认各候选源/直接调用方全文，再写方案。报告只覆盖当前代码可证实的事实；将需要主控裁决的真实冲突集中列出，不自行新增扩展性工程。只写草案，待主控批准后才派写者。

## 主控新增真实竞态（草案必须解决）

App.vue:384 和 ProjectNavigationGuard:65 都是 clean 预检后 await activate；这段等待期间旧页面仍可输入/打开草稿。只在返回后再预检已太迟，因为平台选择已提交新scope。需最小原生页过渡锁：开始切换前同步 clean + 锁住 native 新草稿/提交，失败或取消恢复、成功强制 reset 释放。重叠/迟到的旧切换 finally 不可解锁新切换。不要在 assertClean 只读方法里暗藏永久锁，也不让 raw reset 变成 dirty拒绝。允许草案论证一个有 App/guard 真消费者的窄过渡门面，精确列两调用方及测试；这是修正原“无需改调用方”的前提，不授权编码。还应检查 tab close 预检后 await navigate 的等价窗口，release 前全部候选复检至少防止半释放（如果需要相同过渡锁，说明覆盖）。
