import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import { DataSet, type DataRow } from '@spark-appworks/spark-data'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import { PAGE_RUNTIME, PAGE_RUNTIME_SERVICES, RendererList, Spark, useSparkComponent } from '@spark-appworks/spark-component'

const source = readFileSync(resolve(process.cwd(), 'src/views/tenant/AppList.vue'), 'utf8')
const buttonProps = readFileSync(resolve(process.cwd(), 'packages/spark-component/src/components/containers/layout/action/RendererButton/RendererButton.props.ts'), 'utf8')
const scenarioTemplate = source
const runtimes: PageRuntime[] = []
const dataSets: DataSet[] = []
const wrappers: VueWrapper[] = []

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => { if (wrapper.exists()) wrapper.unmount() })
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  dataSets.splice(0).forEach(dataSet => { if (!dataSet.destroyed) dataSet.destroy() })
})

function appScenario(scenarioId: string, description: string): DataSet {
  const dataSet = DataSet.fromJson({scenarioId, tables: {Base_AppSystemList: {
    modelBinding: {modelId: `MODEL-${scenarioId}`, modelName: 'Base_AppSystemList'},
    columns: [
      {name: 'rowid', type: 'string', isPrimaryKey: true},
      {name: 'AppDesc', type: 'string'},
    ],
    views: {default: {rows: [{rowid: `${scenarioId}-ROW`, AppDesc: description}]}},
  }}})
  dataSets.push(dataSet)
  return dataSet
}

describe('AppList formal scenario data binding', () => {
  it('binds the scenario list to its PageRuntime DataView through RendererList', () => {
    expect(source).toContain('scenarioDataViewKey')
    expect(source).toContain(`scenarioId.value}@Base_AppSystemList@\${scenarioViewId.value}`)
    expect(source).toContain('<RendererList')
    expect(source).toContain(':data-view-key="scenarioDataViewKey"')
    expect(source).toContain('sparkProvide(PAGE_RUNTIME, current)')
    expect(source).not.toContain('function projectRows(')
    expect(scenarioTemplate).not.toContain('v-for="project in projects"')
  })

  it('keeps app-specific labels and row actions on the row-scoped standard component contract', () => {
    expect(source).toContain('displayFallbackFields')
    expect(source).toContain('onBeforeRender')
    expect(source).toContain('dataSource.fieldAccess(row, fieldName).read === \'visible\'')
    expect(source).toContain('onClick')
    expect(source).toContain('handleSwitch')
    expect(source).toContain('handleDelete')
    expect(source).toContain('openSettings')
    expect(buttonProps).toContain('onClick?: (...args: unknown[]) => unknown')
    expect(source).toContain('暂无描述')
  })

  it('fails closed on structural identity but does not reject all rows for unreadable display fields', () => {
    const validatorStart = source.indexOf('function validateScenarioView(')
    const validatorEnd = source.indexOf('\nfunction getProjectSwitch()', validatorStart)
    const validator = source.slice(validatorStart, validatorEnd)
    expect(validator).toContain("view.primaryKey !== 'rowid'")
    expect(validator).not.toContain('AppName')
    expect(validator).not.toContain('AppDesc')
    expect(validator).not.toContain('IsSys')
    expect(validator).toContain("view.fieldAccess(row, 'rowid').read !== 'visible'")

    const projectStart = source.indexOf('function projectFromRow(')
    const projectEnd = source.indexOf('\nfunction rowButton(', projectStart)
    const projectFromRow = source.slice(projectStart, projectEnd)
    expect(projectFromRow).toContain("view.fieldAccess(row, 'AppDesc').read === 'visible'")
    expect(projectFromRow).toContain("view.fieldAccess(row, 'AppName').read === 'visible'")
    expect(projectFromRow).not.toContain('IsSys')
    expect(source).toContain("Object.hasOwn(row, fieldName) && dataSource.fieldAccess(row, fieldName).read === 'visible'")
  })

  it('uses the authenticated formal catalog by default and preserves explicit-scenario cancellation/disposal guards', () => {
    expect(source).toContain('loadLowcodeApplicationCatalog()')
    expect(source).toContain("blueprintScenarioId.value || getBuiltinScenarioResource('projectBlueprint').scenarioId")
    expect(source).not.toContain('listApplications')
    expect(source).not.toContain('projects.value')
    expect(source).not.toContain('el-row v-else-if')
    expect(source).toContain('own !== generation')
    expect(source).toContain('current.dispose()')
    expect(source).toContain('runtime?.dispose()')
    expect(source).toContain('active = false')
  })

  it('resolves and renders rows from each matching scenario through a real PageRuntime', async () => {
    const scenarioA = appScenario('SCENE-A', 'Only in scenario A')
    const scenarioB = appScenario('SCENE-B', 'Only in scenario B')
    const runtime = new PageRuntime({
      pageId: 'app-list-binding-test',
      scenarioIds: ['SCENE-A', 'SCENE-B'],
      mainScenarioId: 'SCENE-A',
      loadScenario: async scenarioId => scenarioId === 'SCENE-A' ? scenarioA : scenarioB,
    })
    runtimes.push(runtime)
    await runtime.load()

    const Harness = defineComponent({
      setup() {
        const {sparkProvide} = useSparkComponent({type: 'app-list-binding-test-root'})
        sparkProvide(PAGE_RUNTIME, runtime)
        sparkProvide(PAGE_RUNTIME_SERVICES, {logger: {
          debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined,
        }})
        const renderRow = (row: DataRow) => h('span', {class: 'scenario-row'}, String(row['AppDesc'] ?? ''))
        return () => h('div', [
          h('section', {class: 'scenario-a'}, [h(RendererList, {
            dataViewKey: 'SCENE-A@Base_AppSystemList@default', showPagination: false,
          }, {default: ({row}: {row: DataRow}) => renderRow(row)})]),
          h('section', {class: 'scenario-b'}, [h(RendererList, {
            dataViewKey: 'SCENE-B@Base_AppSystemList@default', showPagination: false,
          }, {default: ({row}: {row: DataRow}) => renderRow(row)})]),
        ])
      },
    })
    const wrapper = mount(Harness, {global: {plugins: [Spark.createPlugin(), ElementPlus]}})
    wrappers.push(wrapper)
    await flushPromises()

    expect(runtime.resolveView('SCENE-A@Base_AppSystemList@default')).toBe(scenarioA.getView('Base_AppSystemList', 'default'))
    expect(runtime.resolveView('SCENE-B@Base_AppSystemList@default')).toBe(scenarioB.getView('Base_AppSystemList', 'default'))
    expect(wrapper.find('.scenario-a').text()).toContain('Only in scenario A')
    expect(wrapper.find('.scenario-a').text()).not.toContain('Only in scenario B')
    expect(wrapper.find('.scenario-b').text()).toContain('Only in scenario B')
    expect(wrapper.find('.scenario-b').text()).not.toContain('Only in scenario A')
  })
})
