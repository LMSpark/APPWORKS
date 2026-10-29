# builtin 源切换：一页 UI / consumer 验收矩阵

只读快照：HEAD 4c5f937c726bca92220684451289c6478213e2a8 + 写者WIP；唯一工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。未跑UI/测试、未改仓库。下述“未接线”是本次新增file来源尚需完成，不称既有dynamic产品失败；已确认共享7AB阻断、BeginGroup丢失另报告且root已RED。本矩阵不替代后续修复冻结审查。

绑定缩写：K=从当前owner.dataSet.scenarioId、owner.view.dataTable.modelBinding?.modelName ?? owner.view.tableName、viewId构造的完整键；builtin为7AB@RepositoryBlueprintNode@default，dynamic为7AB@Base_NavigationInfo@default。字段成员用currentRow，列表/树用rows；不得把未选DB视图当前行当file节点。

| 当前入口 / 源码定位 | 目标绑定或明确不可用 | 可执行验收 / 真实失败断言 | 性质 |
|---|---|---|---|
| Dev左树 ProjectBlueprintTree.vue:38–79；useDevState.ts:251–271 | 当前owner.view/K的标准树；保持85原行与84可见后代；readonly禁增删拖放 | builtin→dynamic→builtin切换，不能残留旧key/currentRow/provider；选择受拒时不改高亮；动态仍可原owner暂存和显式保存；builtin各写入口零提交。具体root/slot/drop合同见标准树报告 | 当前el-tree数组显示与新file绑定尚未接线；默认标准drop不能替代owner |
| 基本信息/数据空间 NodeBasicInfo.vue:12–15、33、77 | 固定Base_NavigationInfo key改为K；name/memo/conid均currentRow，字段权限来自同owner；候选catalog仍是其独立正式DataView | builtin节点显示真实name/memo/conid且readonly；同7AB保留的DB表设冲突currentRow，界面仍只能显示file节点；dynamic获准字段保存后回读，h/m不可泄漏；选中切换后旧输入不写新行 | 新file来源未接线，非删除DB表即可解决 |
| 导航显示 NodeStateConfig.vue:13–15、28 | 两个FieldSelect绑定K.currentRow.NavigationShowType/HorizontalAlignment；字典option key独立不改；BeginGroup仅源实际输出时显示 | 切来源值不串行；builtin不因字典查询失败变可编辑或变成空值覆盖；dynamic BeginGroup=1仍显示true且保存其它字段不清零 | 固定key未接线；BeginGroup投影丢失为已证实回归 |
| 原型描述/估算/发布开关 BlueprintWorkspace.vue:14、19、71–75、109–114 | 当前owner字段只读可展示真实htmlDesc、估算、IsShowAtNav等；未输出字段明确不可用，不猜默认；Vue原生目标不伪造三文件交付 | readonly输出为空和“来源不支持”分开；builtin save/cancel/write命令不发生DB或文件提交；显示53个原IsShowAtNav不等于扩大发布26；dynamic仍按原字段授权操作 | 当前draft.read/write已委派session，不宜整页重做；UI禁用/文案需验收 |
| 原型历史/导航宿主 BlueprintWorkspace.vue:14/17；BlueprintReadonlyInfo.vue:20–27；blueprint-readonly-info.ts:14–18 | 这两项仍为独立DB资源Base_Navigation_Desc_Version/Base_Navigation_DataRelation；85记录没有其来源。builtin若本片未明确批准同节点独立DB正式读取，就显示“仓内蓝图尚未接入该资源”，不可自动查询冲突旧DB节点。dynamic保留既有正式视图/查询/权限 | 点击builtin两个tab：无冒名Base_NavigationInfo查询、无假空成功；若明确保留辅助DB查询，必须独立合法模型权限、prowid目标和scope证明，并标明独立来源。dynamic实际查询参数prowid正确；延迟查询后切节点/应用/卸载不能呈现旧结果；错误不是空列表 | 源切换后的业务边界未接线/待裁决，不是85已有历史或宿主数据 |
| 任务信息 BlueprintWorkspace.vue:18 | 当前明确“暂无对应任务资源”；不新增虚拟任务或继承旧节点授权 | builtin/dynamic不能凭节点存在显示任务列表成功；无需为本片新造资源 | 已明确不可用，非回归 |
| 规划UI与headless project-planning-agent-run-provider.ts:164–197、119–130 | 读取同K owner完整树；readonly builtin可形成分析输入，但不得执行增改删/发布；原headless未接正式写命令时保留其拒绝交付 | builtin规划输入含85完整节点而非26菜单；dynamic真实7AB仍读自身树；saveBlueprintAfterRun不可回退ProjectWorkspace.saveAll；已存在“无正式命令上下文”拒绝要保留；owner/runtime释放 | 与Dev共用source，不能仅测UI树；原headless写入未接线不是本片新缺陷 |
| 页设计UI/agent page-design-agent-run-provider.ts:235–277 | 同owner树提供节点上下文；原生Vue页只正式映射，不构造cfg pageId或3文件；builtin当前0 cfg不代表任意工具编辑已开放；普通dynamic cfg保持原工具owner | builtin Vue/空URL节点请求pageDesign时明确非三文件目标，不读取“nodeId/rule.json”；dynamic合法cfg上下文仍可加载；scope/AppId换后旧结果拒绝；finally释放owner/runtime | 原生目标工具边界需显式表达；不把Vue映射当工具生成完成 |
| 数据空间目录→设计器工具目录/预览；view-design session:2353、2710、2769；ProjectToolResource.ts:63–81 | 继续由注入blueprintTreeProjection提供原owner完整树，再按正式工具身份筛选；不能拿85节点或26菜单伪造工具3文件。builtin无cfg时真实工具列表可空，原生页面映射不假装成cfg；dynamic保留 | 无projection时保持PROJECT_TOOL_CATALOG_OWNER错误；只改变来源不绕过该guard；builtin Vue节点不读/写三文件、不删原动态工具消费者；动态有cfg节点仍投影pageId/version；切空间/项目拒绝旧projection | 当前正式consumer存在，是否宿主已传getter须在真实入口测；不是另造第五个蓝图owner |
| 普通应用运行导航 lowcode-runtime.ts:484–514；builtin:472–482 | dynamic owner记录+正式授权；builtin固定26投影+同正式授权，不用85树直接做运行菜单 | shared7AB修复后dynamic启动正常；builtin仍18发布叶且权限拒绝不出现；85源新增读取不把53显示标记全部发布 | dynamic装配为已证实回归，运行菜单语义保留项 |

验收最小夹具：同一完整7AB同时声明file与DB表，builtin和dynamic各自身份，DB行刻意与file节点名称/URL不同；分别覆盖成功切换、字段hidden/masked、加载失败、迟到scope、readonly写拒绝。单表裁剪fixture无法验固定key误绑。正式原型历史/宿主两DB资源不能从file owner.readonly直接推导其读写权限；如本片不接入，明确不可用比无证据的空表更准确。

待核仅限本片：最终UI是否已改K/provider；builtin辅助DB查询的明确来源裁决；目录设计器实际getter接线；标准树drop/注册生命周期。尚未签这些通过，不扩大成新增任务系统、历史迁移或普通cfg库存清理。
