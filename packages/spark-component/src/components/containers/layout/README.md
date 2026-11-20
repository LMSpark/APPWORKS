# non-data-components

这里存放不以 DataSet / DataView 为核心的容器 Vue 组件。

判定标准：

1. 组件主要负责布局、分组、分步、弹层、标签页、折叠、区块组织
2. 组件即使承载子内容，也不直接承担数据主流程编排
3. 核心关注点是 UI 结构，而不是数据视图绑定

当前典型组件：

1. `RendererTabs`
2. `RendererTabPane`
3. `RendererCollapse`
4. `RendererCollapseItem`
5. `RendererDialog`
6. `RendererDrawer`
7. `RendererSteps`
8. `RendererStepItem`
9. `RendererSection`
10. `RendererToolbar`