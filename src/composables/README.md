# Composables 目录说明

`src/composables/` 存放根应用层的组合式逻辑，用来把路由、HTTP、SSE、通知或页面宿主行为封装成可复用的前端调用接口。

## 当前内容

- 原会话相关 composable 已迁移到 `packages/spark-component/src/composables/`。
- `useApplicationRouter.ts`：应用路径拼接与页面跳转辅助。
- `useNotifications.ts`：通知/消息相关组合逻辑。

## 放置原则

- 这里适合“应用层编排”逻辑，不适合沉淀框架无关的运行时核心。
- 一旦某个 composable 被多个包共享，优先抽到 `packages/`，不要长期留在根应用目录。
- 如果某个 composable 只服务单一业务域，后续可迁入对应页面域目录。

## 相关入口

- [../services/README.md](../services/README.md)
