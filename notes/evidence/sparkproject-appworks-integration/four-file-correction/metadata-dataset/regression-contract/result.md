# 回归合同与原生数据职责对齐

2026-10-09；主控直接实施、自审，代理0。生产源码改动0，修改两个既有测试。完整 DataSet/AppWorks 目标未完成。

## 原因及修正

- `tests/app/dev/dev-dataset-designer-projection.test.ts` 原断言拒绝任何 columns，包括空数组；正式合同已允许字段前端校验。当前验收空扩展和 required/min 规则，完整保留模型绑定及命名视图，并分别拒绝覆盖正式 type/isPrimaryKey；拒绝不改变草稿、修订号及保存基线。
- `tests/runtime/page/spark-page-renderer-binding.test.ts` 的原型spy同时统计了两个DataSet在初始化时建立的字段级联订阅。该订阅归DataSet所有，由DataSet.destroy释放；renderer只能释放自身订阅。现先加载外部拥有的runtime，再统计renderer注册；仍精确要求reload后4注册/2释放、unmount后4释放，另验证reload后late视图数据变化实际更新画面、unmount不销毁runtime、显式dispose销毁DataSet。

## 验证

| 命令/范围 | 结果 | 日志 |
| --- | --- | --- |
| 根typecheck，修改前/后 | exit0 | typecheck-before.log / typecheck-after.log |
| 原两个文件 | 2失败、20通过，准确复现原症状 | red.log |
| columns最小复验 | 1通过 | columns-green.log |
| renderer最小复验 | 21通过 | renderer-green.log |
| 两文件＋场景文件＋正式装配＋字段级联 | 5套件123通过 | focused.log |
| 精确两路径ESLint --max-warnings=0 | exit0，空日志 | lint.log |
| verify:ai-codegen | 1019文件通过 | ai-codegen.log |
| 根 test:run --testTimeout=15000 --maxWorkers=2 | 210套件2726项全通过，225.36秒 | root-suite.log |

根全套包含聚焦用例，数量不重复累加。运行器仍输出既有esbuild/oxc提示及jsdom requestSubmit未实现提示；本轮无失败用例。未做浏览器或线上读写验收；测试合同修正无需重复已经冻结的API与线上检查。

两文件前像在before，前后SHA256在before-hashes.json/final-hashes.json，本轮精确差分在changes.patch。保留工作树原有未提交修改；无commit/push/新分支/Java/UI修改。

下一闭环是命名视图自动查询和父视图依赖顺序；这里只完成已知回归失败收敛，不据根测试通过宣称原生属性、数据空间设计或完整页面集成全部完成。可复用的测试生命周期归属经验暂留此记录，未写knowledge或个人记忆。
