# containers

容器层按“公开组件 / 内部支撑 / 组合函数”分层：

1. `data-views/`：DataView-first 容器组件（table / form / detail / tree / list）
2. `layout/`：布局与交互型容器组件（section / dialog / drawer / tabs / steps 等）
3. `runtime/`：容器运行时解析、布局归一化和事件桥接
4. `zones/`：header / footer / filter / editor / tail 等命名区域
5. `support/`：内部桥接与工具（host/row scope、CRUD helpers、slot scope）

实践约束：

1. 公开可配置容器优先放到 `data-views/` 与 `layout/`
2. 内部桥接组件与纯工具函数统一放到 `support/`
3. `use*` 组合函数统一放到 `composables/`，避免根目录混放
