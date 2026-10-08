状态：implementing

# C2d2e 选择失败时保留原页面

主控已复核 C2d2d 七文件哈希；root190/2212、API18/583、宿主12/80、root/package typecheck、scoped lint、ai978、dirs、完整 build 都通过。但生产浏览器发现组合失败路径，不能签署 C2d 全链。用户已授权主控按长期利益裁决，本次按原最小闭环修订继续，不重新询问。

## 真实证据与根因

从元数据管理的正式应用列表点击现有“用于验证应用、导航、数据空间和资源模型的隔离测试应用”进入按钮。平台明确返回“应用导航根节点应唯一，实际 0 个”。URL 及真正 sessionStorage 中 spark_lowcode_application.application.id 都仍为 D99A1DCE9894698799101EFD70F8FC76，但实际页面变成“无法确定系统页面 / 应用范围已切换”。证据 c2d2d/browser-rejection.json、production-switch-failure.png。未写业务数据。

src/App.vue 的 switchAndReload 在 await activateLowcodeApplication 前 resetSystemPageInstances，选择尚未成功已清空并锁住原实例池。前片 guard 已延后 reset，但 App 服务同样时机未修。只需要将已有 reset 移到组合 receipt.assertCurrent 成功后、disposePageRuntimes 前。失败激活仍抛原错误，原应用/实例/路由保持可用，不自动选择或伪造导航根，不重试或回滚 store。

## 精确范围（2文件）

1. src/App.vue：仅 switchAndReload 内调整 reset 时机；保持 dirty guard、intent、catalog/activation、receipt、dispose/settings/reload 顺序与错误语义。
2. tests/app/services/project/application-switch.test.ts：实际 App + DynamicRouter 挂载失败激活反例。可替身真实选择的网络失败出口，不能替身 App service 或实例池。先取当前系统页 instance，启动 deferred 失败激活；pending 中同实例仍可用，reject 后 URL/store不变、同一实例未被重建、原错误透传；reset/dispose/reload 均未执行。已有成功时 reset/dirty/stale/caller 测试必须保留。

## 执行与验收

完整重读两文件和本失败直接调用链。先只新增有实际状态断言的 RED；再改 App 单处顺序立即 GREEN。不要为了取证再改回已修代码。缺 root 是现有数据条件，不修改测试应用、后端或任何业务资源。

最小失败用例、application-switch + system-page-identity-tabs + navigation-sync + project-navigation-guard + lowcode-runtime-navigation 分组回归；root typecheck、2文件 lint、ai-codegen、dirs。提供原始stdout/result和2文件 SHA256 冻结。不跑根全量/包全量/完整build/browser，主控按这次影响决定复验；平台/包没有改动，已有全量结果可复用。

禁止扩文件、commit/push/建分支、清理其它变化或临时禁用权限。D1a继续等组合验收，不混入。
