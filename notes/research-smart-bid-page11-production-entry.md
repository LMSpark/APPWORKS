# SmartBid 页11正式生产入口研读

## 已确认理解

- 当前主仓唯一工作目录为 `D:/SPARK_AppWorks`；当前分支 `codex/spark-data-s1-command-safety`，HEAD 与远端同名引用均为 `4193b657e3fd6a3bea1ae7578a44ab0fac5ebc4c`。
- 当前工作树存在约 266 项未提交改动，暂存区为空。主要 dirty 闭环为 S1 未知保存/原请求恢复、蓝图三文件发布恢复及其测试、验证脚本和生成物传播；不应在未结算前混改该公共链。
- 第 14、16、18 包的阶段实现已进入提交检查点；SmartBid 页11实际业务源码未被当前 dirty 修改。
- SmartBid 页11已有 `preparePublishedContentAuthoringCall`、工具三文件、宿主及夹具测试，但生产调用链尚未证明正式授权导航会把该页请求交给准备函数。
- 生产 `src/main.ts` 当前未注入 `PageRuntimePool.preparePageCall`；正式 `nodeId`、`pageId`、共享场景身份及授权菜单回包仍需确认。
- 本轮首个低冲突断点是验证页11真实发布身份并接通正式生产运行入口；没有正式身份或授权证据时不得用夹具身份冒充生产闭环。
- 用户纠正：**导航不应包含版本**。版本属于工具文件请求与浏览器缓存比较。现有 `PageRuntimePool` 从 `tool.versionId` 读取并比较版本的路径不能作为目标合同，需要在方案阶段明确替换边界。

## 调用链

`src/main.ts -> packages/spark-app/src/app/start.ts -> PageRuntimePool.preparePageCall -> PageRuntime -> DataSet/DataTable/DataView -> SparkPageRenderer`

发布链当前为：

`usePageDesign -> PageToolPublication -> 浏览器恢复记录 / Web Locks -> 三文件 DataView 快照 -> 蓝图文件指针保存及回读`

## 影响面与约束

- 涉及应用壳、页面运行池、项目蓝图、SmartBid 页11、共享 SPARK data 和正式导航。
- 当前 dirty 的公共保存语义与蓝图发布链是高冲突区，后续方案必须明确隔离，不覆盖或清理并行改动。
- 不新建或切换 worktree，不启动 Node 服务，不修改、启动或部署 Java 后端。
- 正式页必须通过四文件：工具 `rule.json`、`script.js`、`style.css` 及所属场景 `pagedata.json`。
- 页面导航只提供正式页面与工具身份、场景等业务路由信息，不承载文件缓存版本。
- 文件读取请求应携带浏览器已有版本；后端版本一致时只确认一致并可不返回文件内容，版本不一致时返回内容与新版本。
- 后端只读诊断（`E:/lowcode-jdk17`）确认：当前 `/api/File/content/text` 只接受 `FileInfo` 并始终返回文件文本；`FileInfo` 没有版本字段。`/api/File/lastModifiedTime` 可独立返回当前文件修改时间，仍不能接收缓存版本，也不能在一次请求中返回“未变/内容+新版本”。因此用户要求的条件读取协议不是当前后端已实现合同。
- 当前前端 `LowcodeDesignApi.readTextFile()` 严格要求 `Result` 为字符串；页面工具读取继续以 `versionId` 定位三文件历史快照，场景 `pagedata.json` 则读取工作文件文本。目标“四文件分别条件读取”会同时影响公共 reader 类型、PageRuntimePool、场景装配入口、lowcode 适配器和缓存层，不能只改页11宿主。
- 未知保存结果仍按原请求核验，禁止重发；服务合同缺证保持为缺口。

## 复杂度

复杂：需要 8-10 个反向问题，必须一问一答。
