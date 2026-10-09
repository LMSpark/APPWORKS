# D1d 新增闭环实施委派草案

状态：draft

本草案仅涵盖 Base_DataSet 新增、精确 fresh readback，以及真实目录表单所需的原生生命周期。只读撰写；未改生产/测试/配置，未运行测试、构建、浏览器或后端写。主控批准后再派实现者；实现前重读验收后的当前源文件。

## 结论与闭环

唯一业务消费者是现有原生数据空间目录页，必须真实经过 native identity pool provider、dirty/submitting 状态、owner 私有原 context、runtime.save、按正式主键 fresh query。孤立的 mock lifecycle 测试或伪造 PageRuntime 都不能验收。

闭环：显式选择同场景应用并填 Name/description；用与当前已发布列表绑定的原 context 检查 addActionState；prepareNewRow 产生正式 rowid；runtime.save 使用原 context 和 lifecycle AbortSignal；receipt 后按 rowid 精确 query；仅唯一记录且 sysid/Name/Type/description 均 visible 且一致时显示成功。receipt/readback 不确定则保留 rowid，只能只读核对，不能再次 create。撤权/owner 替换立即取消旧 signal、旧实例离池、旧 UI 失去提交资格。已到达后端的写客户端不能回滚。

## 精确文件与方法

### 生产文件

1. `src/lowcode/data-space/lowcode-data-space-catalog.ts`
   - `query` 开始时递增私有 generation、撤销旧 lease/context 基线；只允许仍最新且 scope 有效的完成查询安装原 context。返回投影行与不含权限材料的 lease。迟到 A 不可覆盖已发布 B。
   - `applications` 只更新同场景安全 sysid 集合，不覆盖目录 generation/context。
   - 新增单行 create command：验证 scope、已发布 lease、signal、已选 sysid 属于本轮同场景应用集合、addActionState 为 enabled；只提交 sysid/Name/固定 Type datasource/description。用原 context 的 `prepareNewRow` 取得正式 rowid 后才 save。
   - save 后以正式 rowid 精确 query，核验唯一目标行和各提交字段 `read === visible` 且相等。save 不确定时不可重试；保存成功会废弃原 context，只有新的目录 query 才建立下次写基线。
2. `packages/spark-app/src/router/system-page-identity/system-page-identity-pool.ts`
   - pool entry 持有限 dirty/submitting 与取消 controller；wrapper 提供绑定具体实例的窄 provider/hook。hook 只允许报告 dirty/submitting、读取当前 signal，不暴露业务 context/表单值。
   - 普通 `close` 防御拒绝 dirty/submitting；reset/reconcile 是强制失效，取消 signal 后移除实例。owner reconcile 先确定失效集合再提交，避免半更新。
3. `packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts`
   - `replaceOwners` 配合 pool reconcile，确保旧 owner 下实例先失效，不能晚到提交。
4. `packages/spark-app/src/router/dynamic.ts`
   - 保留 `assertPageRuntimesClean` 作为唯一 App/guard clean 门面，在其内部汇总 cfg PageRuntime 与 native pool。按 id 查询的 native view提供有限状态供候选 tab 检查；关闭一个干净 tab 不应被无关脏 tab 全局阻断。
   - 增加精确、可释放的 native scope-transition lease/lock。预检成功后，在任何 await 前锁住会被 scope 销毁的 native entries，阻止新开页/输入草稿；完成/失败 finally 只能释放同一 lease，不能误解锁后来 owner 的新锁。reset/logout 仍强制失效。
5. `packages/spark-app/src/navigation/useTabPages.ts`
   - `assertClean(candidates)` 对 native 候选按 instance id 检查；close/closeOthers/closeAll/single-mode 自动释放在导航前一次校验全部候选。
   - `close` 的 navigate 是异步窗口：对将释放的实例建立相同实例绑定的短期 transition lock，或在导航后、release 前原子复检并保证失败不遗留错误路由；旧 finally 不得解锁新 lease。普通 multi-tab `switchTo` 保持实例与草稿，不 gate。
6. `packages/spark-app/src/index.ts`
   - 显式导出实际目录 consumer 的 lifecycle hook/key/type，不导出 pool internals，不加 package 子路径。
   - 当前 `packages/spark-app/package.json` 只导出根入口，tsconfig/vite/vitest 已有根 alias，无需新增配置。
7. `src/App.vue` 与 `src/services/project/navigation/project-navigation-guard.ts`
   - 跨应用选择前调用共同 `assertPageRuntimesClean`，并持有精确 transition lease 覆盖整个 `await activate`/导航/销毁窗口；锁在 side effect 前建立，finally 按 lease 身份释放。失败要保留旧 scope/实例。
   - logout/撤权是强制失效，不被 dirty gate 阻断；旧 signal 取消。
8. `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`
   - 从 package root 消费 lifecycle hook，真实表单 dirty/save promise 同步到同一 native instance。表单只有 Name、description、显式 sysid；Type 固定 datasource；提供明确放弃入口。
   - 保存中禁止重入、关闭、搜索/筛选/分页改变基线。查询/场景/owner/revision 失效后旧回调不得发布；状态在 await 前建立且 finally 只清理自身 lease。
   - unknown/readback-required 保留 rowid，只提供只读重核，不给重试新增。

