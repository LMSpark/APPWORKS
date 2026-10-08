状态：implementing

# C2d2d 让守卫取消到达应用提交边界

主控据用户“遇到问题按长期利益选择”的既有授权，批准此修订。C2d2c 的原3文件实现保留为本切片基线，但其完成声明失效；不整文件回滚其它已验收贡献。真实RED见 c2d2c/real-cross-owner-red.stdout.log：最新URL APP-A，实际store APP-B，合法native实例null。根因是guard局部序号没有到达platform提交边界，且在激活前提前reset破坏了仍当前的APP-A实例。

## 精确范围（7文件）

1. packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts：activateApplication接受第二可选 AbortSignal；将signal纳入私有selection fence，所有现有检查点及成功receipt检查同时检查signal。取消后禁止进入下一请求/提交，不要求改HTTP传输或中断已发请求。selectApplication单参既有合同保留。
2. packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts：目录等待、root等待、已abort入口、commit后的receipt等取消行为，旧无signal行为回归保留。
3. src/lowcode/lowcode-runtime.ts：activateLowcodeApplication同样接受可选signal并转交平台，继续返回原receipt并在await后核验；catalog导航明确写projectId=APPLICATION_CATALOG_PROJECT_ID，store仍null，标识导航归属以支持实际owner核对。
4. tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts：保留真实联合RED转GREEN，补提交后但导航未装配的实际交叉窗口；验证signal传递与catalog导航sentinel/执行身份null分离。
5. src/services/project/navigation/project-navigation-guard.ts：每次resolve撤销上一AbortController，建立本次controller；将标准signal传给激活。原本局部revision可由signal.aborted替代，避免两套取消事实。success/catch过时只取消本次route，当前错误继续原样reject。
6. tests/runtime/auth-nav/application/project-navigation-guard.test.ts：适配真实合同（mock不能忽略signal还晚提交），保留12项原行为，添加同app但导航owner落后时的恢复。
7. src/main.ts：保留C2d2c启动receipt与原beforeMount接线，原则上无需进一步编辑；列入最终整体hash验收。

不动App切换服务/消费者、DynamicRouter、权限、后端、依赖或额外包导出。AbortSignal是已有浏览器标准类型，有真实main guard调用方，不新增专用错误类/取消服务/当前receipt getter。

## 顺序与不变量

1. signal已abort时在开始平台新intent前显式throwIfAborted，不让一个无效新操作撤销合法当前receipt。私有fence检查及签发receipt同时检查signal；目录/root请求成功和失败出口都保留已有检查。无signal调用完全保留既有意图/revision语义。signal只取消本次选择，不恢复或回滚store，也不自动重试。
2. guard仍先cfg assertClean，再await激活；将native reset移至选择receipt有效之后、cfg dispose之前。这样尚未提交的旧选择被取消时，原应用页面及owner继续有效。commit后立刻reset使旧refresh代次失效，后续refresh重新发布新owner；不要删除C2d2b的reset generation增量。
3. URL app与已选app相同还不足以证明导航已装配。当前actual DynamicRouter.getNavTree()?.projectId若不同于目标app（包括null树），按同一受signal约束的选择→reset→dispose→refresh流程重新对齐，再replace原path/query/hash；普通same-app且owner一致不额外请求。catalog导航现在显式归属homepage，principal/application store仍null，禁止以homepage当真正已选app。
4. 这个owner核对覆盖：旧选择已提交B但guard/runtime await尚未恢复，新导航恰好也去B。新导航不能因principal已是B就跳过装配；旧signal已abort、旧continuation停止，新B明确完成合法owner装配。保持公共工具/未登录/租户纠正分支原语义、守卫注册顺序及query/hash原值。
5. 当前导航refresh失败仍走原fallback与onError；过时guard不向新导航报成功或旧错误。对于真实测试，loader应按当前实际app提供导航，不能把固定APP-A树当正常APP-B刷新响应。

## 最小验证

先平台signal四类RED/GREEN，再runtime转发与现有真实联合RED转GREEN；之后guard延后reset/owner不一致恢复分步验证。每次最小改动后先局部验证。关键的新联合用例需要真实LowcodeApi、runtime、Guard、DynamicRouter；只替身网络方法。断言URL + 实际application store + 原生owner实例三者联合一致；不能只看currentRoute或assert调用次数。

平台取消场景至少覆盖list pending（不再查root）、root pending（不store.save）、已abort入口不撤销旧receipt、已commit后abort使receipt失效但不回滚已提交store。runtime需要验证signal确实到达真实平台，不只调用参数次数。guard过时catch与当前error保持已有行为。

完成后root/package typecheck、所有改动目标lint、平台专用测试/两组runtime guard tests、c2d2b相关52项、ai-codegen/dirs。这次平台有新改动，API包全量18/579需更新后由主控组合跑；子代理不跑全量/build/browser。提供最终7文件hash/report和实际stdout，冻结。

若“选中app与导航归属”检查引入重复redirect，必须先真实复现、说明loader/tree identity差异，不能加随意重试次数或吞异常。首次发现超出本7文件即回报主控。当前有唯一明确修复方向，无需重复用户已确认的8项选择。

主控补充：同app owner核对引入重新装配后，当前成功refresh必须确实得到目标projectId的导航树，否则明确抛出导航归属不一致错误，不返回同一目标造成无限redirect。缺DynamicRouter也应在需装配的租户分支显式报缺宿主；正常公共分支不强加此依赖。增加一个真实router+错误归属loader的行为测试确认只失败一次，错误进入onError，无重复目录请求。此检查仅封闭新恢复分支的不变量，不加入任意重试次数。
