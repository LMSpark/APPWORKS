# 应用源码目录索引

`src/` 是仓库根应用的前端源码目录，负责把各工作区包组装成实际运行的应用外壳。

## 主要分层

- `components/`：应用层组件和 UI 宿主组件。
- `views/`：页面级视图与平台页面入口。
- `services/`：前端服务、协议适配、HTTP 与调试链路封装。
- `layout/`：布局、导航和应用骨架。
- `config/`：前端配置读取与装配。
- `composables/`：应用层组合式逻辑。

## 边界原则

- 通用能力优先沉到 `packages/`，不要在这里复制一套基础设施。
- `src/` 负责“应用组装”和“平台页面宿主”，不是通用运行时核心。
- 当目录开始呈现明确业务域边界时，再建立独立业务域目录，避免提前保留空壳。

## 相关入口

- [main.ts](main.ts)
- [App.vue](App.vue)
- [components/README.md](components/README.md)
- [composables/README.md](composables/README.md)
- [config/README.md](config/README.md)
- [layout/README.md](layout/README.md)
- [services/README.md](services/README.md)
- [views/README.md](views/README.md)
- [../packages/README.md](../packages/README.md)
