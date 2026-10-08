# 原生系统页写表单生命周期：只读复核

只读准备，不实施、不测试、不构建、不访问后端。输出唯一 `notes/evidence/sparkproject-appworks-integration/d1c/lifecycle-feasibility.md`。请复用本目录CRUD研读，不重复完整搜索。

主控读到 `packages/spark-app/src/router/system-page-identity/system-page-identity-pool.ts` 当前 SystemPageInstance 只有 instanceId/componentName/view，pool.close/reset没有dirty判断；`useTabPages.ts` dirty gate 只查 PageRuntime。`system-page-identity-tabs.test.ts` dirty保护相关测试 mock cfg page runtime，不能当原生页面表单已受保护。新目录即将新增表单，需要先解决关闭/应用切换会无声丢草稿或晚提交的缺口；D1a/b只读验收不受此缺口影响。

完整核对直接文件及调用方：system-page-identity-pool、DynamicRouter 的 get/close/reset/assertPageRuntimesClean、useTabPages、AppTabBar、App.vue 的 application service、SystemPageIdentity tests；已存在的inject/provider或页面状态生命周期合同能否复用，禁止发明第二dirty系统。讨论原生页如果注册dirty/提交中状态，如何在实际tabclose、关闭其他/全部、app switch、navigation撤权/reset/销毁分别执行；普通切tab KeepAlive应保留草稿。已有 PageRuntime 不改变语义。

给出必要的最小精确文件范围和辨别力测试，不要实现。重点比较复用已有PageRuntime状态或原生pool私有状态+有限injection公共消费者哪一个符合当前架构；有真实消费者才公共导出，若新增入口列明exports/alias/import tests影响。不用任意isDirty callback泛化整个壳，不复制宿主。说明必须由用户决定的产品歧义是否真实存在；已有授权主控可作长期利益裁决，不因为文档规则机械要求重复8题。
