<!--
@module app:views/app/RFormCompareDemo
职责：提供主应用 RFormCompareDemo 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/app/RFormCompareDemo。
-->
<template>
  <div class="r-form-compare-demo">
    <header class="r-form-compare-demo__hero">
      <div>
        <p class="r-form-compare-demo__eyebrow">SPARK Demo</p>
        <h1>原始 r-form 配置式与模板式对照</h1>
        <p class="r-form-compare-demo__summary">
          这两个表单底层都直接使用原始 RendererForm，
          差别只在 children 的来源：左边是 SparkNode 配置数组，右边是 Vue slot 模板子节点。
        </p>
      </div>

      <div class="r-form-compare-demo__meta">
        <div class="r-form-compare-demo__meta-item">
          <span class="r-form-compare-demo__meta-label">表单内核</span>
          <strong>原始 RendererForm</strong>
        </div>
        <div class="r-form-compare-demo__meta-item">
          <span class="r-form-compare-demo__meta-label">数据绑定</span>
          <strong>{{ formViewKey }}</strong>
        </div>
        <div class="r-form-compare-demo__meta-item">
          <span class="r-form-compare-demo__meta-label">宿主语义</span>
          <strong>r-form</strong>
        </div>
        <div class="r-form-compare-demo__meta-item">
          <span class="r-form-compare-demo__meta-label">children 桥接</span>
          <strong>SparkChildrenBridge</strong>
        </div>
      </div>
    </header>

    <section class="r-form-compare-demo__selector-panel">
      <div>
        <h2>切换 currentRow</h2>
        <p class="r-form-compare-demo__panel-desc">
          点击下面任意成员，两边表单会一起切到同一条 currentRow，证明差别只在字段声明方式，不在数据链路。
        </p>
        <div class="r-form-compare-demo__selector-buttons">
          <button
            v-for="employee in employees"
            :key="employee.id"
            type="button"
            :class="[
              'r-form-compare-demo__selector-button',
              { 'is-active': employee.id === activeEmployeeId },
            ]"
            @click="selectEmployee(employee.id)"
          >
            <strong>{{ employee.name }}</strong>
            <span>{{ employee.department }} / {{ employee.role }}</span>
          </button>
        </div>
      </div>

      <div class="r-form-compare-demo__current-row-card">
        <span class="r-form-compare-demo__current-row-label">当前记录</span>
        <strong>{{ activeEmployee?.name ?? '未选择' }}</strong>
        <p>{{ currentRowDescription }}</p>
      </div>
    </section>

    <div class="r-form-compare-demo__grid">
      <section class="r-form-compare-demo__panel">
        <h2>配置式 children</h2>
        <p class="r-form-compare-demo__panel-desc">
          字段定义来自 SparkNode 数组，适合 rule.json、后端配置生成、远程页面编排。
        </p>
        <RendererForm
          type="r-form"
          :data-view-key="formViewKey"
          :children="configChildren"
          label-width="92px"
        />
      </section>

      <section class="r-form-compare-demo__panel">
        <h2>模板式 slot</h2>
        <p class="r-form-compare-demo__panel-desc">
          字段直接写在 Vue 模板里，适合本地业务组件把 RendererForm 当作宿主直接组合。
        </p>
        <RendererForm type="r-form" :data-view-key="formViewKey" label-width="92px">
          <div class="r-form-compare-demo__template-fields">
            <FieldText type="r-text" field="name" label="姓名" />
            <FieldText type="r-text" field="department" label="部门" />
            <FieldText type="r-text" field="role" label="角色" />
            <FieldNumber type="r-number" field="age" label="年龄" :min="18" :max="60" />
            <FieldNumber type="r-number" field="score" label="绩效分" :min="0" :max="100" />
          </div>
        </RendererForm>
      </section>
    </div>

    <div class="r-form-compare-demo__grid r-form-compare-demo__grid--code">
      <section class="r-form-compare-demo__panel">
        <h2>配置式写法</h2>
        <pre class="r-form-compare-demo__code"><code>{{ configSnippet }}</code></pre>
      </section>

      <section class="r-form-compare-demo__panel">
        <h2>模板式写法</h2>
        <pre class="r-form-compare-demo__code"><code>{{ templateSnippet }}</code></pre>
      </section>
    </div>

    <section class="r-form-compare-demo__notes">
      <h2>这个 demo 证明了什么</h2>
      <ul>
        <li>两边底层都是原始 RendererForm，没有再包自定义表单宿主。</li>
        <li>配置式把字段定义放进 SparkNode children，模板式直接写 Vue slot children。</li>
        <li>两边共用同一个 PAGE_DATASET 和同一个 Users@default 视图，所以切换记录时会同时更新。</li>
        <li>选择哪种写法，取决于页面来源：远程配置优先配置式，本地 Vue 组件编排优先模板式。</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 表单渲染对比演示，对比配置驱动 r-form 与手写模板两种表单实现方式；仅用于开发演示，不进入组件配置目录。
 */
import { computed, ref } from 'vue'
import {
  FieldNumber,
  FieldText,
  PAGE_DATASET,
  RendererForm,
  useSparkContextScope,
} from '@spark-appworks/spark-component'
import { SparkData, type DataRow, type SparkNode } from '@spark-appworks/spark-data'

type EmployeeRecord = DataRow & {
  id: number
  name: string
  department: string
  role: string
  age: number
  score: number}

const employees: EmployeeRecord[] = [
  { id: 1, name: '陈岚', department: '产品', role: '产品经理', age: 28, score: 91 },
  { id: 2, name: '赵宁', department: '研发', role: '前端工程师', age: 33, score: 87 },
  { id: 3, name: '林澈', department: '设计', role: '交互设计师', age: 30, score: 95 },
]

