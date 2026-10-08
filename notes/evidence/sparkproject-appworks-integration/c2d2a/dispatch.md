状态：implementing

# C2d2a 贯通目录与应用选择凭据

依赖：C2d1已冻结并由主控接受，见c2d1/accepted-files.json。用户总授权继续有效；主控现批准此切片，仍只有一个写代理。目的仅将平台当前性凭据贯通到runtime，并让目录选择共享同一owner意图。App/main调用方副作用另列C2d2b/C2d2c，不能提前签署全链验收。

## 精确范围（5文件）

1. packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts
2. packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts
3. packages/spark-lowcode-api/src/index.ts
4. src/lowcode/lowcode-runtime.ts（仅两个选择wrapper）
5. tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts

## 已读源码与决策

平台C2d1已有独立selection intent；application.clear增加app revision但不增加该intent。目录A完成clear后，如果B只启动list而尚未save，A只看app revision仍有效，会误导航回目录。因此目录也须同平台owner开始新意图并返回receipt。

采用一个公开跨包契约 `LowcodeApplicationSelectionReceipt`，仅有同步 assertCurrent():void。在platform-api首次声明、index显式type export，runtime两个wrapper实际消费；不导出内部fence/世代。激活现有结果组合此契约及application/root字段；应用结果仍由原激活门面产生，不删除selectApplication的原string合同。

新增同步 platform.enterApplicationCatalog()：沿用C2d1的begin/current机制，开始新意图、clear application、签发期望context=null的receipt；该receipt必须在后续任何选择意图（尚未save）、clear、session替换/登出、过期或application变为非null时失效。普通同身份token refresh不使其失效。复用最小private签发逻辑，避免为app/catalog复制两套当前性算法；不增加通用任务框架或current-receipt getter。

activateLowcodeApplication现在返回Promise<LowcodeApplicationSelectionReceipt>，保留await恢复后的assert；直接返回原平台receipt的结构，不丢弃它。enterLowcodeApplicationCatalog返回同步receipt，委托平台目录方法，取代直接clear。现有App/main调用点全部只await或调用、从不读取application返回值，下一切片逐点加消费检查。两个wrapper语义变更必须体现在类型与JSDoc，不加保持旧application返回的无用别名。

## 验证闭环

先补目录receipt失效行为RED，再改platform并立即GREEN；再贯通runtime与index并跑wrapper行为，不连续散射。

- 已有app activation/selection未完成时目录意图使其失效。
- 目录receipt正常可用；B activation在首个await前即使目录receipt失效，不能等B commit。
- 新目录意图使旧目录receipt失效；session/app clear与替换、同app root外部变更各沿原规则；普通token refresh正常。
- runtime返回平台同一receipt（身份相同），支持真实deferred.resolve+queueMicrotask在wrapper恢复前使其失效；错误不吞。
- 现有selectApplication返回root合同与C2d1所有行为继续通过。

命令：platform-api包局部、根lowcode-runtime-navigation局部；root和包typecheck；变动生产文件定向eslint；ai-codegen/dirs。所有日志及exitCode保留本目录，冻结5文件hash。无根全量/build/browser重复，等C2d2b/c组合后由主控一次验收。

## 约束

每文件修改前重新读当前完整内容和直接调用方；不动store/正常refresh逻辑/后端/数据/依赖。边界需要扩展先回报。不得commit/push/建分支。C2d1通过的断言和测试不能因本契约调整丢失。

