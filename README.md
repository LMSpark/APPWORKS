# SPARK AppWorks

> SPARK 融合平台的应用工场，面向 Vue 3 和 Element Plus，内置数据视图、权限策略和受约束的 AI 配置生成能力

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-brightgreen.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF.svg)](https://vitejs.dev/)

## 适合什么场景

- 配置驱动的后台页面、运营平台、管理系统
- 表格、表单、树形编辑、主从联动等复杂页面编排
- 需要统一权限策略、数据模型和页面配置体系的团队

## 为什么不是另一个 JSON 表单生成器

- 页面绑定围绕 DataSet 和 DataView 组织，不只是把字段渲染出来
- 权限控制覆盖字段、动作和页面模式，而不是零散地写在组件里
- 内置树数据、聚合、计算列、跨表联动等企业后台常见能力
- 配置系统、脚本沙箱和 AI 配置生成可以接到同一条工作流里

## 为什么不主打生成代码

- AI 主要生成 `rule.json`、`pagedata.json`、`style.css` 和最小化 `script.js`，而不是无边界地改整个代码仓库
- 生成结果进入固定运行时解释执行，可靠性依赖平台内核，而不是依赖每次生成的偶然正确性
- 配置天然更适合做结构校验、依赖校验、权限校验、回滚和审计
- 对企业场景来说，可控、可验证、可维护，比“多生成一些代码”更有价值

## 5 分钟内先看到什么

```bash
# 1. 克隆仓库
git clone https://github.com/LMSpark/spark-view-vue.git SPARK_AppWorks
cd SPARK_AppWorks

# 2. 安装依赖
pnpm install

# 3. 配置 lowcode-jdk17 gateway（也可写入 .env.local）
$env:LOWCODE_GATEWAY_URL='http://127.0.0.1:8080'

# 4. 启动前端
pnpm run dev
```

- `pnpm run dev` 只启动 Vite；开发态同源 `/api` 由 `LOWCODE_GATEWAY_URL` 代理到 lowcode-jdk17 gateway。
- AppWorks 不编译、启动或部署服务端，也不保存平台密钥。

## 核心特性

- **类型安全** - TypeScript 严格模式，能力键、页面配置和数据模型都有明确类型边界
- **配置驱动** - 基于页面结构配置和数据配置搭建复杂页面，而不是散落的命令式代码
- **稳定运行时** - AI 负责生成受约束配置，固定渲染链负责解释执行，降低生成不确定性
- **权限内建** - 页面模式、字段可见性、字段可编辑性和动作权限统一收口
- **数据视图模型** - DataSet、DataView、TreeManager、计算列和聚合面向真实业务页面
- **能力系统** - 基于 Symbol 和上下文契约的松耦合组件通信，支持延迟绑定
- **插件和扩展** - 可以接入 Element Plus、VxeTable 和自定义组件注册体系
- **工程纪律** - pnpm workspace、严格 lint/typecheck、Vitest 测试和约束化提交流程

## 📦 包结构

```
packages/
├── spark-ai/                    # 🤖 AI 运行时（Function Calling 会话、DTS ClassModel 知识、页面编辑工具）
├── spark-app/                   # 🏗️ 应用层基础设施（路由、认证、宿主配置、插件系统）
├── spark-component/             # ⚙️ 组件核心系统（注册表、能力管理、上下文、页面渲染器）
├── spark-data/                  # 📊 数据空间（DataSet、DataView、TreeManager、关系与聚合）
├── spark-project-model/         # 📄 软件项目模型（ProjectModel、项目蓝图节点、配置页内容子模型）
├── spark-lowcode-api/           # 🔌 可发布的 lowcode-jdk17 前端 API 合同、领域入口与治理计划
├── spark-utils/                 # 🛠️ 共享工具（Logger、HTTP、能力键、基础类型）
└── vite-plugin-spark-catalog/   # 组件扫描配置与命名工具
```

- 运行时主线：`spark-app` + `spark-component` + `spark-data` + `spark-project-model` + `spark-lowcode-api`
- AI 主线：`spark-ai` + `generated/dts-class-model`；Agent 在前端运行并通过治理后的 lowcode API 消费平台能力
- 公共基础：`spark-utils`
- 目录索引： [packages/README.md](packages/README.md) 、 [scripts/README.md](scripts/README.md) 、 [tools/README.md](tools/README.md)

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动前端开发环境（需配置 lowcode-jdk17 网关）
pnpm run dev

# 构建生产版本
pnpm run build

# 类型检查（严格模式）
pnpm run typecheck

# 代码质量检查
pnpm run lint

# 运行测试套件
pnpm run test
```

推荐先从 [docs/README.md](docs/README.md) 看文档入口，再进入 [docs/guides/QUICKSTART.md](docs/guides/QUICKSTART.md) 上手。

## 首发最该展示的 3 个 demo

如果你准备把项目正式对外发布，首页和录屏建议先只展示下面 3 个页面。它们最能说明 SPARK 的差异化，而不是把所有能力同时摊开。

1. **tree-demo**
   一个完整的树形导航编辑器，包含树容器、表单编辑、工具栏动作、当前节点联动和页面脚本。这个页面最适合做首页首屏，因为它最容易让人感受到“这不是组件拼装，而是一套页面引擎”。
2. **master-detail**
   点击主表行自动切换子表数据，突出 DataView 驱动的零代码联动。这个页面最适合接在 tree-demo 后面，帮助用户快速理解 SPARK 在企业后台里的直接价值。
3. **permission-render**
   用同一套页面结构演示不同权限快照下的渲染结果，突出“改权限不改页面代码”。这个页面适合放第三位，证明权限不是附属能力，而是内建能力。

第二梯队演示建议：

- **smart-load**：展示依赖链驱动的数据智能加载，适合放在深入能力部分
- **dynamic-columns**：展示动态列和可配置表格能力，适合补充数据视图表达力
- **vxe-demo**：展示插件接入与扩展能力，适合面向更重表格场景的用户

## 首页展示顺序建议

1. 第一屏：tree-demo 截图或录屏，标题只讲一句话定位
2. 第二屏：master-detail，强调零代码联动
3. 第三屏：permission-render，强调权限策略内建
4. 第四屏：用简图解释页面结构配置、数据模型和脚本如何协同
5. 第五屏：再补 smart-load、dynamic-columns、vxe-demo 作为进阶能力

## 理解这个项目的最短路径

如果你是第一次接触 SPARK，建议按下面顺序理解，而不是先进入包结构和内部实现细节：

1. **页面结构配置**
   用 `rule.json` 描述页面布局、容器、字段、事件和工具栏。
2. **页面数据模型（分层）**
   - **设计/AI 轴**：四文件里的 `pagedata.json` 描述本地 DataSet 草稿（表、视图、关系等），供设计器与生成器编辑。
   - **运行轴**：页面有 `formKey + dataSpaceId + modelId`（`PageDataSpaceBinding`）时，运行态 DataSet 只由平台 **DataSpace + 权限** 装配，不再把 `pagedata.json` 当运行真源。
3. **页面数据绑定**
   通过 DataViewKey 把容器和 DataView 连接起来，例如 `Users@default`；展示和动作需要读取 DataView 输出时使用 `dataViewKey + dataMember + dataField`，例如 `dataViewKey: "Orders@detail", dataMember: "currentRow", dataField: "total"`。
4. **页面行为脚本**
   在 `script.js` 里只写最小化业务分支和页面行为，数据管理仍然通过 DataSet 流转。
5. **组件能力系统**
   当页面复杂度上来时，再理解能力系统、组件注册和上下文契约。

## 一个最小页面长什么样

下面这段配置比大段架构说明更能帮助新用户理解 SPARK 的工作方式：

```json
{
  "type": "r-table",
  "props": {
      "dataViewKey": "Users@default",
    "border": true,
    "stripe": true,
    "highlightCurrentRow": true
  },
  "children": [
    {
      "type": "r-text",
         "props": { "field": "name", "label": "姓名" }
    },
    {
      "type": "r-text",
         "props": { "field": "role", "label": "角色" }
    }
  ]
}
```

这段配置背后对应的是同一套运行时模型：

- 页面结构配置决定渲染什么
- 页面数据模型决定数据从哪里来
- DataViewKey 决定容器绑定到哪个 DataView，`dataMember` 和 `dataField` 决定读取 DataView 的哪个成员与业务字段
- 权限和页面模式决定字段最终是否可见、可编辑、可操作

## 对外理解的 4 个核心概念

### 1. 页面结构配置

SPARK 用页面结构配置描述页面，而不是让每个页面都从零开始写 Vue 模板。容器组件、字段组件、工具栏和动作都在同一套结构里组织。

### 2. 数据视图模型

SPARK 不直接把原始 JSON 丢给组件，而是通过 DataSet、DataTable、DataView 管理数据。这样主从联动、树形结构、计算列、聚合和选中态才能统一工作。

### 3. 页面权限策略

权限不是零散地塞进单个组件的 `disabled` 或 `v-if`，而是通过统一的权限快照和页面模式进入渲染链。这样同一页面能稳定支持只读、脱敏、不可见等模式。

### 4. 组件能力系统

能力系统负责在复杂容器里做松耦合通信。大部分新用户不需要一开始就理解它，但当你要扩展树、表格、动作栏、选择状态这些复杂交互时，它是关键基础设施。

## 对外讲法建议

如果你要对外介绍 SPARK，建议优先使用下面这套说法，而不是直接抛内部术语：

- 页面结构配置：比 `rule.json` 更容易被外部理解
- 页面数据模型：比 `pagedata.json` 更容易被外部理解
- 页面节点配置：比 `SparkNode` 更容易被外部理解
- 页面权限策略：比单讲 `permissionMode` 更容易被外部理解
- 页面行为脚本：比直接强调脚本沙箱更容易被外部理解
- 受约束配置生成：比“AI 生成代码”更准确地描述平台能力边界

## 📚 文档导航

文档入口统一从 [docs/README.md](docs/README.md) 开始。当前只保留中文主线和可执行指南：

- [快速开始](docs/guides/QUICKSTART.md)
- [项目整体认知](docs/SPARK_AppWorks_PROJECT_DEEP_DIVE_ZH.md)
- [spark-project-model 架构](docs/architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)
- [数据流架构](docs/architecture/DATAFLOW_ARCHITECTURE.md)
- [AI 编码标准](ai-coding-kit/AGENTS.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！请确保：

1. 遵循现有的代码规范和 TypeScript 严格模式
2. 添加相应的测试用例
3. 更新相关文档
4. 提交前运行 `pnpm run typecheck && pnpm run lint && pnpm run test`
5. 提交信息遵循 Conventional Commits，格式示例：`feat(spark-data): add X`。
   - 允许的 scope：`deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-ai`, `spark-component`, `spark-utils`, `spark-project-model`。
   - 详情与示例见 `CONTRIBUTING.md`（新增）。

## 📄 许可证

[MIT License](LICENSE)

---

**SPARK AppWorks** - SPARK 融合平台的应用工场，构建稳定、可控、可验证的配置驱动应用
