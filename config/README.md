# SPARK AppWorks 配置目录

`config/` 是手写配置的 canonical source。配置只表达系统行为声明，不承载执行逻辑。

## 分层规则

- `config/`：源码仓库级配置，供构建工具、运行时 adapter、AI 工具和校验器读取。
- `public/config/`：部署期/租户运行配置，由浏览器启动时加载，可被环境覆盖。
- `src/registries/`：把 JSON 配置绑定到代码资源，如 Vue 组件动态 import。
- `src/services/`：业务服务和生成产物消费者，不放手写配置源。
- `packages/`：通用 loader、validator、协议解析能力，不放根应用私有配置数据。

## 当前配置

- `navigation/vue-pages.json`：Vue 系统页注册（路径、组件、`scope` 平台/企业/应用层级、分组与顺序），作为路由组件、平台与企业菜单（`src/lowcode/system-navigation.ts` 投影）和设计器页面选项的配置源。
- `pages/system-scenarios.json`：仓内系统场景登记，按 scenario 身份指向 `config/pages/**/pagedata.json`，不含应用身份。登记场景正文经 SPARK data file DataView executor 读取，开发态可经 SPARK data 保存，构建态只读；未登记场景继续使用各自正式 lowcode 来源，读取失败不互相回退。
- `schemas/*.schema.json`：配置协议的 JSON Schema。

用户应用的目录记录、导航与业务页面由其正式 lowcode 来源提供；应用末尾的“应用设计”分组与平台、企业菜单由系统页注册投影，页面数据权限仍由各页正式查询结果决定。页面配置样本只作为迁移与差分证据保存在 `backend-api-contracts/characterization-fixtures/pages-config/`，样本清单见同目录 `manifest.json`，并由 `pnpm run verify:pages-config` 校验。

## 格式约定

- 纯声明数据使用 JSON，并通过 `protocol` + `schemaVersion` 标识协议。
- 需要 import、函数、组件绑定或派生 helper 的逻辑放在 `src/registries/` 或 loader 中。
- generated JSON/TS 不放在本目录；生成物应靠近消费方或进入专门的 generated 目录。
