# 应用选择与调用方迟到导航：待收敛闭环

这是只读风险记录，不是实施授权切片。C2p1/C2p2 已保护导航读取和发布，不代表应用选择链已隔离全部并发意图。

当前源码事实：

- `src/lowcode/lowcode-runtime.ts` 的 `activateLowcodeApplication` 先 await `listApplications`，再 await `platform.selectApplication`；没有选择意图代次。
- `packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts` 的 `selectApplication` await `resolveNavigationRootId` 后直接 `application.save`；切目录、换会话或新的选择开始后，旧根结果仍可能保存。
- `src/App.vue` 的 `switchAndReload` 在选择返回后 dispose cfg、更新activeProjectId/设置、await导航；reload失败仅console.error，不向调用者传播。调用者可能显示成功并继续跳转。
- 真实调用者包括 `src/main.ts` 启动预同步与auth guard，`App.vue` home/cross-app，`src/views/tenant/AppList.vue`，`src/views/platform/PlatformTenantManagement.vue`、`PlatformApps.vue`，`src/layout/AppTabBar.vue`。仅在一个UI按钮禁用不能覆盖整个控制路径。

后续最小验证应先以 deferred 复现：A目录晚于B完成、A根晚于B完成、等待期间进目录/退出/重新登录、选择已提交但旧调用者仍在await导航。旧任务不得保存、显示切换成功或将URL推回旧应用；真实当前请求失败应显式传播，cfg dirty拒绝切换的合同不变。稳定选择、正常token刷新不应误判。

长期决策应在实际持有选择状态的owner收束意图与提交，调用方在它自己await后的URL导航边界也需证明结果仍当前；不要靠替换任意全局错误handler、重复重试或吞错。需要进一步完整读取平台API与所有直接调用方/测试后确定精确文件，禁止在正在实施的C2a中顺手修复。