### 测试文件

- `tests/runtime/page/runtime/system-page-identity-tabs.test.ts`：真实 DynamicRouter/Resolver/pool wrapper 与 native lifecycle consumer；验证共同 App/guard clean gate、scope transition await 窗口中不能新开/输入草稿、失败恢复、旧 finally 不解锁新 owner lease、强制 reset/reconcile abort。现存只 spy cfg dirty gate 的测试不够。
- `tests/page/runtime/page-runtime-tabs.test.ts`：useTabPages 接真实 registered native instance，覆盖单个/批量 close 与 single-mode 候选脏时在导航前拒绝；干净无关 tab 可关；普通 multi-tab switch 保留同实例草稿；close await 窗口无旧路由或错误解锁。
- `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts`：generation/lease A 慢于 B、query 开始撤基线、scope/signal/app/addActionState 拒绝均不 save；验证实际正式主键字段、关联 ROWID 与 runtime 实际 rowid 的映射合同；save 仅一次、原 context/prepareNewRow、精确 fresh query 和字段权限；receipt/readback 不确定不二次 save。
- 根入口 import smoke：在 `system-page-identity-tabs.test.ts` 从 `@spark-appworks/spark-app` 根入口导入并由真实 pool fixture 消费 hook；当前没有独立 spark-app import smoke 文件，不新增子路径/配置。

## 串行 RED/GREEN 子步

每步先添加失败断言、实现最小闭环、立即运行对应聚焦测试，再进入下一步；此草案阶段不运行测试。

1. **Pool lifecycle**：RED 实际 wrapper 下独立 dirty/submitting、close 阻断、reset/reconcile abort；GREEN 实现 entry/provider/hook、根导出与根入口 smoke。
2. **Router gate 与 transition lease**：RED 原 clean 门面聚合 native；scope transition 在 await activate 期间阻止新 native instance/草稿；旧 finally 不释放新 lease；失败释放自身锁并保留旧 scope。GREEN 改 dynamic/App/guard，仍只用 `assertPageRuntimesClean`。
3. **Tab 关闭窗口**：RED 真实候选批量预检、close await 导航窗口原子性及多 tab switch 保留；GREEN 改 useTabPages，沿用现有失败提示。
4. **强制失效**：RED logout/撤权/owner reconcile/reset 取消旧 signal、旧 consumer 再 save 被拒；GREEN 接 resolver/reset 强制语义，不保留旧 dirty 草稿授权。
5. **Catalog owner**：RED 先测 rowid 模型合同，区分正式主键、关联 ROWID、runtime receipt/readback 实际 rowid；继而测 stale lease、权限、应用、安全 signal、save 单次和 readback；GREEN 仅实现单条新增及精确重核。
6. **真实页面消费者**：RED/GREEN 验证组件表单状态驱动实际 native pool 生命周期；保存期间不能改查询基线；放弃与精确回读才清 dirty。每个生产切片立即运行该切片的聚焦测试。
7. **整合**：运行这些既有聚焦测试与适用类型检查。部署/专用测试数据具备后才做浏览器写入验收。若冻结源码与当前 D1c 验收基线不一致，暂停由主控对齐。

## 高辨别力浏览器场景

使用主控安排的专用、明确标识、可回收测试资源和写入身份，不修改/删除既有业务记录。

1. 目录新增显式选同场景应用，填唯一标记 Name/description；切到其他 tab 再返回，原草稿仍在。
2. dirty 时尝试单 tab、其他、全部关闭及 single-mode 自动释放和应用切换，均在导航/激活前拒绝；明确放弃后可继续。关闭无关干净 tab 应成功。
3. 人为延迟 `activate`，在 await 窗口尝试新开原生页并输入；必须被 transition lock 阻止。再启动较新 owner lease，旧 transition finally 到达不得解锁它。失败 activate 只释放旧 lease且旧 scope仍可用。
4. 提交期间重复提交、关闭、筛选/分页换基线均被阻止；receipt 后按返回/正式 rowid fresh query，唯一且提交字段可见相等才报成功。
5. 受控 readback 失败时保留 rowid，仅只读重核；不得重发 save。logout/撤权中止旧 signal、移除旧实例并禁止旧 UI 再提交/发布；记录已送达后端请求无法客户端回滚。
6. addActionState disabled 或 sysid 不属同场景安全应用集合时不调用 save。管理员只读 allowAdd/应用列表证据不代表写权限。

## 尚需主控确认的硬前提

D1c 正式主键/关联 ROWID/runtime 实际 rowid 尚在生产拒收修正，owner 源码冻结待 writer。实施前必须以修正后的当前模型和真实 receipt/query 形态锁定字段映射，不得把 create 返回主键假定为 ROWID。主控还需提供真实可逆测试行资源、写入身份与清理窗口；现存 admin 只读证据不能替代。已送达后端的 create 可能在客户端 abort 后完成，因此验收是旧 UI 失去提交资格并用 rowid 只读核对，不承诺事务回滚。
