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
  it('joins readable label fields with editing overlays without exposing masked values', () => {
    const ds = SparkData.createDataSet({dataSetName: 'Labels', tables: {Results: {
      tableName: 'Results', resourceType: 'static-data',
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'category', type: 'string'}, {name: 'code', type: 'string'}],
      views: {default: {rows: [{id: 'a', category: 'finance', code: 'cost'}, {id: 'b', category: 'private', code: 'secret'}]}},
    }}})
    const view = ds.getView('Results')!, access = view.fieldAccess.bind(view)
    try {
      view.updateEditingValue('a', 'code', 'new-cost')
      vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => ({...access(row, field),
        read: typeof row === 'object' && row !== null && row['id'] === 'b' && field === 'code' ? 'masked' : 'visible'}))
      const source = buildOptionSourceFromView(view, {labelField: 'code', valueField: 'id', childrenField: 'children',
        labelFields: ['category', 'code', 'id'], labelJoiner: ' / '})
      expect(source).toMatchObject([{id: 'a', code: 'finance / new-cost / a'}, {id: 'b', code: '••••'}])
      expect(JSON.stringify(source)).not.toContain('secret')
      expect(view.rows[0]?.['code']).toBe('cost')
      expect(() => buildOptionSourceFromView(view, {labelField: 'code', valueField: 'id',
        childrenField: 'children', labelJoiner: ' / '})).toThrow('标题连接符需要标题字段列表')
      expect(() => buildOptionSourceFromView(view, {labelField: 'id', valueField: 'id',
        labelFields: ['category', 'code'], childrenField: 'children', labelJoiner: ' / '}))
        .toThrow('组合标题显示字段不能覆盖选项身份')
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

  it('uses the option view editing overlay and still masks unreadable labels', async () => {
    const ds = SparkData.createDataSet({dataSetName: 'Options', tables: {
      Dict: {tableName: 'Dict', resourceType: 'static-data',
        columns: [{name: 'code', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}],
        views: {default: {valueField: 'code', labelField: 'name', rows: [{code: 'A', name: '原名称'}]}}},
    }})
    const view = ds.getView('Dict')!, wrapper = mountOptionProbe(ds, 'A')
    try {
      view.updateEditingValue('A', 'name', '编辑中的名称')
      await flushPromises()
      expect(wrapper.get('.option-probe').attributes('data-first-label')).toBe('编辑中的名称')
      expect(buildOptionSourceFromView(view, {rows: [{code: 'A', name: '独立查询结果'}], labelField: 'name',
        labelFields: ['name'], valueField: 'code', childrenField: 'children'})).toMatchObject([{name: '独立查询结果'}])
      const access = view.fieldAccess.bind(view)
      const permission = vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => field === 'name'
        ? {...access(row, field), read: 'masked'} : access(row, field))
      const source = buildOptionSourceFromView(view, {labelField: 'name', labelFields: ['name'], valueField: 'code', childrenField: 'children'})
      expect(source).toMatchObject([{code: 'A', name: '••••'}])
      expect(JSON.stringify(source)).not.toContain('编辑中的名称')
      permission.mockRestore()
      view.discardEditingRows(['A'])
      await flushPromises()
      expect(wrapper.get('.option-probe').attributes('data-first-label')).toBe('原名称')
    } finally {wrapper.unmount(); ds.destroy()}
  })

  it('applies the editing overlay to nested option labels without exposing masked child values', () => {
    const ds = SparkData.createDataSet({dataSetName: 'TreeOptions', tables: {
      Dict: {tableName: 'Dict', resourceType: 'static-data',
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'parentId', type: 'string'}, {name: 'name', type: 'string'}],
        views: {default: {valueField: 'id', labelField: 'name',
          treeConfig: {idField: 'id', parentIdField: 'parentId', textField: 'name', treeMode: 'flat'},
          rows: [{id: 'P', parentId: null, name: '父项'}, {id: 'C', parentId: 'P', name: '子项'}]}}},
    }})
    const view = ds.getView('Dict')!
    try {
      view.updateEditingValue('C', 'name', '编辑中的子项')
      const options = {labelField: 'name', labelFields: ['name'], valueField: 'id', childrenField: 'children'}
      expect(buildOptionSourceFromView(view, options)).toMatchObject([{id: 'P', children: [{id: 'C', name: '编辑中的子项'}]}])
      const joined = {...options, labelFields: ['name', 'id'], labelJoiner: ' / '}
      expect(buildOptionSourceFromView(view, joined)).toMatchObject([{id: 'P', name: '父项 / P',
        children: [{id: 'C', name: '编辑中的子项 / C'}]}])
      const access = view.fieldAccess.bind(view)
      const permission = vi.spyOn(view, 'fieldAccess').mockImplementation((row, field) => row?.['id'] === 'C' && field === 'name'
        ? {...access(row, field), read: 'masked'} : access(row, field))
      const source = buildOptionSourceFromView(view, options)
      expect(source).toMatchObject([{id: 'P', children: [{id: 'C', name: '••••'}]}])
      expect(JSON.stringify(source)).not.toContain('编辑中的子项')
      expect(buildOptionSourceFromView(view, joined)).toMatchObject([{id: 'P', children: [{id: 'C', name: '••••'}]}])
      permission.mockRestore()
    } finally {ds.destroy()}
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
