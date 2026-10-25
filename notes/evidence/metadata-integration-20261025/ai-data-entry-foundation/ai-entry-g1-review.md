# G1 只读独立复核：allowAIAdd 元数据投影

## 结论

- **阻断发现：无。** 在所列实现中，`allowAIAdd`作为正式模型字段元数据归入`DataTable.columns`；DataView只继承所属输出列，不产生第二份视图配置。未发现对原查询/保存权限或业务行结构的代码修改。
- **非阻断发现：2项测试覆盖可加强。** 实现已有相应保护，但当前新增测试没有直接锁定这两条回归断言。
- **检查方式：** 静态阅读指定的3个产品文件和2个测试文件；未运行测试、门禁、服务或UI。审查前后文件SHA-256相同，未发现作者收尾期间的文件变化。

## Spec 核对

1. **真源及归属：通过。** `DataColumn.allowAIAdd`有明确列元信息注释（`packages/spark-data/src/types.ts:209-218`）。`formalField`将正式字段值归一化并投影到正式模型列；`sameFormalOutput`将该属性纳入重复字段语义比较（`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:109-133,148-153`）。
2. **规范化：通过。** `1/'1'→true`、`0/'0'/null/缺失→false`；其他值抛错，不宽松布尔转换。单元测试覆盖这些输入及非法值（`data-space-design-api.test.ts:952-980`）。
3. **重复字段：实现通过，新增专项断言缺失。** 相同`canonicalName`的字段在`sameFormalOutput`比较`allowAIAdd`，不一致时正式模型字段解析拒绝；已有重复语义测试覆盖描述和值函数等差异，但新增`it.each`没有`allowAIAdd`差异项（`data-space-design-api.ts:148-153,324-335`; `data-space-design-api.test.ts:355-390`）。
4. **视图与pagedata边界：通过。** 正式字段最终总是取`field.allowAIAdd === true`，本地规则不能覆盖；本地计算列分支也过滤该键（`lowcode-data-space-view-fields.ts:47-66`）。runtime用例同时验证正式值优先、pagedata的`columns`/`fieldProjection`注入被拒绝、各DataView继承列但不含非输出字段（`lowcode-data-space-runtime.test.ts:771-812`）。
5. **业务行与权限：实现未改权限逻辑，业务行检查通过；权限专测缺一条。** 新增只有DataColumn和正式字段投影改动，没有更改DataView授权或保存路径；runtime用例执行查询后断言业务行无`allowAIAdd`（`lowcode-data-space-runtime.test.ts:826-830`）。现有runtime权限用例保留只读字段`write: denied`断言（同文件`722-725`），但新用例未直接断言`allowAIAdd:true`的列仍服从原`fieldAccess`拒绝。

## 非阻断发现

- **P2：补一条重复标志冲突反例。** 给同`canonicalName`的两条正式字段记录设置一开一关，断言`resolveOutputFields`拒绝；这样能锁住本次在`sameFormalOutput`中新增比较的意图。当前实现已正确比较，属于防回归覆盖缺口。
- **P2：补一条权限不扩张反例。** 对`allowAIAdd:true`但正式`fieldAccess.write='denied'`的字段，断言元信息仍为true且写权限仍为denied。当前改动没有触碰授权代码，现有授权测试也继续覆盖原行为；缺口只在新元数据与权限解耦没有被同一个用例明确证明。

## 五个文件 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| `packages/spark-data/src/types.ts` | `1BD8457D010170A4714B127CBDD2B765E1D129D92B4B933BCB3BE9AAD5808467` |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` | `6BC9CEB05C914AED97F91CCD5752A2F55453C4F9B5BFBF544A6B358AF0C163B7` |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts` | `C2C8F41E2E406116916731F7CC8D7ACFFC35B8AD0049012217C59AE8C8AC0C42` |
| `src/lowcode/data-space/view-design/lowcode-data-space-view-fields.ts` | `24B17A233F851CDCF961E1826110C94F3A0F7E955A407D56DA77BBF3C05D7243` |
| `tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts` | `25C060CD4DE92D250956340C42411A5D33694A9A23926D42D236DB517B6D21BA` |

