状态：draft

# C2d2 只读设计复核任务

读取 c2d1/dispatch.md（平台选择owner已有裁决，唯一写代理正在执行）和 application-activation-dispatch.md。不要改任何生产/测试文件，不跑测试。用户已授权主控选择长期收益方案。

主控倾向 receipt：平台返回assertCurrent，runtime需要将receipt传到App/main，目录clear也要形成同owner可失效的receipt；shell switch成功返回receipt，所有await后的toast/push先同步assertCurrent。禁止只靠callee resolve判断。请独立复核以下具体问题并输出 c2-review/shell-selection-findings.md：

1. 如何让目录切换意图、平台应用激活、App shell切换、main URL guard共享同一当前性事实？只加App私有序号不能检测main发起但未提交的选择。C2d1新平台方法的receipt是否足够，目录需要平台具名selectCatalog方法还是现有application.clear后捕获revision就够？必须解释目录receipt为何在B新意图但尚未save时失效。
2. App.reloadNavigation await reloadAndSyncNavigation 后还有壳投影；project-shell.reloadAndSyncNavigation await refreshRoutes后写nav。最少需要在哪些await恢复点校验，给源码行证据和精确候选文件；不修改正常手动refresh调用合同。
3. main beforeEach可能在A激活后等待刷新时遇到B导航。B若仍是当前store同app不会走activation，A是否还可返回旧redirect？主控要求guard每次进入即递增局部序号、当前selection receipt加双fence，过时返回false，当前错误透传。复核与VueRouter真实取消行为的结合，不假设只比to.path即可。
4. 消费者AppList/PlatformApps/PlatformTenantManagement/AppTabBar/App home/cross-app，列出success副作用并确认receipt检查在最后await之后；应避免增加多次无意义重复assert但不能漏微任务间隙。补错误可见，不能未处理rejection。
5. 复用真实App harness与源码现有测试方式，给最少行为测试路径与可构造deferred/queueMicrotask时序；建议按共享owner→shell调用者→main guard三个最小闭环顺序，但不可中间宣称端到端完成。

只输出当前源码可确认的风险/建议，尽量简短。不得创建新公共抽象/代码、不得修改C2d1四文件。完成即等待。
