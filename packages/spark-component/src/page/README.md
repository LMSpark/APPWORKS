# page

页面渲染层现在按职责分组：

1. `renderer/`：页面根渲染器与渲染期 composable
2. `context/`：页面脚本上下文、路由快照、类型、页面组件注册中心
3. `services/`：PAGE_SERVICE、页面运行时服务载荷、Render* 注册、页面日志
4. `sandbox/`：脚本编译与 CSS 作用域工具
5. `binding/`：规则绑定标准化管线
6. `actions/`：页面 action descriptor 运行时

优先入口：

1. `index.ts`
2. 看页面渲染主流程时优先进 `renderer/`
3. 看脚本运行时契约时优先进 `context/`
4. 看页面服务与注册逻辑时优先进 `services/`
5. 看沙箱与样式隔离时优先进 `sandbox/`
