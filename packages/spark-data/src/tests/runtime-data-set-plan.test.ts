import { describe, expect, it } from 'vitest'
import { DataSet } from '../dataset'
import { buildRuntimeDataSetPlan, buildRuntimeDataSetPlanText, compileRuntimeDataSetPlan, parseRuntimeDataSetPlanFile, stableRuntimeDataSetPlanText } from '../index'

function planText(emptyValueMode: 'emptyResult' | 'omit' | 'asNull' = 'emptyResult') {
  return JSON.stringify({
    schemaVersion: 1,
    kind: 'spark.runtimeDataSetPlan',
    scenarioId: 'SPACE',
    name: 'Runtime plan',
    description: '',
    type: '数据源',
    savedAt: '2026-11-23T00:00:00.000Z',
    contentHash: 'fnv1a:12345678',
    source: {dataSetId: 'SPACE', exportedFrom: 'data-space-design', graphFile: 'SPACE.json'},
    inputParams: [],
    models: [
      {id: 'M_PARENT', metaName: 'Parent', name: 'Parent', description: '', sourceType: '数据库表',
        isBusinessMain: true, isBusiness: true, outputType: 'Table', filter: '', parentField: '',
        hasChildField: '', selfType: 'child', topValue: '', cacheType: '',
        join: {joinType: '', foreignKeyFields: '', joinFilter: '', pId: ''},
        crud: {addApi: '', updateApi: '', deleteApi: ''}},
      {id: 'M_CHILD', metaName: 'Child', name: 'Child', description: '', sourceType: '数据库表',
        isBusinessMain: false, isBusiness: true, outputType: 'Table', filter: '', parentField: '',
        hasChildField: '', selfType: 'child', topValue: '', cacheType: '',
        join: {joinType: '', foreignKeyFields: '', joinFilter: '', pId: ''},
        crud: {addApi: '', updateApi: '', deleteApi: ''}},
    ],
    modelFields: [
      {id: 'F_PARENT', dataModelId: 'M_PARENT', type: 'dataModel', name: 'ids', description: '父 ID',
        fieldType: 'json', isOutput: true, asName: '', orderType: '', order: 0, group: 0, isPKey: true},
      {id: 'F_CHILD', dataModelId: 'M_CHILD', type: 'dataModel', name: 'parentId', description: '父引用',
        fieldType: 'varchar', isOutput: true, asName: '', orderType: '', order: 0, group: 0, isPKey: false},
      {id: 'F_CHILD_KEY', dataModelId: 'M_CHILD', type: 'dataModel', name: 'id', description: 'ID',
        fieldType: 'varchar', isOutput: true, asName: '', orderType: '', order: 1, group: 0, isPKey: true},
      {id: 'F_CHILD_ENABLED', dataModelId: 'M_CHILD', type: 'dataModel', name: 'enabled', description: '启用',
        fieldType: 'int', isOutput: true, asName: '', orderType: '', order: 2, group: 0, isPKey: false},
    ],
    views: [
      {id: 'V_PARENT', code: 'parent', name: 'Parent', description: '', dataModelId: 'M_PARENT', isDefault: true,
        outputType: 'Table', filter: '', dependencies: [], parentField: '', hasChildField: '', selfType: 'child',
        topValue: '', cacheType: ''},
      {id: 'V_CHILD', code: 'child', name: 'Child', description: '', dataModelId: 'M_CHILD', isDefault: true,
        outputType: 'Table',
        filter: JSON.stringify({Type: 'and', Filters: [
          {Type: 'cond', Field: 'parentId', Operator: 'equal', Value: null,
            ValueFun: {Type: 'GetDependValue', DependKey: 'parentIds'}},
          {Type: 'cond', Field: 'enabled', Operator: 'equal', Value: 1},
        ]}),
        dependencies: [{dependKey: 'parentIds', sourceDataViewId: 'V_PARENT', sourceModelId: 'M_PARENT',
          sourceField: 'ids', label: '父 ID', emptyValueMode}],
        parentField: '', hasChildField: '', selfType: 'child', topValue: '', cacheType: ''},
    ],
    viewFields: [
      {id: 'VF_PARENT', dataViewId: 'V_PARENT', dataModelId: 'M_PARENT', name: 'ids', description: '父 ID',
        fieldType: 'json', isOutput: true, asName: '', orderType: '', order: 0, group: 0, sort: 0, isPKey: true,
        display: {kind: 'text', fromDataViewId: '', valueField: '', labelField: ''},
        valueSource: 'model', sourceDataViewId: '', sourceModelId: '', sourceField: ''},
      {id: 'VF_CHILD', dataViewId: 'V_CHILD', dataModelId: 'M_CHILD', name: 'parentId', description: '父引用',
        fieldType: 'varchar', isOutput: true, asName: '', orderType: '', order: 0, group: 0, sort: 0, isPKey: false,
        display: {kind: 'text', fromDataViewId: '', valueField: '', labelField: ''},
        valueSource: 'model', sourceDataViewId: '', sourceModelId: '', sourceField: ''},
      {id: 'VF_CHILD_KEY', dataViewId: 'V_CHILD', dataModelId: 'M_CHILD', name: 'id', description: 'ID',
        fieldType: 'varchar', isOutput: true, asName: '', orderType: '', order: 0, group: 0, sort: 1, isPKey: true,
        display: {kind: 'text', fromDataViewId: '', valueField: '', labelField: ''},
        valueSource: 'model', sourceDataViewId: '', sourceModelId: '', sourceField: ''},
      {id: 'VF_CHILD_ENABLED', dataViewId: 'V_CHILD', dataModelId: 'M_CHILD', name: 'enabled', description: '启用',
        fieldType: 'int', isOutput: true, asName: '', orderType: '', order: 0, group: 0, sort: 2, isPKey: false,
        display: {kind: 'text', fromDataViewId: '', valueField: '', labelField: ''},
        valueSource: 'model', sourceDataViewId: '', sourceModelId: '', sourceField: ''},
    ],
    relations: [],
    linkage: {edges: []},
  })
}

