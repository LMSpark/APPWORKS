# 视图目录索引

`src/views/` 存放页面级视图与平台页面入口。迁回的 AppWorks 业务放在 `features/`，保留参考仓 `apps/appworks/src/ui/features/` 下的相对目录与入口文件名；现有壳层页面仍放在 `app/`、`platform/`、`tenant/`。

## 当前分层

- `app/`：主应用页面、demo 页面、dev-system 与应用级组件组合。
- `platform/`：平台级公共页面，例如首页、登录、关于页。
- `tenant/`：租户级管理与配置页面。
- `features/`：迁回的业务页面；原蓝图导航 URL 不变，由 `config/navigation/vue-pages.json` 绑定同路径下的 Vue 文件，按导航树渲染。

## 放置原则

- 页面入口和路由级视图放这里，不把页面级组件平铺到 `src/components/`。
- 复杂页面内部的局部组件可继续就近放在 `views/app/components/` 等子目录。
- 迁移不另建一套业务目录或修改蓝图 URL 适配本地命名。参考页的业务语义在对应文件内用标准组件和数据空间恢复；文件落点正确不代表业务已完整迁移。

## 相关目录

- [../components/README.md](../components/README.md)
- [../../docs/guides/QUICKSTART.md](../../docs/guides/QUICKSTART.md)
