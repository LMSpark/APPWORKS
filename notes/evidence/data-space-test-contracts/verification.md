# 数据空间测试类型合同验收

日期：2026-10-09。依据：[获批计划](../../plan-data-space-test-contracts.md)。本轮只修改计划列出的六个测试文件；生产代码保持上一轮状态。

## 结果

| 检查 | 结果与证据 |
| --- | --- |
| spark-data 包级类型 | 19 处既有错误 → 0，退出 0；[data-typecheck.log](data-typecheck.log) |
| spark-lowcode-api 包级类型 | 2 处既有错误 → 0，退出 0；[api-typecheck.log](api-typecheck.log) |
| 根类型 | 退出 0；[root-typecheck.log](root-typecheck.log) |
| 级联及 CRUD/JSON 样例 | 4 文件 / 93 测试通过；[cascade-tests.log](cascade-tests.log) |
| 计算、选项与权限 | 1 文件 / 35 测试通过；[computed-tests.log](computed-tests.log) |
| 正式模型别名与保存 | 1 文件 / 13 测试通过；[alias-tests.log](alias-tests.log) |
| 根 lint | 退出 0；[lint.log](lint.log) |
| 文档门禁 | 344 文件通过；[docs.log](docs.log) |
| 差异空白检查 | git diff --check 通过；保留既有 CRLF 文件，使用 cr-at-eol |
| 测试结构审计 | 六文件测试标题及数量不变；静态 expect 调用从 505 到 508；未新增 any、非空断言或类型抑制；[test-contract-audit.json](test-contract-audit.json) |

本轮六文件共 141 项测试，三个定向命令覆盖互不重叠。失败基线沿用上一轮保存的[同编译器逐项对比](../data-space-ssot/typecheck-comparison.json)，未用回退工作树制造基线。

## 语义核对

- query/field 联合类型按实际 kind 收窄，查询级联属性未挪到字段级联。
- 旧 dependencyType 输入仍分别由 addCascade 和 fromJson 拒绝，保留所有旧枚举测试与配置未变断言。
- 计算测试夹具内部持有 h/m 权限事实，公开业务行不再携带它们；实际隐藏、脱敏、未知行及同行副本拒绝均有断言。旧查询同主键行、keyless 行对象身份、计算输入和子表聚合的原测试继续通过。
- 可选 computeExpression 通过删除属性清除，保留框架 _pk 的断言不变。
- keyless 查询先核有实际行，再断言可读不可写和无虚构主键；原始请求字段投影按 unknown 校验，正式别名和签名保存断言不变。
- 没有新增生产类型兼容层、降低 tsconfig 严格度、模拟角色或扩大权限。本人差异复核，不冒充独立代理审查。

## 交付边界

当前 21 处已知测试类型错误全部修复；不将此等同于全仓所有包类型检查或在线整页零回归。上一轮整仓 2852 项通过的证据保留，本轮测试及记录变更按获批范围执行 141 项定向验证。未修改 Java、数据库、远端场景文件、生产接口，未提交推送。