describe('runtime data set plan', () => {
  it('parses the backend-owned schema without accepting extra compatibility fields', () => {
    const parsed = parseRuntimeDataSetPlanFile(planText(), 'SPACE')
    expect(parsed.kind).toBe('spark.runtimeDataSetPlan')
    expect(parsed.scenarioId).toBe('SPACE')
    expect(parsed.models[0]?.metaName).toBe('Parent')
    expect(() => parseRuntimeDataSetPlanFile(JSON.stringify({...JSON.parse(planText()), viewCascades: []}))).toThrow('未知字段')
    expect(() => parseRuntimeDataSetPlanFile(planText(), 'OTHER')).toThrow('scenarioId')
  })

  it('compiles GetDependValue into a native spark-data query cascade', () => {
    const compiled = compileRuntimeDataSetPlan(parseRuntimeDataSetPlanFile(planText()))
    expect(compiled.viewCascades).toEqual([expect.objectContaining({
      parentTable: 'Parent', parentViewId: 'V_PARENT', childTable: 'Child', childViewId: 'V_CHILD',
      filterBindings: [{sourceField: 'ids', targetField: 'parentId', operator: 'eq', emptyValueMode: 'emptyResult'}],
    })])
    const child = compiled.metadata.tables['Child']?.views['V_CHILD']
    expect(child?.scopeFilter).toEqual({field: 'enabled', operator: 'eq', value: 1})
    expect(child?.fieldProjection?.every(field => field.resourceFieldId !== field.fieldId)).toBe(true)
    expect(child?.fieldProjection?.find(field => field.viewField === 'id')?.resourceFieldId).toBe('F_CHILD_KEY')
    const dataSet = DataSet.fromRuntimeDataSetPlan(planText())
    expect(dataSet.getView('Parent', 'V_PARENT')).toBeDefined()
    expect(dataSet.getView('Child', 'V_CHILD')).toBeDefined()
    dataSet.destroy()
  })

  it('uses the same traversal for nested lowercase dependencies and static OR filters', () => {
    const raw = JSON.parse(planText())
    const child = raw['views'][1]
    child['filter'] = JSON.stringify({logic: 'and', filters: [
      {logic: 'and', filters: [
        {field: 'parentId', Operator: 'equal', value: {Type: 'GetDependValue', DependKey: 'parentIds'}},
        {logic: 'or', filters: [
          {field: 'enabled', Operator: 'equal', value: 1},
          {field: 'enabled', Operator: 'equal', value: 2},
        ]},
      ]},
    ]})
    const compiled = compileRuntimeDataSetPlan(parseRuntimeDataSetPlanFile(JSON.stringify(raw)))
    expect(compiled.viewCascades).toHaveLength(1)
    expect(compiled.metadata.tables['Child']?.views['V_CHILD']?.scopeFilter).toEqual({
      logic: 'or', filters: [
        {field: 'enabled', operator: 'eq', value: 1},
        {field: 'enabled', operator: 'eq', value: 2},
      ],
    })
  })

  it('builds the unchanged file contract from saved metadata rows and pagedata view definitions', () => {
    const text = buildRuntimeDataSetPlanText({
      scenarioId: 'SPACE',
      savedAt: '2026-11-23T00:00:00.000Z',
      space: {rowid: 'SPACE', Name: 'Space', description: '', Type: '数据源', inputParams: []},
      models: [
        {rowid: 'M_PARENT', Name: 'Parent', MetaName: 'source_parent', Type: '数据库表', description: '',
          IsBusinessMain: 1, IsBusiness: 1, OutputType: 'Table'},
        {rowid: 'M_CHILD', Name: 'Child', MetaName: 'source_child', Type: '数据库表', description: '',
          IsBusinessMain: 0, IsBusiness: 1, OutputType: 'Table'},
        {rowid: 'M_API', Name: 'ExternalProfile', MetaName: 'profile-api', Type: '接口', description: '',
          IsBusinessMain: 0, IsBusiness: 1, OutputType: 'Table'},
        {rowid: 'M_PLATFORM_API', Name: 'PlatformTask', MetaName: 'platform:task', Type: '平台接口', description: '',
          IsBusinessMain: 0, IsBusiness: 1, OutputType: 'Table'},
      ],
      fields: [
        {rowid: 'F_PARENT', dataModelId: 'M_PARENT', type: 'dataModel', Name: 'id', FieldType: 'varchar',
          IsOutput: 1, IsPKey: 1, Order: 0, Group: 0},
        {rowid: 'F_CHILD', dataModelId: 'M_CHILD', type: 'dataModel', Name: 'parentId', FieldType: 'varchar',
          IsOutput: 1, IsPKey: 0, Order: 0, Group: 0},
      ],
      relations: [],
      scenarioConfig: {
        scenarioId: 'SPACE',
        tables: {
          Parent: {
            modelBinding: {modelId: 'M_PARENT', modelName: 'Parent'},
            views: {catalog: {fieldProjection: [{resourceFieldId: 'F_PARENT', viewField: 'id', output: true,
              sortOrder: 0, sortDirection: null, group: 0, primaryKey: true}]}},
          },
          Child: {
            modelBinding: {modelId: 'M_CHILD', modelName: 'Child'},
            views: {default: {fieldProjection: [{resourceFieldId: 'F_CHILD', viewField: 'parentId', output: true,
              sortOrder: 0, sortDirection: null, group: 0, primaryKey: false}]}},
          },
          ExternalProfile: {
            modelBinding: {modelId: 'M_API', modelName: 'ExternalProfile'},
            views: {default: {}},
          },
          PlatformTask: {
            modelBinding: {modelId: 'M_PLATFORM_API', modelName: 'PlatformTask'},
            views: {default: {}},
          },
        },
        resourceRelations: [],
        viewCascades: [{
          kind: 'query', cascadeId: 'parent-child', parentTable: 'Parent', parentViewId: 'catalog',
          childTable: 'Child', childViewId: 'default',
          filterBindings: [{sourceField: 'id', targetField: 'parentId', operator: 'eq', emptyValueMode: 'omit'}],
        }],
      },
    })
    const parsed = parseRuntimeDataSetPlanFile(text, 'SPACE')
    expect(parsed.views.map(view => [view.id, view.code])).toEqual(expect.arrayContaining([
      ['Parent::catalog', 'catalog'], ['Child::default', 'default'], ['ExternalProfile::default', 'default'],
    ]))
    expect(parsed.viewFields.every(field => !parsed.modelFields.some(modelField => modelField.id === field.id))).toBe(true)
    expect(parsed.contentHash).toMatch(/^fnv1a:[0-9a-f]{8}$/)
    expect(parsed.models.find(model => model.metaName === 'ExternalProfile')).toEqual(expect.objectContaining({
      metaName: 'ExternalProfile', sourceType: '接口',
    }))
    expect(parsed.models.find(model => model.metaName === 'PlatformTask')).toEqual(expect.objectContaining({
      metaName: 'PlatformTask', sourceType: '平台接口',
    }))
    const compiled = compileRuntimeDataSetPlan(parsed)
    expect(compiled.metadata.tables['Parent']?.views['catalog']).toBeDefined()
    expect(compiled.metadata.viewCascades).toEqual([expect.objectContaining({
      parentTable: 'Parent', parentViewId: 'catalog', childTable: 'Child', childViewId: 'default',
      filterBindings: [{sourceField: 'id', targetField: 'parentId', operator: 'eq', emptyValueMode: 'omit'}],
    })])
  })

  it('rejects independent scope and initial filters before building Plan v1', () => {
    const scopeFilter = {field: 'tenantId', operator: 'eq', value: 'TENANT'}
    const filterExpression = {field: 'status', operator: 'eq', value: 'open'}
    const build = (view: Record<string, unknown>) => buildRuntimeDataSetPlan({
      scenarioId: 'SPACE',
      space: {rowid: 'SPACE', Name: 'Space'},
      models: [{rowid: 'MODEL', Name: 'Orders', MetaName: 'source_orders', Type: '数据库表'}],
      fields: [],
      relations: [],
      scenarioConfig: {scenarioId: 'SPACE', tables: {Orders: {
        modelBinding: {modelId: 'MODEL', modelName: 'Orders'},
        views: {default: view},
      }}},
    })

    expect(() => build({scopeFilter, filterExpression})).toThrow('SPACE Orders@default 不支持同时保存常驻范围和初始过滤')
    expect(() => build({filterExpression})).toThrow('SPACE Orders@default 不支持保存可替换的初始过滤')
    expect(compileRuntimeDataSetPlan(build({scopeFilter})).metadata.tables['Orders']?.views['default']?.scopeFilter)
      .toEqual(scopeFilter)
  })

  it('rejects view defaults that Plan v1 cannot reconstruct, while allowing empty declarations', () => {
    const build = (view: Record<string, unknown>) => buildRuntimeDataSetPlan({
      scenarioId: 'SPACE', space: {rowid: 'SPACE', Name: 'Space'},
      models: [{rowid: 'MODEL', Name: 'Orders', MetaName: 'source_orders', Type: '数据库表'}],
      fields: [], relations: [],
      scenarioConfig: {scenarioId: 'SPACE', tables: {Orders: {
        modelBinding: {modelId: 'MODEL', modelName: 'Orders'}, views: {default: view},
      }}},
    })

    expect(() => build({queryContext: {region: 'north', includeArchived: false}}))
      .toThrow('SPACE Orders@default 不支持保存非空 queryContext')
    expect(() => build({sortExpression: [{field: 'createdAt', direction: 'desc'}, {field: 'id', direction: 'asc'}]}))
      .toThrow('SPACE Orders@default 不支持保存独立 sortExpression')
    expect(() => build({queryConfig: {fields: ['id']}}))
      .toThrow('SPACE Orders@default 不支持保存显式 queryConfig.fields')
    expect(() => build({queryConfig: {allPages: true, maxRows: 1}}))
      .toThrow('SPACE Orders@default 不支持保存非默认 queryConfig.maxRows')
    expect(() => build({onRequestComplete: 'loadFollowup'}))
      .toThrow('SPACE Orders@default 不支持保存 onRequestComplete')
    for (const newRowFields of [[], ['description']]) {
      expect(() => build({newRowFields}))
        .toThrow('SPACE Orders@default 不支持保存 newRowFields')
    }
    expect(() => build({queryConfig: {
      filterLookups: [{field: 'id', sourceViewKey: 'SPACE@Orders@lookup', matchField: 'name', valueField: 'id'}],
    }})).toThrow('SPACE Orders@default 不支持保存 queryConfig.filterLookups')
    expect(compileRuntimeDataSetPlan(build({onRequestComplete: '', queryContext: {}, sortExpression: [],
      queryConfig: {fields: [], filterLookups: []}}))
      .metadata.tables['Orders']?.views['default'])
      .toBeDefined()
    expect(compileRuntimeDataSetPlan(build({queryConfig: {allPages: true, maxRows: 50_000}}))
      .metadata.tables['Orders']?.views['default']?.queryConfig?.allPages)
      .toBe(true)
  })

  it('keeps the runtime Plan structure hash independent of savedAt', () => {
    const input = {
      scenarioId: 'SPACE', space: {rowid: 'SPACE', Name: 'Space'}, models: [], fields: [], relations: [],
      scenarioConfig: {scenarioId: 'SPACE', tables: {}, resourceRelations: []},
    }
    const first = buildRuntimeDataSetPlan({...input, savedAt: '2026-11-23T00:00:00.000Z'})
    const second = buildRuntimeDataSetPlan({...input, savedAt: '2026-11-24T00:00:00.000Z'})
    expect(first.contentHash).toBe(second.contentHash)
    const previous = JSON.stringify(first), generated = JSON.stringify(second)
    expect(stableRuntimeDataSetPlanText(previous, generated, 'SPACE')).toBe(previous)
    const stale = JSON.stringify({...first, description: 'stale body with the same reported hash'})
    expect(stableRuntimeDataSetPlanText(stale, generated, 'SPACE')).toBe(generated)
  })

  it('round-trips complete paging semantics through Plan v1', () => {
    const plan = buildRuntimeDataSetPlan({
      scenarioId: 'SPACE',
      space: {rowid: 'SPACE', Name: 'Space'},
      models: [{rowid: 'MODEL', Name: 'Rows', MetaName: 'source_rows', Type: '数据库表'}],
      fields: [],
      relations: [],
      scenarioConfig: {scenarioId: 'SPACE', tables: {Rows: {
        modelBinding: {modelId: 'MODEL', modelName: 'Rows'},
        views: {default: {page: 2, pageSize: 75, queryConfig: {pagination: 'paged', allPages: true}}},
      }}, resourceRelations: []},
    })
    const parsed = parseRuntimeDataSetPlanFile(buildRuntimeDataSetPlanText({
      scenarioId: 'SPACE',
      space: {rowid: 'SPACE', Name: 'Space'},
      models: [{rowid: 'MODEL', Name: 'Rows', MetaName: 'source_rows', Type: '数据库表'}],
      fields: [],
      relations: [],
      scenarioConfig: {scenarioId: 'SPACE', tables: {Rows: {
        modelBinding: {modelId: 'MODEL', modelName: 'Rows'},
        views: {default: {page: 2, pageSize: 75, queryConfig: {pagination: 'paged', allPages: true}}},
      }}, resourceRelations: []},
    }), 'SPACE')
    expect(plan.views[0]).toMatchObject({pagination: 'paged', allPages: true, page: 2, pageSize: 75})
    expect(parsed.views[0]).toMatchObject({pagination: 'paged', allPages: true, page: 2, pageSize: 75})
    expect(compileRuntimeDataSetPlan(parsed).metadata.tables['Rows']?.views['default']).toMatchObject({
      page: 2, pageSize: 75, queryConfig: {pagination: 'paged', allPages: true},
    })
  })

  it.each([
    ['emptyResult', null],
    ['omit', undefined],
    ['asNull', {field: 'parentId', operator: 'is-null'}],
  ] as const)('applies %s dependency empty-value policy', async (mode, expected) => {
    const dataSet = DataSet.fromRuntimeDataSetPlan(planText(mode))
    try {
      const parent = dataSet.getView('Parent', 'V_PARENT')
      const child = dataSet.getView('Child', 'V_CHILD')
      if (!parent || !child) throw Error('parent and child views required')
      child.bindQueryExecutor({executeQuery: async () => ({rows: [], total: 0,
        assertIdentity: () => undefined, rowKey: () => undefined,
        fieldAccess: () => ({read: 'visible', write: 'allowed', required: false,
          component: 'editable', writeMode: 'editable'}),
        readFieldAccess: () => 'visible', addActionState: () => 'hidden',
        editActionState: () => 'hidden', deleteActionState: () => 'hidden',
        createChildActionState: () => 'hidden', viewActionState: () => 'hidden',
      })})
      parent.bindQueryExecutor({executeQuery: async () => ({rows: [{ids: []}], total: 1,
        assertIdentity: () => undefined, rowKey: () => 'parent',
        fieldAccess: (_key, field) => ({read: field === 'ids' ? 'visible' : 'visible', write: 'allowed',
          required: false, component: 'editable', writeMode: 'editable'}),
        readFieldAccess: (_row, _field) => 'visible', addActionState: () => 'hidden',
        editActionState: () => 'hidden', deleteActionState: () => 'hidden',
        createChildActionState: () => 'hidden', viewActionState: () => 'hidden',
      })})
      await parent.refresh()
      parent.setCurrentRow(parent.rows[0]!)
      const cascade = dataSet.viewCascades?.[0]
      if (!cascade || cascade.kind === 'field') throw Error('query cascade required')
      expect(dataSet.resolveCascadeFilter(cascade)).toEqual(expected)
    } finally {dataSet.destroy()}
  })
})

