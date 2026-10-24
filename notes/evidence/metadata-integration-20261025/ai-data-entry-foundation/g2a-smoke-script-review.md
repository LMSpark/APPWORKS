# G2a 配置烟测脚本只读复核

复核范围：`node_modules/.cache/metadata-integration-20261024/g2a-agent-config-live.mjs`、对应现有 `g2a-agent-config-live.json/.log`，以及 G2a resource/test/index 的当前文件 hash。未执行脚本、服务请求、测试或 UI；proof/log 是工作区已有运行证据。

## 当前判定

**阻断：本次真实创建已进入 unknown，不能声称配置验收成功，也不能重放创建。** 现有 proof 记录 `stage=selected-view-create`、`createCount=1`、`unknownCreate=true`、`safeCode=CONFIGURATION_VERIFICATION_FAILED`；日志明确记录 `PRESERVING_ORIGINAL_DATAVIEW_UNKNOWN_CAPTURE_NO_REPOST`。没有正式创建 ACK、正式配置 readback 或 V1 目录精确 ID 证明。保持原执行进程和原 DataView capture；不得重跑脚本、再发 create、销毁该 DataSet 来清除 unknown。脚本 catch/finally 的行为符合此边界：检查 `requests.hasUnconfirmedSave` 后把进程留在原 capture 上，proof 不包含 HTTP 错误正文。

## 脚本静态检查

- **请求范围：通过（客户端请求面）。** interceptor 对请求 URL origin 与非空 baseURL 都要求 `http://127.0.0.1:5273`，并按 method/path 白名单限制登录、SPARK `DataOperation/GetData`、`ai-agent/create`、`ai-agent/get`、V1 agents 目录读取；其他请求在发送前被拒绝。Create 还要求未有既存可信 ID、单次计数且 payload 深相等于固定 settings。
- **未知与重复创建：通过（保守停机）。** 持久 attempt marker 在 selected-view save 前以 `flag: 'wx'` 写入；只有收到成功回执并解析到正式 agentId 后才改写为 `create-acknowledged`。重入时没有可信 ID 就拒绝 POST；运行期间未知则留存原视图 capture。代价是“marker已写但请求尚未发出”也会停住，需要人工处置，属于安全的保守失败。
- **凭据及提示词：通过。** 测试凭据仅从 DPAPI 文件解密到子进程/内存，未写入 proof/log；system prompt 只写长度/hash，不写明文。当前 proof 中的 agentId 是身份标识，非认证凭据。
- **业务写入/共享 Agent：通过（本次客户端调用路径）。** allowlist 拦截 update/delete；当前 request proof 只有只读查询和一次 create，没有业务资源写 API、没有 AI invocation。脚本先读取共享 Agent 的关键配置并记录 prompt hash，最终 `sharedAgentChanged=false` 来源是请求轨迹没有 update/delete。该结论证明客户端没有调用共享配置修改路径；它不是后端副作用审计。本次 create ACK 未到，因此不能以此替代成功后的配置隔离/readback验证。
- **readback/目录：设计上有核验但本次未到达。** 正常路径会把正式回执 ID 设置到 configuration.queryContext，核对回读 ID 与每个固定设置，再从 V1 agents 目录精确匹配且要求唯一；当前 unknown 在此之前中止。

## 冻结范围差异

任务给出的 resource 冻结 hash 为 `41031F01F560C76D5F2BD9F773E169D34E48E3026980584DDE4919F357D586E4`；当前工作区 resource hash 实为 `97D418575F7C311556AF9942FA94D31E78FE6BFEE5ECCB8F1AC7FF124CB9EE8D`。Test hash 仍为 `02B895DA9890907371786F5719DB136E69378C16E614E58B21E21F4D311CAFF4`，index hash 为 `DE52182040C5C4BA01934F31347452E944C75B24D467B97495038148E520B972`。本报告只对当前源码做静态审查；在确认 resource hash 变化属于哪次 owner 修改前，不把旧冻结 hash 的复核结论直接移植到当前文件。烟测脚本当前 hash：`98F4F7DBE8896E636A93AD752E580E5ACD1E22DAFA48A282653BE4B83E9E0A89`。
