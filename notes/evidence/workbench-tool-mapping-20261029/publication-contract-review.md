# cfg 发布修复窄静态复审 — 2026-10-29

结论：**NO-BLOCKING（本轮静态范围）**。当前 guard 修复了已核的“snapshot等待期间新节点草稿被发布夹带提交”风险；未发现阻断正常三步发布或错误放行自身以外 patch 的明确问题。

工作树：C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。HEAD a5e7670dba902a477aa37e23511f5774f2a65808，本报告审当前未提交 BlueprintWorkspace.vue 与相应发布测试；未修改仓库，未跑测试、UI、服务、rules或build。本结论不把写者最终工程检查描述为本审查者已独立执行。

## 已闭环的身份和阶段

1. src/views/app/dev-system/blueprint-workspace/BlueprintWorkspace.vue:179–182 捕获原scope、NavigationUrl、VersionId和readyWorkspace；:188–202每次检查UI目标、同session/readyWorkspace、owner项目/node、可用查询状态、当前字段权限以及当前row的rowid/SysId和两个原绑定值。这里采用逻辑行身份，而非要求query读回后仍为原row对象，符合正常保存refresh会替换查询行的生命周期。
2. :203–218枚举view.rows中的editing/dirty状态；默认阶段拒绝current.dirty、任何编辑patch和未确认/命令状态。这用于:229上传前、snapshot内部assertCurrent和:237返回后，所以新NavigationUrl或Manhour草稿在更新VersionId之前即阻止继续；原草稿不会被清空或保存。
3. :241先推进expectedVersionId，再:242只更新VersionId；:245调用assertTarget(true)进入唯一的自身patch检查。只有当前行一个changed row、唯一字段VersionId且值精确匹配expectedVersionId可通过；其他行、其他字段、原生dirtyTracking待提交、unknown/命令状态都拒绝。
4. :245到:246调用current.save之间没有await空隙；真正提交仍沿原BlueprintWorkspaceDataView/DataSet。没有新增保存框架或HTTP旁路。原owner saveIds会保存当前patch，但命令在进入前已限制为唯一自身字段，避免先前全量save夹带用户新草稿。
5. owner原save完成会refresh、同步currentRow、核所有提交patch回读并清未确认记录（blueprint-workspace-dataview.ts:1227–1241）。发布:247恢复默认干净检查；:248–249核读回VersionId；expectedVersionId保留本次已确认值供下一文件使用。故rule→script→style可以逐步推进，不会因自身VersionId改变误认“外部修改”，也不会把自己的待存patch在提交前按默认clean规则拒绝。
6. :224–226仍只接受精确cfg:<pageId>与当前applicationId构成的存储定位；:114仅要求NavigationUrl可读与VersionId可读写；发布不再修改NavigationUrl。没有扩大未修改字段的写权限要求，也没有取消真正VersionId的权限检查。
7. :235–257保留已确认快照/尝试引用/确认引用的部分成功诊断；guard失败不声称撤销已产生快照，不继续后续文件写入。

## 两条并发用例及证据范围

文件 tests/app/dev/file-versions/blueprint-workspace-delivery.test.ts：

- :348–369 延迟第一份snapshot；实际DataView.updateEditingValue改NavigationUrl，保持测试UI activePageId旧值；断言只有一次snapshot、DataSet.saveChanges为0、新URL草稿保留、持久行原值保留。它验证正式DataView可变而UI投影暂未同步时命令自身仍守身份；不是声称NodeTargetConfig正常下拉必然不同步（其handlePathChange路径此前已单独核过）。
- :372–394 延迟第一份snapshot后调用真实BlueprintWorkspaceDataView.update('Manhour',17)，断言只有一次snapshot、0保存、新草稿保留、持久Manhour=2且VersionId仍旧值。这与真实EstimatePane→父draft setter→owner.update的已核操作链等价；测试本身没有实际点击EstimatePane控件，报告不夸大为完整UI操作回放。
- 两例fixture使用真实DataSet、真实BlueprintWorkspaceDataView与正式query/save适配（:44–69、:91–95），只延迟末端snapshot边界，没有mock掉owner.dirty/getEditingPatch。activePageId初值由ProjectBlueprint正式投影得到（:72–77）。
- 正常三步用例:286–301明确三次快照同tool-A/APP-A/tool-A，最终rule=8;script=8;style=8且NavigationUrl不变；:304–314覆盖NavigationUrl只读而VersionId可写。它们的预期与上述阶段推演一致；本轮未运行这些测试，结果由主控独立日志确定。

## 未判与不扩面

不重审完整Workspace、任意并发后端事务、普通旧cfg库存迁移或全部UI。已有动态旧cfg格式缺少库存不能作为本次规范cfg发布修复的阻断；本修复明确拒绝非法/未明确支持身份，不自动剥路径或fallback。底层DataSet在自身save过程中的异步编辑/权限/回执守卫沿既有合同，本轮没有改造或重新全审。

## 最终读取 SHA-256

- BlueprintWorkspace.vue：33DB661F54D122FA7751F325B4BD9C2EF8994ECE11BEA0F632D368BF4B2D4F1F
- blueprint-workspace-delivery.test.ts：2D945F1A1DD8A3F3B999335EA849B3463CAE860DE9D1EF2879BEA06E1DBB8C43
