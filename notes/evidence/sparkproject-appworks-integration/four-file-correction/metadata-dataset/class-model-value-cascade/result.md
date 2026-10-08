# ClassModel 值级联投影与字符串兼容复验

日期：2026-10-09。主控直接执行；完整任务继续实施。

- 运行 `pnpm exec tsx --no-cache scripts/generate-dts-class-model.mjs --incremental`，自动刷新当前源码的生成物；没有手改 shard。计划78变更/30新入口/47移除，实际生成1361个模型，耗时14.274秒。只改生成物和本次证据/计划，没有新增运行代码变更。
- `node scripts/verify-class-model-guide-json-schema.mjs` 通过。
- 真实 DtsClassModelBundleLoader 和 DtsBundleClassModelKnowledgeService 可获取 DataViewFieldCascade 及 DataSetCrudTool.createCascade 新合同；见 guides-first.json。guide 已含显式 valueFormat，仍缺新类型的完整源语义说明，并且部分常量在文本guide显示为unknown，不能认为描述层完整。
- **脚本执行未通过**：使用该生成物执行 executeDtsNativeScript → DataSetCrudTool.createCascade，无法解析 `#/$defs/DataSetCrudToolCreateCascadeParams`。script-first.json 保留失败结果；probe.mts.txt 是实际复现脚本快照，运行时临时复制为同目录 probe.mts 后执行。出现错误结果后另有未处理的同源Promise拒绝；本轮没有用兜底或手工 schema 绕过。下一闭环须先核 schema 生命周期和执行器错误传播的真实影响面。
- 全仓语义门禁未通过：旧生成物1755总缺口/167门禁缺口，当前2290/313；门禁口径为module/model/constructor。当前工作树含多领域既有源改动，自动刷新显露的缺口不能全部归因于本次级联，也不能忽略本次新增源声明缺少语义的问题。原报告与刷新报告均保留。
- **字符串兼容复验通过**：上轮14个最终路径哈希均未改变。当前5套件149项全部通过，耗时7.35秒，命令及输出见 compatibility-recheck.log；涵盖字段级联、DataSetCrudTool、ScenarioViewFile、正式请求载荷/保存后新读取、真实渲染选择控件。未重复未变运行码的根全套；上轮根211套件2766项仅作为其原验证时点证据。
- 已测规则：selection-string 按 valueField/selectionDelimiter 回填和写回；保留前导零、0、空值、自定义分隔符及非主键业务值；native数组和普通字符串不猜测拆分；选项重查询按显式子值策略处理，失败/过期响应不写子值。
- 无Java修改、线上写入、业务设计页恢复、代理或Git提交。线上旧级联配置和完整集成均未验收；整体不记完成或零回归。

## 复验命令

```powershell
pnpm exec vitest run --maxWorkers=2 packages/spark-data/src/tests/dataset/field-cascade.test.ts packages/spark-data/src/tests/dataset/dataset-crud-tool.test.ts packages/spark-project-model/tests/scenario/scenario-view-file.test.ts tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts tests/ui/field/choice/field-cascade-options.test.ts
```