describe('selection cascades in a reopened Dataset Plan',()=>{
  it.each([
    {
      kind: 'text operator',
      bindings: {filterBindings: [{sourceField: 'name', targetField: 'displayName', operator: 'contains'}]},
      expected: 'filterBindings[0].operator: Child@default.displayName 不支持 contains',
    },
    {
      kind: 'query input',
      bindings: {filterBindings: [], inputBindings: [{sourceField: 'id', target: 'queryContext.parentId'}]},
      expected: 'inputBindings: Child@default 不支持查询输入级联',
    },
    {
      kind: 'manual query trigger',
      bindings: {autoLoad: false, filterBindings: [{sourceField: 'id', targetField: 'parentId', operator: 'eq'}]},
      expected: 'autoLoad: Child@default 不支持手动查询级联',
    },
    {
      kind: 'conditional query trigger',
      bindings: {when: [{field: 'status', equals: 'READY'}], filterBindings: [{sourceField: 'id', targetField: 'parentId', operator: 'eq'}]},
      expected: 'when: Child@default 不支持条件查询级联',
    },
  ])('rejects a $kind cascade that Plan v1 cannot express', ({bindings, expected}) => {
    const build = () => buildRuntimeDataSetPlanText({
      scenarioId: 'SPACE',
      space: {rowid: 'SPACE', Name: 'Space'},
      models: [
        {rowid: 'M_PARENT', Name: 'Parent', MetaName: 'source_parent', Type: '数据库表'},
        {rowid: 'M_CHILD', Name: 'Child', MetaName: 'source_child', Type: '数据库表'},
      ],
      fields: [],
      relations: [],
      scenarioConfig: {
        scenarioId: 'SPACE',
        tables: {
          Parent: {modelBinding: {modelId: 'M_PARENT', modelName: 'Parent'}, views: {picked: {}}},
          Child: {modelBinding: {modelId: 'M_CHILD', modelName: 'Child'}, views: {default: {}}},
        },
        viewCascades: [{
          parentTable: 'Parent', parentViewId: 'picked',
          childTable: 'Child', childViewId: 'default',
          ...bindings,
        }],
      },
    })

    expect(build).toThrow(`RUNTIME_DATA_SET_PLAN_BUILD.viewCascades[0].${expected}`)
  })

  it.each(['implicit-selection','explicit-in','implicit-field'] as const)('sends the original condition for %s',async variant=>{
    const sourceField=variant==='implicit-field'?{sourceField:'id'}:{}
    const explicit=variant==='explicit-in'?{operator:'in' as const}:{}
    const text=buildRuntimeDataSetPlanText({
      scenarioId:'SPACE',
      space:{rowid:'SPACE',Name:'Space'},
      models:[
        {rowid:'M_PARENT',Name:'Parent',MetaName:'source_parent',Type:'数据库表'},
        {rowid:'M_CHILD',Name:'Child',MetaName:'source_child',Type:'数据库表'},
      ],
      fields:[
        {rowid:'P_KEY',dataModelId:'M_PARENT',type:'dataModel',Name:'id',FieldType:'varchar',IsOutput:1,IsPKey:1},
        {rowid:'C_KEY',dataModelId:'M_CHILD',type:'dataModel',Name:'id',FieldType:'varchar',IsOutput:1,IsPKey:1},
        {rowid:'C_PARENT',dataModelId:'M_CHILD',type:'dataModel',Name:'parentId',FieldType:'varchar',IsOutput:1,IsPKey:0},
      ],
      relations:[],
      scenarioConfig:{scenarioId:'SPACE',tables:{
        Parent:{modelBinding:{modelId:'M_PARENT',modelName:'Parent'},views:{picked:{}}},
        Child:{modelBinding:{modelId:'M_CHILD',modelName:'Child'},views:{default:{}}},
      },viewCascades:[{
        parentTable:'Parent',parentViewId:'picked',childTable:'Child',childViewId:'default',
        filterBindings:[{targetField:'parentId',...sourceField,...explicit}],
        inputBindings: [],
      }]},
    })
    const dataSet=DataSet.fromRuntimeDataSetPlan(text)
    try{
      const parent=dataSet.getView('Parent','picked'),child=dataSet.getView('Child','default')
      if(!parent||!child)throw new Error('Expected both formal views')
      const readAccess={
        assertIdentity:()=>undefined,rowKey:(row:Readonly<Record<string,unknown>>)=>row['id'],
        fieldAccess:()=>({read:'visible' as const,write:'denied' as const,required:false,
          component:'readonly' as const,writeMode:'readonly' as const}),
        readFieldAccess:()=> 'visible' as const,
        addActionState:()=> 'hidden' as const,editActionState:()=> 'hidden' as const,deleteActionState:()=> 'hidden' as const,
        createChildActionState:()=> 'hidden' as const,viewActionState:()=> 'hidden' as const,
      }
      const sent:unknown[]=[]
      parent.bindQueryExecutor({executeQuery:async()=>({...readAccess,rows:[{id:'A'},{id:'B'},{id:'C'}],total:3})})
      child.bindQueryExecutor({executeQuery:async(_view,params)=>{
        sent.push(params.filter)
        return {...readAccess,rows:[{id:'child',parentId:'A'}],total:1}
      }})
      await parent.refresh()
      expect(parent.rows.map(row=>row['id'])).toEqual(['A','B','C'])
      const [first,second]=parent.rows
      if(!first||!second)throw new Error('Expected originally queried selection')
      parent.setCurrentRow(first)
      parent.setSelectedRows([first,second])
      await child.refresh()
      const expected=variant==='implicit-field'
        ?{field:'parentId',operator:'eq',value:'A'}
        :{field:'parentId',operator:'in',value:['A','B']}
      expect(sent.at(-1)).toEqual(expected)
      expect(child.rows[0]?.['id']).toBe('child')
      if(variant!=='implicit-field'){
        const dispatched=sent.length
        parent.setSelectedRows([])
        await child.refresh()
        expect(sent).toHaveLength(dispatched)
        expect(child.rows).toEqual([])
      }
    }finally{dataSet.destroy()}
  })
})
