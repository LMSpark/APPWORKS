import { createTestPageRuntime } from '../../../support/helpers/create-test-page-runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import {
  PAGE_RUNTIME,
  SPARK_REGISTRY_KEY,
  Spark,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import { DataMember, SparkData, type SparkNode } from '@spark-appworks/spark-data'
import { useFieldOptions } from '../../../../packages/spark-component/src/components/fields/options/useFieldOptions'
import {buildOptionSourceFromView} from '../../../../packages/spark-component/src/components/fields/options/option-source'

const OptionProbe = defineComponent({
  props: {
    optionDataViewKey: { type: String, required: true },
    sampleValue: { type: [String, Array], default: undefined },
  },
  setup(props) {
    const { options, formatOptionValue } = useFieldOptions({
      optionDataViewKey: props.optionDataViewKey,
      optionDataMember: DataMember.Rows,
    })

    return () => {
      const firstOption = options.value[0]
      return h('div', {
        class: 'option-probe',
        'data-option-count': String(options.value.length),
        'data-first-label': String(firstOption?.label ?? ''),
        'data-first-value': String(firstOption?.value ?? ''),
        'data-formatted': formatOptionValue(props.sampleValue),
      })
    }
  },
})

function mountOptionProbe(dataSet: ReturnType<typeof SparkData.createDataSet>, sampleValue: unknown) {
  const { registry, rootContext } = Spark.createSystem()
  const normalizedSampleValue = Array.isArray(sampleValue)
    ? sampleValue.map(item => String(item))
    : typeof sampleValue === 'string'
      ? sampleValue
      : undefined

  const Provider = defineComponent({
    setup() {
      const node: SparkNode = { type: 'r-form' }
      const { sparkProvide } = useSparkComponent(node, { parentContext: rootContext })
      sparkProvide(PAGE_RUNTIME, createTestPageRuntime(dataSet))

      return () => h(OptionProbe, {
        optionDataViewKey: 'Dict@default',
        ...(normalizedSampleValue !== undefined ? { sampleValue: normalizedSampleValue } : {}),
      })
    },
  })

  return mount(Provider, {
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      },
    },
  })
}

describe('选项字段应继承 DataView facets', () => {
  it('uses explicit label alternatives without falling through a masked label or unreadable key', () => {
    const ds=SparkData.createDataSet({dataSetName:'Labels',tables:{Apps:{tableName:'Apps',resourceType:'static-data',
      columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'title',type:'string'},{name:'name',type:'string'}],
      views:{default:{rows:[{id:'a',title:' ',name:'Fallback'},{id:'b',title:'Secret',name:'Do not fall back'},
        {id:'c',title:'Hidden identity',name:'Hidden'}]}}}}})
    const view=ds.getView('Apps')!, original=view.fieldAccess.bind(view)
    vi.spyOn(view,'fieldAccess').mockImplementation((row,field)=>({...original(row,field),
      read: typeof row==='object' && row!==null && row['id']==='c' && field==='id' ? 'invisible'
        : typeof row==='object' && row!==null && row['id']==='b' && field==='title' ? 'masked' : 'visible'}))
    try {
      const source=buildOptionSourceFromView(view,{labelField:'title',labelFields:['title','name'],valueField:'id',childrenField:'children'})
      expect(source).toMatchObject([{id:'a',title:'Fallback'},{id:'b',title:'••••'}])
      expect(JSON.stringify(source)).not.toContain('Secret')
      expect(source).toHaveLength(2)
    } finally {ds.destroy()}
  })
  it('refreshes direct view rows, facets and read access without an explicit cascade and releases subscriptions', async () => {
    const ds = SparkData.createDataSet({dataSetName: 'Options', tables: {
      Dict: {tableName: 'Dict', resourceType: 'static-data', columns: [{name: 'code', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}],
        views: {default: {valueField: 'code', labelField: 'name', rows: [{code: 'A', name: '初始'}]}}},
    }})
    const view = ds.getView('Dict')!, wrapper = mountOptionProbe(ds, 'A')
    const on = vi.spyOn(view.events, 'on'), off = vi.spyOn(view.events, 'off')
    try {
      view.replaceRows([{code: 'B', name: '回填'}]); await flushPromises()
      expect(wrapper.get('.option-probe').attributes('data-first-label')).toBe('回填')
      view.configure({labelField: 'code'}); await flushPromises()
      expect(wrapper.get('.option-probe').attributes('data-first-label')).toBe('B')
      const access = view.fieldAccess.bind(view)
      const permission = vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => field === 'code'
        ? {...access(row, field), read: 'invisible'} : access(row, field))
      view.replaceRows([{code: 'B', name: '不可读'}]); await flushPromises()
      expect(wrapper.get('.option-probe').attributes('data-option-count')).toBe('0')
      permission.mockRestore()
      view.replaceRows([{code: 'C', name: '恢复'}]); await flushPromises()
      expect(wrapper.get('.option-probe').attributes('data-first-value')).toBe('C')
      expect(on).not.toHaveBeenCalled()
      wrapper.unmount()
      expect(off.mock.calls.some(([event]) => event === 'rowsChanged')).toBe(true)
    } finally {wrapper.unmount(); on.mockRestore(); off.mockRestore(); ds.destroy()}
  })

  it('应默认使用 DataView.labelField/valueField/selectionDelimiter', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'DictDS',
      tables: {
        Dict: {
          tableName: 'Dict',
          resourceType: 'static-data',
          columns: [
            { name: 'code', type: 'string' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { code: 'A', name: '选项A' },
                { code: 'B', name: '选项B' },
              ],
              valueField: 'code',
              labelField: 'name',
              selectionDelimiter: '|',
            },
          },
        },
      },
    })

    const wrapper = mountOptionProbe(dataSet, 'A|B')
    const probe = wrapper.find('.option-probe')

    expect(probe.attributes('data-option-count')).toBe('2')
    expect(probe.attributes('data-first-label')).toBe('选项A')
    expect(probe.attributes('data-first-value')).toBe('A')
    expect(probe.attributes('data-formatted')).toBe('选项A / 选项B')
  })

  it('单选模式 selectionDelimiter 为空字符串时不应按字符拆分', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'SingleValueDS',
      tables: {
        Dict: {
          tableName: 'Dict',
          resourceType: 'static-data',
          columns: [
            { name: 'code', type: 'string' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [
                { code: 'AB', name: '单值选项' },
              ],
              valueField: 'code',
              labelField: 'name',
              selectionDelimiter: '',
            },
          },
        },
      },
    })

    const wrapper = mountOptionProbe(dataSet, 'AB')
    const probe = wrapper.find('.option-probe')

    expect(probe.attributes('data-first-label')).toBe('单值选项')
    expect(probe.attributes('data-first-value')).toBe('AB')
    expect(probe.attributes('data-formatted')).toBe('单值选项')
  })
})
