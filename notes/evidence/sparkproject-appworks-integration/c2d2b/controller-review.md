# C2d2b 实施中复核

状态：尚未冻结，验收前核对本单

- reset/已有refresh重叠：已看到真实old-success和old-failure的RED及增加registrationGeneration后的GREEN，两项行为通过；不是静态推断。
- App mock目录状态必须与真实readLowcodePrincipal一致，applicationId=null，不把homepage当已选择app。对应wrapper mock的application.get空上下文也应保持一致。
- 后四个consumer（AppList、PlatformApps、Tenant、TabBar）当前中间测试只查assertCurrent次数与正常push，不足证明失效行为；需实际Vue事件+已签发receipt的微任务失效，断言不push/no success/错误可见，保留正常路径。调用次数不可替代行为验收。
- AppList真实Router取消后不成功；TabBar旧receipt不改变currentRoute、不错误释放仍合法tab。
- App owner必须验证dirty在reset/activate前、activation pending被新switch抢占后无晚dispose/settings写入、当前reload失败reject。已有C2c dirty用例不替代新增正常/失败路径。
- App home/cross-app的public service delivery包装方式正确：await真实switch得到真组合receipt后queueMicrotask发起B，在caller恢复时校验。最终至少关键caller移除其检查应RED，防止又由内层提前失败。
- applist/platform中间result.json有exitCode，但未观察到对应raw stdout文件；最终报告需明确哪些原始输出实际保留，缺失不能写成已有。必要补关键可复现局部取证，不无故重跑全量。

仍限dispatch10文件，后续main guard另批。不为满足测试修改生产接口或复制等效consumer。

补充复核：新的 application-switch.test.ts 曾以 as string|null、as Array 声明状态，并 mock useTabPages 的 tabs/switchTo；已要求改具名状态类型、恢复真实 composable。真实 useTabPages 会清除已知的其他 projectId 页签，跨应用 caller 夹具应利用其支持的无 projectId legacy 页签：A 字面量应用路径，B 动态参数应用路径。A 可保留，B 的 params.projectId 可触发 AppTabBar 的真实跨应用切换。不能修改生产 composable 迎合夹具。

主控验收：10 文件最终哈希全部匹配冻结清单。真实 useTabPages 已恢复，stale 夹具在 A 页挂载后再导航到 B，独立用例通过；全部最终 7 文件/52 项、typecheck、10 文件 lint、ai-codegen 976、dirs 输出 exit 0。原 27 个不在本切片范围的已验收文件哈希未漂移。接受本切片；C2d1/2a/2b 的组合全量与生产浏览器待 C2d2c 一起验收，未声称全 29 项或真实写回完成。
