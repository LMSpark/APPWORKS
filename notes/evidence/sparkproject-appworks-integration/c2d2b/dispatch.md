状态：implementing

# C2d2b 壳层切换与直接调用方

前置C2d2a已由主控接受（35平台/28runtime，hash见accepted-files.json）；主控现批准此切片。依据c2-review/shell-selection-findings.md及实际源码，本闭环封闭App壳层选择后清理/导航投影、caller旧成功提示/跳转。main直接URL guard另列C2d2c，不把本项当全链完成。

## 精确范围（10文件）

1. src/services/project/project-shell.ts
2. src/App.vue
3. src/views/tenant/AppList.vue
4. src/views/platform/PlatformApps.vue
5. src/views/platform/PlatformTenantManagement.vue
6. src/layout/AppTabBar.vue
7. tests/app/dev/navigation-sync.test.ts
8. 新建 tests/app/services/project/application-switch.test.ts
9. packages/spark-app/src/router/dynamic.ts（仅reset使既有registration代次失效）
10. tests/runtime/page/runtime/system-page-identity-tabs.test.ts（新增reset与既有refresh重叠的行为用例；必要时调整receipt mock，保留原11用例）

目录核对：src/services根已7子目录，不新增root services子目录；新test放services/project子领域，不在父目录堆文件。不得顺手修改现有跨项目业务、权限、目录数据模型或配置。

## 合同与最小实现

0. 主控新增一个实际源码交叉窗口：A已选中并等待refresh，B开始切换时resetSystemPageInstances目前只锁pool、不增加registrationGeneration；若B还在等待list/root、store仍A，A的旧refresh可通过scope检查并commitOwners，从而提前解除B的reset锁。先用真实deferred导航加载复现RED，再让reset同步作废已有registration代次，复用C2p1的旧结果不提交/旧错误不fallback规则。仅增加当前owner必要失效，不清静态路由、不改变cfg池。测试旧成功/旧失败均不能unlock reset，新切换成功refresh才能恢复owner；然后再推进以下步骤。

1. ProjectSwitchService.switchAndReload返回Promise<LowcodeApplicationSelectionReceipt>，直接复用平台已公开契约，不重复声明receipt/序号工具；interface与内部state不新增public export。
2. App.vue服务在cfg assertPageRuntimesClean成功后才开始新的局部switch意图与native reset。dirty拒绝时不使当前成功操作失效、不reset/dispose、不activate。catalog同步或app异步选择均取得平台receipt。
3. 在激活await恢复后立即检查该switch局部意图+同一个平台receipt；之后才能dispose cfg、写activeProject/settings。平台receipt能感知main直接URL激活等其他入口，即使新目标尚未提交。保持native与cfg池现有职责，别造第二套应用身份。
4. project-shell.reloadAndSyncNavigation接受可选的现有receipt，调用前及await refreshRoutes恢复后、syncCommittedNavigation前检查；失败出口若receipt过时则显式失效，否则原错误透传。原手动无参刷新行为保留。不要在App外层检查后才补救已写入的旧nav。
5. App switch调用带组合assertCurrent的reloadAndSyncNavigation；刷新后再次检查才能返回组合receipt。移除原catch只log后resolve的假成功。组合receipt同时检查App局部意图与平台receipt，必要时Object.freeze防误改；不暴露generation。
6. 六处真实consumer：App home/cross-app、AppList、PlatformApps、PlatformTenantManagement、AppTabBar。每处await switch恢复后同步receipt.assertCurrent，再发起目标router.push；两者之间不得await。已有catch保留，缺catch补本页可见ElMessage错误，不新增全局handler。home/cross-app不得留下未处理Promise rejection。
7. AppList成功提示应在router.push确实成功后再发，并在该await后再次assertCurrent；被取消/过时导航不得提示成功。AppTabBar保留既有router.push失败→拒绝→cfg/native实例保留的合同。其他页面不新增无关成功提示；错误沿现有页面风格可见。

## 必须行为测试与最小顺序

先project-shell旧nav投影RED/GREEN；再真实App的switch owner；最后逐项真实consumer恢复边界。每次改一个点后立即最小验证，不一次改完六处再测。

- navigation-sync：无参refresh仍只一次HTTP/壳更新；带receipt，refresh完成或失败前更换scope不写旧nav；仍current失败为同一原error。
- 复用C2c文件的真实App/MemoryRouter/动态路由/注入service模式，新的测试按独立项目服务领域组织；不要导出生产setup仅供测试。可stub无关layout/SSE/主题组件，但被验收App、caller及Router必须真实运行。
- dirty拒绝在reset/activate/dispose之前；当前导航refresh失败reject，无成功toast/push；A等待时B启动，A不能dispose、写settings/nav、resolve成功。
- 关键caller窗口：真实App switch A最终检查已通过并返回真receipt，包装其公开交付边界，在调用者await continuation前queueMicrotask启动B；A consumer恢复后不得push A或toast成功。不是只测一个序号helper，也不能把平台先拒绝当成caller验证。
- 实际AppList/PlatformApps/PlatformTenantManagement/AppTabBar及App home/cross-app，各覆盖新的assert接线；用真实事件触发和真实consumer函数（可mock网络/消息，禁止测试自造等效consumer）。至少对关键caller临时移除那处assert确认测试RED，恢复GREEN；正常未抢占路径只导航一次。
- 实际App home返回catalog与应用切换共享owner；main发起的platform新intent也能让shell receipt失效（无需本批修改main）。

## 验证与边界

target tests：新application-switch、navigation-sync、现有system-page-identity-tabs/page-runtime-tabs与navigation-platform-paths。随后root typecheck、六production文件定向lint、ai-codegen/dirs。保留raw stdout+exitCode；先完成再由主控决定组合root/package/build/browser一次验收，不重复跑全量。

源文件完整阅读与直接caller清单复核后开工；未知需要扩scope先回报。不commit/push/建分支，不改数据/后端/依赖，不把正常手动刷新也强制绑定某一次选择。不修改原cfg dirty/native close保护。
