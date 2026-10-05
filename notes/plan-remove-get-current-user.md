状态：implementing

## 范围修订
`backend-api-contracts/endpoints.ts` 的 `login.getUserInfo` 保持范围外：人工整理的注册表，无消费者、无校验脚本、生成器不写入，且已缺少后端新增接口；留作后续整体对账。
消费者台账重生成后，测试文件内其他记录的行号会前移，差异大于 3 条 `GetUserInfo` 记录，属预期。
已完成：测试载体切换及 API/类型/辅助函数/导出删除；定向测试 12 项通过。

## 任务目标
删除 `LowcodePlatformApi.getCurrentUser` 及其专属类型与辅助函数：它调用的 `GET /api/LoginAuthority/GetUserInfo` 已不在 `E:\lowcode-jdk17` 当前源码中（重新生成的端点台账里不存在），且仓库内没有任何生产调用方。

## 复杂度
中等（3 个源码文件 + 3 个生成物 + 1 份台账；无新依赖、无新公共 API，属于公共面收窄）。

## 事实依据（已核实）
1. 生产代码零调用：`getCurrentUser` / `LowcodeCurrentUser` 在 `packages/`、`src/`、`tests/`、`tools/`、`docs/`、各 README 中只出现在 `lowcode-platform-api.ts`、`index.ts`（类型导出）和 `lowcode-platform-api.test.ts`。
2. 后端源码已无该接口：旧台账来自 `LoginController.java:224`，新台账 587 个接口中没有 `GetUserInfo`（只有 `UserManage/GetBaseUserInfo` 一个名字相近的 POST，语义不同，不作替代）。
3. 4 个读取辅助函数 `readNullableString` / `readNullableNumber` / `readNullableStrings` / `readNullableRecord` 全包仅被 `getCurrentUser` 使用（共 10 处调用，均在该方法内），删除方法后会成为死代码，lint 会报未使用。
4. 测试里有 4 处是借 `getCurrentUser` 当"带鉴权的单次请求"，去验证通用行为，**不能随方法一起丢**：
   - 注入已存储的 access token（Bearer）；
   - access 过期后先 refresh 再发请求（断言两次请求的顺序与头）；
   - `Code !== 200` 失败关闭为 `LowcodeApiError(401, …)`；
   - 响应不是 AjaxResult 时失败关闭为 `LowcodeApiError(0, 'lowcode 响应缺少数字 Code')`。
5. 生成物与台账带着它：`generated/dts-class-model/files/packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts.json`、`generated/dts-class-model/manifest.json`、`generated/dts-class-model/semantic-gaps.json`；`backend-api-contracts/appworks-consumer-ledger.json` 里有 3 条 `GetUserInfo` 消费者记录（`lowcode-platform-api.ts:460`、测试 `:65`、`:433`）。

## 影响范围
| 文件 | 改动 |
|---|---|
| `packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts` | 删除 `LowcodeCurrentUser` 类型、4 个 `readNullable*` 辅助函数、`getCurrentUser` 方法 |
| `packages/spark-lowcode-api/src/index.ts` | 删除 `LowcodeCurrentUser` 的类型导出 |
| `packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts` | 删除"读取并归一化当前用户"用例（`:46-76`）；把上述 4 个通用行为用例的载体从 `platform.getCurrentUser()` 改为 `design.readTextFile(locator)`，其余断言逻辑保持不变 |
| `generated/dts-class-model/**`（3 个文件） | 重新生成 |
| `backend-api-contracts/appworks-consumer-ledger.json` | 重新生成 |

## 技术方案
1. 先改测试载体，再删方法（保证每一步都有测试护航）：
   - 新载体为 `LowcodeApi.design.readTextFile({ appType, customPath, fileName })`：单次带鉴权的 `POST /api/File/content/text`，仅要求 `Result` 是字符串，夹具最简单（`{ Code: 200, Result: 'x' }`）。
   - Bearer 用例：断言 `requestConfig.headers` 含 `Authorization: Bearer access-token`，不变。
   - refresh 用例：夹具第二条改为 `{ Code: 200, Result: 'x' }`；断言 `requestConfigs[1]` 的 `url` 改为 `/api/File/content/text`，头 `Bearer new-access` 不变；`requestConfigs[0]` 的 refresh 断言不变。
   - 两个失败关闭用例：只换调用，期望的 `LowcodeApiError` 不变。
2. 删除"当前用户"专属用例。
3. 删除方法、类型、辅助函数、`index.ts` 导出。
4. `pnpm run generate:class-model-surface` 重新生成；只保留与 `lowcode-platform-api.ts` / `LowcodeCurrentUser` 相关的差异，其余无关差异回退。
5. `pnpm run generate:lowcode-contracts` 重新生成消费者台账（只读 `E:\lowcode-jdk17` 的 Controller 源码，不修改后端），确认端点台账无差异。

## 关键设计决策
- 载体选 `design.readTextFile` 而不是 `platform.getCacheStats()`：后者一次调用会并发两个请求，refresh 用例会变成 3 次请求并引入并发合并的断言，改动面更大。

## 兼容性
- 公共导出面收窄：`LowcodeCurrentUser` 与 `platform.getCurrentUser` 不再存在。仓库内无引用；`spark-lowcode-api` 是可发布包，若外部项目依赖它会受影响，但本包版本仍是 0.1.0 且未见外部消费者证据。
- 无运行时行为变化。

## 验证计划
1. 基线（改前）：`spark-lowcode-api` 包测试、根 `typecheck`、`lint`、`verify:ai-codegen` 全绿。
2. 闭环 A（测试载体切换，方法仍在）：`pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src/platform/lowcode-platform-api.test.ts`。
3. 闭环 B（删除方法/类型/辅助函数/导出）：包 `typecheck`、包测试、`verify:ai-codegen`。
4. 闭环 C（生成物与台账）：`verify:class-model`、`verify:lowcode-contracts`。
5. 收尾：根 `typecheck`、`lint`、根 `test:run`（期望退出码 0、无 Errors）、`pnpm run verify:rules`（期望全绿）。
6. 无需人工场景；登录主流程（`UserLoginByEnt`）不受影响，其测试保持原样。

## 风险项
- **载体切换改变测试语义**：改用 `readTextFile` 后，这 4 个用例证明的仍是"拦截器与客户端行为"，不再顺带证明"当前用户解析"；后者随功能一起删除，属预期。
- **生成物可能带出无关差异**：全量生成若改动了与本任务无关的文件，只保留相关 3 个，其余 `git checkout` 回退并记录。
- **外部消费者**：若有仓库外项目依赖 `getCurrentUser`，会在升级时失败；缓解：本次不改包版本号，由你决定是否在发布时记入 CHANGELOG。
- **台账读取 `E:`**：只读扫描，若 `E:` 内容在两次生成间再变，会带出与本任务无关的接口差异；届时单独说明。

## 范围外（明确不做）
- 不新增 `UserManage/GetBaseUserInfo` 的前端封装；不改登录/刷新/登出逻辑；不改版本号与 CHANGELOG；不 commit / push，除非另行要求。