const employeeDataSet = SparkData.createDataSet({
  dataSetName: 'RFormCompareDemo',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'department', type: 'string' },
        { name: 'role', type: 'string' },
        { name: 'age', type: 'number' },
        { name: 'score', type: 'number' },
      ],
      views: {
        default: {
          rows: employees,
        },
      },
    },
  },
})

const usersView = employeeDataSet.getView('Users', 'default')
const formViewKey = 'Users@default'

const { sparkProvide } = useSparkContextScope('r-form-compare-demo-page')
sparkProvide(PAGE_DATASET, employeeDataSet)

const configChildren: SparkNode[] = [
  { type: 'r-text', props: { field: 'name', label: '姓名' } },
  { type: 'r-text', props: { field: 'department', label: '部门' } },
  { type: 'r-text', props: { field: 'role', label: '角色' } },
  { type: 'r-number', props: { field: 'age', label: '年龄', min: 18, max: 60 } },
  { type: 'r-number', props: { field: 'score', label: '绩效分', min: 0, max: 100 } },
]

const activeEmployeeId = ref<number | null>(employees[0]?.id ?? null)

function selectEmployee(id: number): void {
  activeEmployeeId.value = id
  const targetRow = usersView?.rows.find(row => Number(row['id']) === id) ?? null
  usersView?.selection.setCurrentRow(targetRow)
}

selectEmployee(employees[0]?.id ?? 0)

const activeEmployee = computed(() => {
  if (activeEmployeeId.value === null) return null
  return employees.find(employee => employee.id === activeEmployeeId.value) ?? null
})

const currentRowDescription = computed(() => {
  if (activeEmployee.value === null) return '当前没有 currentRow。'
  return `${activeEmployee.value.department} / ${activeEmployee.value.role} / 绩效 ${activeEmployee.value.score}`
})

const configSnippet = `const configChildren: SparkNode[] = [
  { type: 'r-text', props: { field: 'name', label: '姓名' } },
  { type: 'r-text', props: { field: 'department', label: '部门' } },
  { type: 'r-number', props: { field: 'score', label: '绩效分' } },
]

<RendererForm
  :data-view-key="'Users@default'"
  :children="configChildren"
  label-width="92px"
/>`

const templateSnippet = `<RendererForm :data-view-key="'Users@default'" label-width="92px">
  <FieldText type="r-text" field="name" label="姓名" />
  <FieldText type="r-text" field="department" label="部门" />
  <FieldNumber type="r-number" field="score" label="绩效分" />
</RendererForm>`
</script>

<style scoped>
.r-form-compare-demo {
  display: grid;
  gap: 24px;
  padding: 24px;
}

.r-form-compare-demo__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: 20px;
  padding: 24px;
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.16), transparent 34%),
    linear-gradient(140deg, #f8f8ef 0%, #eef6ff 100%);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.r-form-compare-demo__eyebrow {
  margin: 0 0 8px;
  color: #0369a1;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.r-form-compare-demo__hero h1 {
  margin: 0;
  color: #0f172a;
  font-size: 32px;
  line-height: 1.15;
}

.r-form-compare-demo__summary {
  margin: 12px 0 0;
  max-width: 760px;
  color: #334155;
  line-height: 1.7;
}

.r-form-compare-demo__meta {
  display: grid;
  gap: 12px;
}

.r-form-compare-demo__meta-item,
.r-form-compare-demo__selector-panel,
.r-form-compare-demo__panel,
.r-form-compare-demo__notes {
  padding: 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
}

.r-form-compare-demo__meta-label,
.r-form-compare-demo__current-row-label {
  display: block;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
}

.r-form-compare-demo__selector-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(240px, 0.8fr);
  gap: 20px;
}

.r-form-compare-demo__selector-panel h2,
.r-form-compare-demo__panel h2,
.r-form-compare-demo__notes h2 {
  margin: 0 0 10px;
  color: #0f172a;
  font-size: 18px;
}

.r-form-compare-demo__panel-desc {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.6;
}

.r-form-compare-demo__selector-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.r-form-compare-demo__selector-button {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid rgba(14, 116, 144, 0.18);
  border-radius: 16px;
  background: #f8fafc;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.r-form-compare-demo__selector-button span {
  color: #64748b;
  font-size: 13px;
}

.r-form-compare-demo__selector-button:hover,
.r-form-compare-demo__selector-button.is-active {
  border-color: rgba(2, 132, 199, 0.5);
  box-shadow: 0 10px 24px rgba(2, 132, 199, 0.12);
  transform: translateY(-1px);
}

.r-form-compare-demo__selector-button.is-active {
  background: linear-gradient(135deg, rgba(224, 242, 254, 0.92), rgba(240, 249, 255, 0.92));
}

.r-form-compare-demo__current-row-card {
  align-self: stretch;
}

.r-form-compare-demo__current-row-card strong {
  display: block;
  margin-bottom: 8px;
  color: #0f172a;
  font-size: 22px;
}

.r-form-compare-demo__current-row-card p {
  margin: 0;
  color: #475569;
  line-height: 1.7;
}

.r-form-compare-demo__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.r-form-compare-demo__grid--code {
  align-items: start;
}

.r-form-compare-demo__template-fields {
  display: grid;
  gap: 14px;
}

.r-form-compare-demo__code {
  overflow: auto;
  margin: 0;
  padding: 16px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.6;
}

.r-form-compare-demo__notes ul {
  margin: 0;
  padding-left: 18px;
  color: #334155;
  line-height: 1.8;
}

@media (max-width: 960px) {
  .r-form-compare-demo__hero,
  .r-form-compare-demo__selector-panel,
  .r-form-compare-demo__grid {
    grid-template-columns: 1fr;
  }
}
</style>
