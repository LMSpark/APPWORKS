# 已存关系审查返修

状态：implementing；同一总计划 notes/plan-appworks-four-file-integration.md，非新功能。当前唯一 writer；原 implement_relation_page 已冻结。当前分支和混合改动必须保留，不提交、不建分支、不重置、不在线写入、不派其他 agent。

## 准确范围

- config/pages/data-platform/data-space-design/script.js
- tests/runtime/page/design/data-space-design-four-file.test.ts
- 本目录 relation-page-fix-result.md 与定向验证日志

根 AGENTS.md、relation-page-brief.md、relation-page-review.md 为约束；完整读两份当前目标源码及相关 DataView 方法、反查测试。前端只有数据权限，无角色；完整过滤表达式关系不自动产生输入级联；所有编辑用当前 DataView 缓冲和 DataSet.saveChanges。新增权限仍未决，不做新增。不要扩大到函数目录、其他页面或后端。

## 主控已核实的缺陷

1. designRelationValidateJoin 从 getEditingPatch 发现 Join 修改，designSaveRelation 却在 join.changed.length 分支拒绝所有 hasEditingChanges(childId)，因此任何实际 Join 编辑都不能保存。区分当前编辑器允许的四字段与其他字段；拒绝混入 description 等其他草稿，但允许本次 Join。不得以移除权限检查修复。
2. stage 后、dispatch 前 catch 用 discardEditingRows 清理模型及更新关系；DataView.applyEditingRows/editRowById 已把修改转为 dirty pending，该方法只删编辑缓冲。读 packages/spark-data/src/data-view.ts 的 discardEditingRows/discardPendingChanges；只对本轮实际成功 stage 且仍是同一查询 owner 的精确行回退 pending，不清别人的未 stage 草稿。
3. designDeleteRelation catch 的 if(stagedJoinClear || clearJoin) 在已有其他模型草稿的前置校验失败时也会 discardEditingRows(childId)，直接丢失他人草稿。clearJoin 是业务意图，不是本次编辑归属证据。只清本轮实际创建/暂存的内容；预先存在的 description/Join 草稿必须原样保留。
4. 当前真实渲染测试还包含新增非 as const 断言及无用调试变量（rendererState/pageFunctions/layoutReadsBeforeDelete），移除无用调试访问，数组用 Array.isArray 收窄；不要为测试访问内部 setupState，不放宽门禁。当前 fixture.messages 空断言没有证明 UI 无错误（实际 capability 需核绑定）；使用被真正消费的消息 capability 或可见错误断言，报告证据范围。

## 实施与验收

先补能在当前失败的 Join 首次设置/编辑/清空及删除前已有无关草稿不丢失的定向用例，再做最小修复。额外覆盖同父子仍有另一关系和其他父归属不被删除清 Join；已经有普通 edit/delete + delete-only + 图结果的真实渲染用例，复用 fixture，不复制整套测试宿主。至少一条 Join 保存需经实际页面控件，剩余生命周期反例可通过公开 DataView 和编译页面方法。

覆盖提交前失败：真实 DataView stage 后制造下一步的明确拒绝，断言零保存请求、精确行恢复、其他行/草稿保留；提交后 unknown 保持锁且不自动回滚/重试。无需造新生产 hook 或公共 API。

首改运行对应最小用例并保存 red/green 原始输出。最终跑 design 四文件测试文件及该文件 eslint --max-warnings=0，报告准确条数与时间；主控统一根 typecheck、pages/ai-codegen/dirs，不重复宿主/API/旧底座大套。函数目录的多分支祖先是已记录后续整页差距，不在此返修内。
