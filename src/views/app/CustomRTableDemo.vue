<!--
@module app:views/app/CustomRTableDemo
职责：提供主应用 CustomRTableDemo 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/app/CustomRTableDemo。
-->
<template>
  <div class="custom-r-table-demo">
    <header class="custom-r-table-demo__hero">
      <div>
        <p class="custom-r-table-demo__eyebrow">SPARK Demo</p>
        <h1>原始 r-table Children Bridge 演示</h1>
        <p class="custom-r-table-demo__summary">
          这个页面直接使用原始 RendererTable，
          验证它内部的 SparkChildrenBridge 已经可以把外部 slot 传入的字段桥接成表格列。
        </p>
      </div>
      <div class="custom-r-table-demo__meta">
        <div class="custom-r-table-demo__meta-item">
          <span class="custom-r-table-demo__meta-label">宿主语义</span>
          <strong>r-table</strong>
        </div>
        <div class="custom-r-table-demo__meta-item">
          <span class="custom-r-table-demo__meta-label">列桥接</span>
          <strong>RendererTable 内置</strong>
        </div>
        <div class="custom-r-table-demo__meta-item">
          <span class="custom-r-table-demo__meta-label">数据来源</span>
          <strong>DATA_SOURCE</strong>
        </div>
        <div class="custom-r-table-demo__meta-item">
          <span class="custom-r-table-demo__meta-label">children 桥接</span>
          <strong>SparkChildrenBridge</strong>
        </div>
        <div class="custom-r-table-demo__meta-item">
          <span class="custom-r-table-demo__meta-label">表格内核</span>
          <strong>原始 RendererTable</strong>
        </div>
      </div>
    </header>

    <div class="custom-r-table-demo__grid">
      <section class="custom-r-table-demo__panel">
        <h2>运行效果</h2>
        <p class="custom-r-table-demo__panel-desc">
          下方表格就是原始 RendererTable，页面层只负责提供 DATA_SOURCE。
        </p>
        <RendererTable type="r-table" border stripe>
          <FieldText type="r-text" field="name" label="姓名" :width="160" />
          <FieldNumber type="r-number" field="age" label="年龄" :width="100" />
          <FieldNumber type="r-number" field="score" label="绩效分" :width="120" />
          <FieldText type="r-text" field="department" label="部门" :width="140" />
        </RendererTable>
      </section>

      <section class="custom-r-table-demo__panel">
        <h2>核心代码</h2>
        <p class="custom-r-table-demo__panel-desc">
          关键点现在是两件事：页面层提供 DATA_SOURCE，原始 RendererTable 继续直接承接 slot 字段列。
        </p>
        <pre class="custom-r-table-demo__code"><code>{{ hostSnippet }}</code></pre>
      </section>
    </div>

    <section class="custom-r-table-demo__notes">
      <h2>这个 demo 证明了什么</h2>
      <ul>
        <li>这里展示的就是原始 RendererTable，本页没有再包额外的表格宿主组件。</li>
        <li>FieldNumber 在 r-table 宿主下会渲染成表格列，而不是输入框。</li>
        <li>只要页面层提供 DATA_SOURCE，RendererTable 继承同一个本地 DataView。</li>
        <li>外部 slot 透传字段的桥接点在 RendererTable 内部，通用组件就是 SparkChildrenBridge。</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 自定义表格演示，展示 r-table children 桥接机制和自定义列渲染能力；仅用于开发演示，不进入组件配置目录。
 */
import { FieldNumber, FieldText, DATA_SOURCE, RendererTable, useSparkContextScope } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'

const employeeDataSet = SparkData.createDataSet({
  dataSetName: 'CustomRTableDemo',
  tables: {
    Employees: {
      tableName: 'Employees',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' },
        { name: 'age', type: 'number' },
        { name: 'score', type: 'number' },
        { name: 'department', type: 'string' },
      ],
      views: {
        default: {
          rows: [
            { id: 1, name: '陈岚', age: 28, score: 91, department: '产品' },
            { id: 2, name: '赵宁', age: 33, score: 87, department: '研发' },
            { id: 3, name: '林澈', age: 30, score: 95, department: '设计' },
          ],
        },
      },
    },
  },
})


const { sparkProvide } = useSparkContextScope('custom-r-table-demo-page')
const employeeView = employeeDataSet.getView('Employees', 'default')
if (!employeeView) throw new Error('demo Employees view missing')
sparkProvide(DATA_SOURCE, employeeView)

const hostSnippet = `<script setup lang="ts">
import {
  DATA_SOURCE,
  RendererTable,
  useSparkContextScope,
} from '@spark-appworks/spark-component'


const { sparkProvide } = useSparkContextScope('custom-r-table-demo-page')
const employeeView = employeeDataSet.getView('Employees', 'default')
if (!employeeView) throw new Error('demo Employees view missing')
sparkProvide(DATA_SOURCE, employeeView)
<\/script>

<template>
  <RendererTable border stripe>
    <FieldText type="r-text" field="name" label="姓名" :width="160" />
    <FieldNumber type="r-number" field="age" label="年龄" :width="100" />
  </RendererTable>
</template>
`

</script>

<style scoped>
.custom-r-table-demo {
  display: grid;
  gap: 24px;
  padding: 24px;
}

.custom-r-table-demo__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: 20px;
  padding: 24px;
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(18, 123, 142, 0.16), transparent 34%),
    linear-gradient(135deg, #fbf6eb 0%, #eef6f8 100%);
  border: 1px solid rgba(17, 24, 39, 0.08);
}

.custom-r-table-demo__eyebrow {
  margin: 0 0 8px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.custom-r-table-demo__hero h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.15;
  color: #0f172a;
}

.custom-r-table-demo__summary {
  margin: 12px 0 0;
  max-width: 720px;
  color: #334155;
  line-height: 1.7;
}

.custom-r-table-demo__meta {
  display: grid;
  gap: 12px;
}

.custom-r-table-demo__meta-item {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.custom-r-table-demo__meta-label {
  display: block;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
}

.custom-r-table-demo__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.9fr);
  gap: 20px;
}

.custom-r-table-demo__panel,
.custom-r-table-demo__notes {
  padding: 20px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
}

.custom-r-table-demo__panel h2,
.custom-r-table-demo__notes h2 {
  margin: 0 0 10px;
  font-size: 18px;
  color: #0f172a;
}

.custom-r-table-demo__panel-desc {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.6;
}

.custom-r-table-demo__code {
  overflow: auto;
  margin: 0;
  padding: 16px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.6;
}

.custom-r-table-demo__notes ul {
  margin: 0;
  padding-left: 18px;
  color: #334155;
  line-height: 1.8;
}

@media (max-width: 960px) {
  .custom-r-table-demo__hero,
  .custom-r-table-demo__grid {
    grid-template-columns: 1fr;
  }
}
</style>
