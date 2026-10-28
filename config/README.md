# SPARK AppWorks 配置目录

`config/` 是手写配置的 canonical source。配置只表达系统行为声明，不承载执行逻辑。

## 分层规则

- `config/`：源码仓库级配置，供构建工具、运行时 adapter、AI 工具和校验器读取。
- `public/config/`：部署期/租户运行配置，由浏览器启动时加载，可被环境覆盖。
- `src/registries/`：把 JSON 配置绑定到代码资源，如 Vue 组件动态 import。
- `src/services/`：业务服务和生成产物消费者，不放手写配置源。
- `packages/`：通用 loader、validator、协议解析能力，不放根应用私有配置数据。

## 当前配置

- `navigation/vue-pages.json`：Vue 页面组件注册，作为路由组件、公共路径和设计器页面选项的配置源。
- `applications/appworks.json`：AppWorks builtin system application 的仓内身份、导航资源及已迁入场景资源索引。导航节点来自 `navigation/appworks-system.json`；四个声明场景由仓内 pagedata 唯一供给，其正文经 SPARK data file DataView executor 读取。四场景开发态可经 SPARK data 保存，构建态只读；场景历史和工具定义仍未迁入。manifest 只登记资源，不复制导航或场景正文。
- `navigation/appworks-system.json`：正式核对过的 AppWorks 系统导航节点子集，保留原 node ID、父子层级、顺序和 Vue URL；运行时仍消费后台菜单授权响应，不把仓内程序定义当作数据授权。
- `schemas/*.schema.json`：配置协议的 JSON Schema。

用户动态应用的应用目录记录、导航、页面和场景配置继续由其正式 lowcode 来源提供；AppWorks builtin 应用身份、已登记导航定义和四个场景配置由仓内资源唯一供给，读取失败时不回退到 lowcode 应用/蓝图/场景定义。运行菜单仍依据正式后台授权响应过滤。其余尚未完成来源迁入的系统页面与场景不因此视为已合仓。页面配置样本只作为迁移与差分证据保存在 `backend-api-contracts/characterization-fixtures/pages-config/`，样本清单见同目录 `manifest.json`，并由 `pnpm run verify:pages-config` 校验。

## 格式约定

- 纯声明数据使用 JSON，并通过 `protocol` + `schemaVersion` 标识协议。
- 需要 import、函数、组件绑定或派生 helper 的逻辑放在 `src/registries/` 或 loader 中。
- generated JSON/TS 不放在本目录；生成物应靠近消费方或进入专门的 generated 目录。
