# Vue 前端

### 框架无关包禁止导入 Vue

- **场景**：在 `packages/spark-data/` 或 `packages/spark-utils/` 中编写代码
- **规则**：`spark-data` 和 `spark-utils` 是框架无关包，禁止导入 Vue、Vue Router、Element Plus、VueUse 或 Pinia。需要响应式的逻辑应放在 `spark-component/` 或 `src/` 中。
- **违反后果**：`verify:ai-codegen` 会报违规；框架无关包与 Vue 耦合后无法在非 Vue 环境中使用

### .props.ts + .vue 必须配对入子目录

- **场景**：新增一个表单字段组件（如 FieldDatePicker）
- **规则**：`.props.ts` + `.vue` 配对文件必须放入组件专属子目录（如 `data-components/FieldDatePicker/FieldDatePicker.props.ts` + `FieldDatePicker.vue`），禁止平铺在父目录。
- **违反后果**：`verify:ai-codegen` 检测组件配对文件平铺会报违规；平铺后目录文件数很快超过 10 个限制

### Element Plus 组件的使用约定

- **场景**：在页面视图中使用 UI 组件
- **规则**：本项目统一使用 Element Plus 组件库。图标使用 `@element-plus/icons-vue`。表格场景优先使用 `vxe-table`（高性能虚拟滚动），普通表单用 Element Plus 原生组件。
- **违反后果**：混用其他组件库（如 Ant Design Vue）→ 样式不一致、包体积膨胀

### Vue 3 Composition API

- **场景**：编写 Vue 组件逻辑
- **规则**：使用 Composition API（`<script setup>` + `useXxx` 组合式函数），不使用 Options API。状态管理用 Vue 3 原生响应式（`ref`/`reactive`/`computed`），不引入 Pinia 除非涉及跨组件全局状态。
- **违反后果**：Options API 代码与项目风格不一致，增加维护成本

### src/services/ 的领域分组

- **场景**：在前端服务层新增或修改代码
- **规则**：`src/services/` 必须按领域分组（`ai/`、`page-design/`、`project/`），不是平铺。同一级目录下文件和子目录不超过 7 个。
- **违反后果**：平铺后超过 7 个条目违反目录规则；AI 和人类都难以定位相关服务

### src/views/ 的路由对应

- **场景**：新增页面视图
- **规则**：`src/views/` 的目录结构与路由对应：`app/` = 应用页面，`platform/` = 平台管理，`tenant/` = 租户管理。`dev-system/` 是项目蓝图开发工作台，树组件、预览和数据集设计器都消费同一 `ProjectWorkspace.project`，不能另建导航或页面身份。
- **违反后果**：视图放在错误目录下 → 路由配置找不到组件
