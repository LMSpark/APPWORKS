# D1c 后续目录写操作可行性研读（只读委派）

用户已授权低阶模型实施、主控派工验收与长期利益裁决。当前主控已接受 D1a 只读目录、唯一生产 writer 正在 D1b 应用筛选。你只读研究下一轮必要写操作合同，不碰任何生产/测试/配置，不跑测试/build/浏览器/后端探测，不提交。

输出唯一文件 notes/evidence/sparkproject-appworks-integration/d1c/crud-feasibility.md。精简，但结论需可定位实际源码与调用方，不引用计划当作事实。

事实源：D:/SPARK_AppWorks 当前 src/lowcode/data-space/lowcode-data-space-catalog.ts、该页、src/lowcode/lowcode-runtime.ts 以及 packages/spark-lowcode-api 的 dataSpace runtime.save/context/save result/permission、现有真实保存调用方和测试。参考只从 E:/r/sparkproject 的 Git SHA 842dec4f11b333df904b9a4e26b6566b0802bab8 读取 apps/appworks/src/data/api/data-set/list.ts 与 apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue；不使用参考工作树改动。

请逐项回答：
1. 参考 create/update/delete 的真实字段、空值语义、权限、确认及保存回读流程；当前统一 runtime.save 能否完整承接？参数/返回/原context权限凭据的实际最小调用是什么？
2. 当前只读投影移除了原context，怎样在现有领域owner私有持有真实context与原行，避免UI掩码/隐藏字段写回，避免另一页或过时查询context提交？只提出必要机制，禁止造通用框架。
3. add/edit/delete action与字段可编辑需查哪些当前context方法？缺失行key、无权限、masked/invisible、readonly、scope失效、保存后旧context重用，分别如何防止。
4. 当前数据字段会通过context.prepareNewRow产生真实rowid；禁止随便发明业务ID或新的scenario。新增应只选择本场景应用目录内的业务sysid；当前执行AppId独立。
5. 给主控下一最小切片精确文件候选（优先3现有文件，只做create+readback或edit+readback之一；不直接同时上CRUD），所需有辨别力的RED/GREEN与边界。业务真实写回只能用显式标识的测试数据；不删除/修改已有真实记录，最后列需主控安排的可逆测试资源或真实外部阻塞。

文件数、现有classowner/SSOT、禁止非as const断言、不改共享API或后端、无新依赖优先。不要实现、不要扩大到设计器/权限授予/应用绑定。若仅3文件不够，说明实际依赖原因，由主控裁决。回报关键发现+报告路径即可，不复制大段原输出。
