# D1 正式数据空间目录：只读接线研究

本任务只读源码，唯一允许写入 `notes/evidence/sparkproject-appworks-integration/c2-review/data-set-list-research.md`。不编写产品/测试，不调用有副作用后端，不开子代理，不搜索外网。不要修改正在实施的 C2a 文件。

依据主计划 D1 和固定参考 `E:/r/sparkproject` SHA `842dec4f11b333df904b9a4e26b6566b0802bab8`；参考只用 Git 对象，不读未提交参考实现。当前底座 `D:/SPARK_AppWorks`，HEAD `0b6c85d` 加本任务 C1/C2 改动。已有 reference-inventory.json 与 service-correspondence.json 用于定位，事实回源码验证；knowledge/README.md 若涉及则读取。

范围：正式数据空间目录页（原正式路径 `/features/data-platform/data-set-management/ui/data-set-list-page`），源 UI 到 owner 的可见操作（列出/搜索/新建/修改/删除/打开设计/授权等，以实际源码为准）；D2设计与D3权限只记录入口依赖，不展开完整引擎。

目标：逐文件完整读取源目录页、对应 owner、直接请求实现和当前 dataSpace.runtime/design/permission 的实际可承接入口，列出真实模型名/主键/应用过滤/场景身份/原始query context与保存确认路径。不要从菜单名猜 API，不引入参考第二宿主，不创建空场景/DataSet兜底，不改后端/schema/现有AI。

交付简短结构化研究：源操作→当前方法/缺口→只读可行性结论；精确候选文件清单；保存/删除回读与受限身份需要的真实前置；最小可打开列表闭环（搜索/分页/跳转+显式缺配置，不把未实现按钮伪成功），以及后续CRUD闭环。当前计划要求完整功能等价，列表读通不等于D1完成。最多两次必要定向搜索后沿调用链读，不罗列大段搜索输出。
