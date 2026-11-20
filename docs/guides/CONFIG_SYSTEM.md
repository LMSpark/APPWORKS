# 宿主配置

AppWorks 不再从本地 JSON、远程 `/api/config` 或租户模板加载启动配置。根应用 composition root `src/main.ts` 明确提供路由、插件、页面运行时和基础功能配置。

## 开发环境变量

```dotenv
LOWCODE_GATEWAY_URL=http://127.0.0.1:8080
VITE_AUDIT_REMOTE_LOGS=false
# VITE_AUDIT_LOG_ENDPOINT=/api/your-governed-audit-endpoint
```

- `LOWCODE_GATEWAY_URL` 只在 Vite 开发代理中使用；浏览器仍请求同源 `/api`。
- `VITE_AUDIT_REMOTE_LOGS=true` 时必须同时显式提供审计端点，不存在默认日志服务。
- 环境文件不得保存账号、口令、Token、数据库连接串或模型密钥。

## 企业和应用上下文

企业、用户与应用不是宿主配置：

```text
lowcode 登录会话
  -> enterprise identity
  -> active application
  -> project blueprint + authorized runtime navigation
```

前端不得从子域名、cookie、query 或 localStorage 发明平台身份。四级域名短名称必须与登录会话返回的企业短名称对账。

## 页面运行配置

`SparkApp.start()` 由 composition root 注入：

- `readPageFile`：通过 lowcode designfile API 读取页面文件。
- `loadNavigation`：读取项目蓝图派生并经后端授权的运行导航。
- `getProjectId`：读取当前 lowcode 应用身份。
- `componentMap`：由 Vue 页面注册表生成。

页面配置不是独立后端系统；页面只能经 FormKey、数据空间和前端模型进入运行闭包。
