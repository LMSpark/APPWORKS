/**
 * @module app:layout/demo-nav
 * 职责：提供主应用 demo-nav 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
 * 边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
 * AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 layout/demo-nav。
 */
import type { ProjectBlueprintTreeData } from '@spark-appworks/spark-project-model'

/**
 * 演示导航树 — 将 routes.json 中的扁平路由组织为模块化导航。
 *
 * childPlacement 演示：
 *   - 根 → header（模块在顶部水平显示）
 *   - 数据演示 → sidebar（子项在左侧栏）
 *   - 组件演示 → sidebar（子项在左侧栏）
 *   - 系统管理 → sidebar + parent（子菜单嵌套在侧栏内）
 */
export const demoNavRoot: ProjectBlueprintTreeData = {
  title: 'SPARK Demo',
  childPlacement: 'header',
  homePath: '/dashboard',
  children: [
    /* ── 工具栏（childPlacement: 'toolbar'，子项在右上角显示） ── */
    {
      id: '__toolbar__',
      nodeKind: 'system-directory',
      title: '工具栏',
      icon: 'SetUp',
      childPlacement: 'toolbar',
      children: [
        { id: 'tb-search', nodeKind: 'system-action', title: '搜索', icon: 'Search', path: 'search' },
        { id: 'tb-fullscreen', nodeKind: 'system-action', title: '全屏', icon: 'FullScreen', path: 'fullscreen' },
        { id: 'tb-notifications', nodeKind: 'system-action', title: '通知', icon: 'Bell', path: 'notifications' },
        { id: 'tb-theme', nodeKind: 'system-action', title: '主题切换', icon: 'Moon', path: 'theme-toggle' },
      ],
    },

    /* ── 用户菜单（childPlacement: 'user-menu'，右上角头像下拉） ── */
    {
      id: '__user-menu__',
      nodeKind: 'system-directory',
      title: '用户菜单',
      icon: 'User',
      childPlacement: 'user-menu',
      children: [
        { id: 'um-profile', nodeKind: 'system-action', title: '个人中心', icon: 'User', path: 'profile' },
        { id: 'um-settings', nodeKind: 'system-action', title: '系统设置', icon: 'Setting', path: 'settings' },
        { id: 'um-home', nodeKind: 'system-page', title: '返回主应用', icon: 'HomeFilled', path: 'home' },
      ],
    },

    /* ── 首页（叶子） ── */
    {
      id: 'home',
      nodeKind: 'system-page',
      title: '工作台',
      description: '个人工作台仪表板，汇总待办与统计',
      icon: 'DataBoard',
      path: '/',
    },

    /* ── 数据演示模块 → sidebar + 模块级上下文选项 ── */
    {
      id: 'data-demos',
      nodeKind: 'module',
      title: '数据管理',
      description: '数据绑定、级联、异步加载等数据层演示',
      icon: 'Connection',
      childPlacement: 'sidebar',
      redirect: '/dataset-demo',
      context: {
        source: [
          { id: 'proj-a', title: '项目 A — 电商平台' },
          { id: 'proj-b', title: '项目 B — 内部 OA' },
          { id: 'proj-c', title: '项目 C — 数据中台' },
        ],
        placeholder: '选择演示项目',
        defaultValue: 'proj-a',
        paramName: 'projectId',
      },
      children: [
        { id: 'dataset-demo', nodeKind: 'page', title: 'DataSet 主从表', icon: 'Connection', path: '/dataset-demo' },
        { id: 'cascade-demo', nodeKind: 'page', title: '级联操作', icon: 'Lightning', path: '/cascade-demo' },
        { id: 'async-demo', nodeKind: 'page', title: '异步数据', icon: 'Refresh', path: '/async-demo' },
        { id: 'smart-load', nodeKind: 'page', title: '智能依赖加载', icon: 'Cpu', path: '/smart-load' },
        { id: 'master-detail', nodeKind: 'page', title: 'Master-Detail', icon: 'Connection', path: '/master-detail' },
        { id: 'test-order', nodeKind: 'page', title: '订单测试', icon: 'Box', path: '/test-order' },
      ],
    },

    /* ── 组件演示模块 → sidebar ── */
    {
      id: 'component-demos',
      nodeKind: 'module',
      title: '组件演示',
      description: '渲染器容器、表格、表单、栅格等 UI 组件演示',
      icon: 'Grid',
      childPlacement: 'sidebar',
      redirect: '/renderer-demo',
      context: {
        source: [
          { id: 'ui-alpha', title: 'UI 方案 A — 紧凑主题' },
          { id: 'ui-beta', title: 'UI 方案 B — 标准主题' },
        ],
        placeholder: '选择 UI 方案',
        defaultValue: 'ui-alpha',
        paramName: 'uiPlan',
      },
      children: [
        { id: 'renderer-demo', nodeKind: 'page', title: 'Renderer 架构', icon: 'Brush', path: '/renderer-demo' },
        { id: 'section-grid', nodeKind: 'page', title: 'Section 栅格', icon: 'Grid', path: '/section-grid-demo' },
        { id: 'el-table-demo', nodeKind: 'page', title: 'el-table 操作列', icon: 'List', path: '/el-table-demo' },
        { id: 'vxe-demo', nodeKind: 'page', title: 'VXE 表格', icon: 'TrendCharts', path: '/vxe-demo' },
        { id: 'filter-demo', nodeKind: 'page', title: '过滤面板', icon: 'Search', path: '/filter-demo' },
        { id: 'capability-demo', nodeKind: 'system-page', title: '能力管理演示', icon: 'Aim', path: '/capability-demo' },
      ],
    },

    /* ── 树形结构模块 → sidebar ── */
    {
      id: 'tree-demos',
      nodeKind: 'module',
      title: '树形结构',
      description: '树组件、TreeTable、Node Scope 等树形结构演示',
      icon: 'Share',
      childPlacement: 'sidebar',
      redirect: '/tree-demo',
      children: [
        { id: 'tree-demo', nodeKind: 'page', title: '树形结构演示', icon: 'Share', path: '/tree-demo' },
        { id: 'treetable-demo', nodeKind: 'page', title: 'TreeTable 演示', icon: 'Share', path: '/treetable-demo' },
        { id: 'tree-node-scope', nodeKind: 'page', title: 'Node Scope', icon: 'Share', path: '/tree-node-scope-demo' },
      ],
    },

    /* ── 系统管理模块 → sidebar（含 parent 子菜单） ── */
    {
      id: 'system',
      nodeKind: 'module',
      title: '系统管理',
      description: '平台级管理功能：用户、权限、导航、缓存、页面配置',
      icon: 'Setting',
      childPlacement: 'sidebar',
      redirect: '/users',
      children: [
        { id: 'users', nodeKind: 'page', title: '用户管理', icon: 'UserFilled', path: '/users' },
        { id: 'permission-render', nodeKind: 'page', title: '权限渲染', icon: 'Lock', path: '/permission-render' },
        { id: 'dev-system', nodeKind: 'system-page', title: '开发系统', icon: 'Lightning', path: '/dev' },
        { id: 'workflow-designs', nodeKind: 'system-page', title: '工作流设计', icon: 'Share', path: '/workflow-designs' },
        { id: 'cache-manager', nodeKind: 'system-page', title: '缓存管理', icon: 'Coin', path: '/cache-manager' },
        { id: 'dashboard', nodeKind: 'system-page', title: '管理仪表板', icon: 'HomeFilled', path: '/dashboard' },
        { id: 'about', nodeKind: 'system-page', title: '关于系统', icon: 'InfoFilled', path: '/about' },
        {
          id: 'system-settings',
          nodeKind: 'module',
          title: '系统设置',
          description: '平台基本设置与参数配置',
          icon: 'Setting',
          childPlacement: 'parent',
          children: [
            { id: 'settings', nodeKind: 'system-page', title: '基本设置', icon: 'Setting', path: '/settings' },
          ],
        },
      ],
    },
  ],
}
