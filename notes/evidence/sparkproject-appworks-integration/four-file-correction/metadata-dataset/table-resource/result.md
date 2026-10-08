# 正式模型到原生 DataTable 资源语义

状态：八文件局部闭环已通过主控及独立验收；完整DataSet/AppWorks目标继续。

修改前八文件当前字节与 `before/` 前像逐一核验，SHA-256 见 `before-hashes.json`；最终 SHA-256 见 `after-hashes.json`，精确差分见 `eight-file.patch`。根基线 typecheck 已退出 0（`typecheck-before.log`）。

正式 `sourceName` 原值成为原生 DataTable 的 `resourceId`，正式 Type 原标签映射为 `resourceType`：数据库表、数据库视图、逻辑视图、字典、接口、JSON、文件分别得到独立类别；正式模型读取原已接受的 `表`/`table` 写法仅在新原生映射接受。既有 wire parse/encode 合法结果保留，未知、空及原型键 Type 被拒绝；`modelBinding` 仍使用正式模型 ID/Name，没有新增请求或文件覆盖入口。两处 page 测试夹具把误用的 native `database-table` 改为正式 `数据库表`。

最小 API 用例先红（缺少消费方法，退出码 1），增加映射与方法后立即绿（退出码 0）；装配用例再先红后绿（原生 resource 字段缺失）。真实日志为 `api-minimal-red.log`、`api-minimal-green.log`、`assembly-minimal-red.log`、`assembly-minimal-green.log`。现有文件 owner 保存、新 Workspace 重开用例验证正式来源名变更反映到新装配的 `resourceId`，pagedata 文本不变，实际远端查询仍发正式模型 `Name`，运行 rows 不进入 `DataSet.toJson()`（`persistence-minimal.log`）。

追加验证了 encode 的非法原型键：先红（`encode-own-key-red.log`），加自有键守卫后绿（`encode-own-key-green.log`）。wire 映射声明依仓内 2.9 规则提取内部具名类型后，最小用例通过（`resource-map-type-green.log`）。包内 DataSpaceDesignApi 最终完整套件 90 passed，退出码 0（`api-suite-final.log`）；根 assembly 与 persistence 两套 15 passed，退出码 0（`root-two-focused.log`）；最终精确八文件 ESLint 退出码 0（`exact-eight-lint-final.log`，无 stdout 时仍含完整命令及退出码）。

主控完成：两处page大套167/167（root-page-regression.log，测试命令timeout15秒，源码无skip/timeout改动）、四套相关运行回归65/65（root-runtime-regression.log）、最终根typecheck退出0（typecheck-final.log）、AI扫描1016文件通过（ai-final.log）。连同writer API90和两聚焦15，共九个不同套件337项通过。独立审查报告table-resource-review.md通过，8份前后哈希独立复核，主控冻结后8份哈希匹配root-final-hashes.json。

真实单ID只读验收：online-session.mjs经已有入口返回1空间/7模型/119字段/0关系；目标7模型涵盖字典、接口、逻辑视图、数据库视图、JSON、数据库表。逐表核对正式公开可读的rowid/Name/MetaName/Type与native modelBinding/resourceId/resourceType一致，每表default视图仍归属本表，pagedata没有resourceType/resourceId副本；两个DataSet全部远端视图序列化为空rows，最终释放已确认。online-session-result.json状态complete，业务/配置写入0。未查询这些目标业务模型的数据，不能据此声称六种资源取数均已验通。

首个只读探针误要求native toJson完全没有rows键，失败证据online-session-first-result.json及first.mjs已保留。主控核对data-view.ts:2888-2900，正式合同对远端视图输出rows:[]；只修探针为检查空数组后复验通过，未改生产源码/正式测试来迎合探针。

未执行线上写入、Java/UI 修改、提交、推送或建分支。文件来源只有元数据类别表示，当前GetData没有文件分支，不在运行查询证明范围。完整DataSet仍有字段扩展真实归属、api/crudConfig、静态定义和旧布局等未完成项，完整AppWorks目标保持。
