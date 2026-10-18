import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter, RouterView, type LocationQueryRaw} from 'vue-router'
import {defineComponent, h, ref, type Ref} from 'vue'
import ElementPlus from 'element-plus'
import {Spark, registerAllRenderers, RendererButton, RendererForm, RendererTable} from '@spark-appworks/spark-component'
import type {DataSet} from '@spark-appworks/spark-data'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import DictionaryDesign from '@/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue'
import DictionaryData from '@/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page.vue'
import {DictionaryHttp, fixture} from '../../../../packages/spark-lowcode-api/src/platform/resources/dictionary/tests/dictionary-workspace.fixture'
import {createDynamicRouter} from '../../../../packages/spark-app/src/router/dynamic'

vi.mock('@/lowcode/lowcode-runtime', () => ({lowcodeApi: {}, lowcodeHttp: {}}))
const originalStubs = {...config.global.stubs}
const sets: DataSet[] = [], wrappers: VueWrapper[] = []
const hosts = new WeakMap<VueWrapper, {dynamic: ReturnType<typeof createDynamicRouter>; designId: Ref<string>}>()
let http: DictionaryHttp
beforeEach(() => {
  http = new DictionaryHttp()
  registerAllRenderers()
  const stubs = {...originalStubs}
  for (const key of ['el-button', 'el-table', 'el-table-column', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[key]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  vi.spyOn(LowcodeDictionary, 'loadEditor').mockImplementation(async () => {
    const {dataSet} = fixture(http, false, LowcodeDictionary.editorScenarioId)
    sets.push(dataSet)
    return {dataSet, applicationId: 'APP'}
  })
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  sets.splice(0).forEach(ds => ds.destroy())
  vi.restoreAllMocks(); vi.unstubAllGlobals(); config.global.stubs = originalStubs
})
async function open(kind: 'design' | 'data', create = false, query: LocationQueryRaw = {dictionaryId: 'D1'}) {
  const designId = ref('D1')
  const page = kind === 'design' ? defineComponent({setup: () => () => h(DictionaryDesign, {dictionaryId: designId.value, create})}) : DictionaryData
  const router = createRouter({history: createMemoryHistory(), routes: []})
  const dynamic = createDynamicRouter({router, pageComponent: page, componentMap: {'/dictionary': page},
    loadNavigation: async () => ({id: 'root', title: 'Root', childPlacement: 'header', items: [
      {id: 'dictionary', title: '字典', path: '/dictionary', itemKind: 'system-page', blueprintScenarioId: LowcodeDictionary.editorScenarioId},
    ]})})
  await dynamic.registerRoutes()
  await router.push({path: '/dictionary', query}); await router.isReady()
  const wrapper = mount(defineComponent({setup: () => () => h(RouterView)}), {attachTo: document.body, global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  hosts.set(wrapper, {dynamic, designId})
  await flushPromises()
  return wrapper
}
function button(wrapper: VueWrapper, label: string) {
  const item = wrapper.findAll('button').find(node => node.text() === label)
  if (!item) throw new Error(`按钮不存在: ${label}\n${wrapper.text()}`)
  return item
}
function field(wrapper: VueWrapper, label: string) {
  const item = wrapper.findComponent(RendererForm).findAll('.el-form-item').find(node => node.find('label').text() === label)
  if (!item) throw new Error(`字段不存在: ${label}\n${wrapper.text()}`)
  return item
}
async function selectEntry(wrapper: VueWrapper) {
  await wrapper.findComponent(RendererTable).get('.el-table__body .el-table__row').trigger('click')
  await flushPromises()
}

function holdResponse(owner: DictionaryHttp, url: string) {
  let release!: () => void, reject!: (error: Error) => void
  const waiting = new Promise<void>((resolve, fail) => {release = resolve; reject = fail})
  owner.afterResponse = async config => {
    if (config.url !== url) return
    delete owner.afterResponse
    await waiting
  }
  return {release, reject}
}

function secondDictionary(): DictionaryHttp {
  const next = new DictionaryHttp()
  Object.assign(next.records['_Base_DictType']![0]!, {rowid: 'D2', fiveValue: '新目标标题'})
  Object.assign(next.records['_Base_DictData']![0]!, {rowid: 'E2', typeid: 'D2', exVal_4: '新目标数据'})
  return next
}

describe('Dictionary independent design and data pages', () => {
  it.each(['target-switch', 'unmount'])('ignores a late formal query after %s and does not start further reads for it', async action => {
    const previous = http
    const gate = holdResponse(previous, '/api/DataOperation/GetData')
    const data = await open('data')
    expect(previous.reads).toHaveLength(1)
    const stale = sets[0]!
    if (action === 'target-switch') {
      http = secondDictionary()
      await data.vm.$router.push({path: '/dictionary', query: {dictionaryId: 'D2'}}); await flushPromises()
      expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    } else data.unmount()
    gate.release(); await flushPromises()
    expect(stale.destroyed).toBe(true)
    expect(previous.reads).toHaveLength(1)
    expect(previous.saves).toHaveLength(0)
    if (action === 'target-switch') {
      expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
      expect(data.find('[role="alert"]').exists()).toBe(false)
    }
  })
  it('guards close and cancel while saving, then releases the dirty source only after confirmation and reread', async () => {
    const data = await open('data')
    await selectEntry(data)
    await field(data, '说明').get('input').setValue('在途保存')
    const gate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    const {dynamic} = hosts.get(data)!
    const instance = dynamic.getSystemPageInstance(data.vm.$router.currentRoute.value)!
    expect(instance.isDirty).toBe(true)
    expect(() => dynamic.closeSystemPageInstance(instance.instanceId)).toThrow('未保存')
    expect(() => dynamic.assertPageRuntimesClean()).toThrow('未保存')
    expect(button(data, '取消数据修改并重读').attributes('disabled')).toBeDefined()
    expect(data.find('form input:not([disabled]):not([readonly])').exists()).toBe(false)
    await button(data, '保存数据').trigger('click')
    expect(http.saves).toHaveLength(1)
    gate.release(); await flushPromises()
    expect(instance.isDirty).toBe(false)
    expect(() => dynamic.assertPageRuntimesClean()).not.toThrow()
    expect(http.records['_Base_DictData']![0]!['exVal_4']).toBe('在途保存')
    expect(http.reads).toHaveLength(4)
    expect(http.saves).toHaveLength(1)
  })
  it('keeps a lost in-flight receipt guarded until reread without replaying the submission', async () => {
    const data = await open('data')
    await selectEntry(data)
    await field(data, '说明').get('input').setValue('已写但未知')
    const gate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    gate.reject(new Error('旧保存回执中断')); await flushPromises()
    const {dynamic} = hosts.get(data)!
    expect(() => dynamic.assertPageRuntimesClean()).toThrow('未保存')
    expect(button(data, '保存数据').attributes('disabled')).toBeDefined()
    await button(data, '重读核验（放弃本地修改）').trigger('click'); await flushPromises()
    expect(() => dynamic.assertPageRuntimesClean()).not.toThrow()
    expect(data.findComponent(RendererTable).text()).toContain('已写但未知')
    expect(http.saves).toHaveLength(1)
  })
  it('keeps the new design identity independent of an old pending save and its late error', async () => {
    const design = await open('design')
    const previous = http
    await field(design, '第五文本标题').get('input').setValue('旧定义提交')
    const gate = holdResponse(previous, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    http = secondDictionary()
    hosts.get(design)!.designId.value = 'D2'; await flushPromises()
    const blockedByOldSave = button(design, '保存设计').attributes('disabled') !== undefined
    gate.reject(new Error('旧保存回执中断')); await flushPromises()
    expect.soft(blockedByOldSave).toBe(false)
    expect.soft(design.find('[role="alert"]').exists()).toBe(false)
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toBeUndefined()
    expect((field(design, '第五文本标题').get('input').element as HTMLInputElement).value).toBe('新目标标题')
    expect(previous.saves).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
  })
  it.each(['success', 'failure'])('does not let an old save %s unlock or complete a newer save', async result => {
    const design = await open('design')
    const previous = http
    await field(design, '第五文本标题').get('input').setValue('旧定义提交')
    const oldGate = holdResponse(previous, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    http = secondDictionary()
    hosts.get(design)!.designId.value = 'D2'; await flushPromises()
    await field(design, '第五文本标题').get('input').setValue('新定义提交')
    const newGate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    if (result === 'success') oldGate.release()
    else oldGate.reject(new Error('旧回执失败'))
    await flushPromises()
    expect(design.find('[role="alert"]').exists()).toBe(false)
    expect(button(design, '保存设计').attributes('disabled')).toBeDefined()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toBeUndefined()
    expect(() => hosts.get(design)!.dynamic.assertPageRuntimesClean()).toThrow('未保存')
    newGate.release(); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(1)
    expect(() => hosts.get(design)!.dynamic.assertPageRuntimesClean()).not.toThrow()
    expect(previous.records['_Base_DictType']![0]!['fiveValue']).toBe('旧定义提交')
    expect(http.records['_Base_DictType']![0]!['fiveValue']).toBe('新定义提交')
    expect(previous.saves).toHaveLength(1)
    expect(http.saves).toHaveLength(1)
  })
  it('releases a force-unmounted saving page without publishing success or replaying the write', async () => {
    const design = await open('design')
    await field(design, '第五文本标题').get('input').setValue('卸载前提交')
    const gate = holdResponse(http, '/api/DataOperation/BatchTableOperateRequestByCRUD')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    const page = design.findComponent(DictionaryDesign), dataSet = sets[0]!
    design.unmount()
    gate.release(); await flushPromises()
    expect(dataSet.destroyed).toBe(true)
    expect(page.emitted('saved')).toBeUndefined()
    expect(http.saves).toHaveLength(1)
    expect(http.reads).toHaveLength(2)
    expect(http.records['_Base_DictType']![0]!['fiveValue']).toBe('卸载前提交')
  })
  it('ignores a superseded assembly and releases its DataSet after the new dictionary is ready', async () => {
    const previous = http
    const stale = fixture(previous, false, LowcodeDictionary.editorScenarioId).dataSet
    sets.push(stale)
    let release!: (value: {dataSet: DataSet; applicationId: string}) => void
    vi.mocked(LowcodeDictionary.loadEditor).mockImplementationOnce(() => new Promise(resolve => {release = resolve}))
    const data = await open('data')
    expect(data.text()).toContain('正在读取字典数据')
    http = new DictionaryHttp()
    Object.assign(http.records['_Base_DictType']![0]!, {rowid: 'D2', fiveValue: '新目标标题'})
    Object.assign(http.records['_Base_DictData']![0]!, {rowid: 'E2', typeid: 'D2', exVal_4: '新目标数据'})
    await data.vm.$router.push({path: '/dictionary', query: {dictionaryId: 'D2'}}); await flushPromises()
    expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    release({dataSet: stale, applicationId: 'APP'}); await flushPromises()
    expect(stale.destroyed).toBe(true)
    expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    expect(data.find('[role="alert"]').exists()).toBe(false)
    expect(previous.reads).toHaveLength(0)
    await selectEntry(data)
    await field(data, '新目标标题').get('input').setValue('当前目标提交')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(previous.saves).toHaveLength(0)
    expect(http.records['_Base_DictData']![0]).toMatchObject({rowid: 'E2', typeid: 'D2', exVal_4: '当前目标提交'})
  })
  it('destroys a late assembly after the data page unmounts without querying or saving it', async () => {
    const stale = fixture(http, false, LowcodeDictionary.editorScenarioId).dataSet
    sets.push(stale)
    let release!: (value: {dataSet: DataSet; applicationId: string}) => void
    vi.mocked(LowcodeDictionary.loadEditor).mockImplementationOnce(() => new Promise(resolve => {release = resolve}))
    const data = await open('data')
    data.unmount()
    release({dataSet: stale, applicationId: 'APP'}); await flushPromises()
    expect(stale.destroyed).toBe(true)
    expect(http.reads).toHaveLength(0)
    expect(http.saves).toHaveLength(0)
  })
  it.each([{}, {dictionaryId: ['D1', 'D2']}])('rejects absent or repeated resource identity before loading: %j', async query => {
    const data = await open('data', false, query)
    expect(data.get('[role="alert"]').text()).toContain('唯一字典')
    expect(LowcodeDictionary.loadEditor).not.toHaveBeenCalled()
    expect(http.reads).toHaveLength(0)
    expect(data.findComponent(RendererTable).exists()).toBe(false)
  })
  it('discards design changes without modifying either persistent model', async () => {
    const design = await open('design')
    await field(design, '第五文本标题').get('input').setValue('取消的标题')
    expect(button(design, '删除字典资源…').attributes('disabled')).toBeDefined()
    await button(design, '取消设计修改并重读').trigger('click'); await flushPromises()
    expect((field(design, '第五文本标题').get('input').element as HTMLInputElement).value).toBe('说明')
    expect(button(design, '删除字典资源…').attributes('disabled')).toBeUndefined()
    expect(http.saves).toHaveLength(0)
  })
  it('rebinds a clean target switch to the new identity and saves only its entries', async () => {
    const data = await open('data')
    const previous = http
    http = new DictionaryHttp()
    Object.assign(http.records['_Base_DictType']![0]!, {rowid: 'D2', fiveValue: '新目标标题'})
    Object.assign(http.records['_Base_DictData']![0]!, {rowid: 'E2', typeid: 'D2', exVal_4: '新目标数据'})
    await data.vm.$router.push({path: '/dictionary', query: {dictionaryId: 'D2'}}); await flushPromises()
    expect(data.findComponent(RendererTable).text()).toContain('新目标标题')
    expect(data.findComponent(RendererTable).text()).toContain('新目标数据')
    await selectEntry(data)
    await field(data, '新目标标题').get('input').setValue('目标二已修改')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(previous.saves).toHaveLength(0)
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Changed: [{rowid: 'E2', exVal_4: '目标二已修改'}]}}])
    expect(http.records['_Base_DictType']![0]!['rowid']).toBe('D2')
  })
  it('saves design titles, reopens an independent data page, saves data and cancels a later edit through real components', async () => {
    const design = await open('design')
    expect(design.findComponent(RendererTable).exists()).toBe(false)
    await field(design, '第五文本标题').get('input').setValue('用途说明')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(1)
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictType'}])
    expect(http.saves[0]!.data).toHaveLength(1)
    design.unmount()
    const data = await open('data')
    expect(data.findComponent(RendererTable).text()).toContain('用途说明')
    expect(data.text()).not.toContain('保存设计')
    await selectEntry(data)
    await field(data, '用途说明').get('input').setValue('业务值')
    expect(data.findComponent(RendererTable).text()).toContain('业务值')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(2)
    expect(http.saves[1]!.data).toMatchObject([{TableName: '_Base_DictData'}])
    expect(http.saves[1]!.data).toHaveLength(1)
    data.unmount()
    const reopened = await open('data')
    expect(reopened.findComponent(RendererTable).text()).toContain('业务值')
    await selectEntry(reopened)
    await field(reopened, '用途说明').get('input').setValue('取消此值')
    await button(reopened, '取消数据修改并重读').trigger('click'); await flushPromises()
    expect(reopened.findComponent(RendererTable).text()).toContain('业务值')
    expect(reopened.text()).not.toContain('取消此值')
    expect(http.saves).toHaveLength(2)
  })
  it('persists the numeric order, reopens it and cancels a later change through the bound standard field', async () => {
    const data = await open('data')
    const query = http.reads.find(item => (item.data as {Table: {Name: string}[]}).Table[0]?.Name === '_Base_DictData')!
    expect(query.data).toMatchObject({Table: [{Fields: expect.arrayContaining([
      expect.objectContaining({Name: 'ordIdx', OrderType: 'ascending', Order: 2}),
      expect.objectContaining({Name: 'rowid', OrderType: 'ascending', Order: 1}),
    ])}]})
    await selectEntry(data)
    const number = field(data, '排序').get('input')
    expect(number.attributes('disabled')).toBeUndefined()
    await number.setValue('4'); await number.trigger('blur'); await flushPromises()
    expect((number.element as HTMLInputElement).value).toBe('4')
    expect(data.findComponent(RendererTable).get('.el-table__body .el-table__row').text()).toContain('4')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Changed: [{rowid: 'E1', ordIdx: 4}]}}])
    expect(http.saves[0]!.data).toHaveLength(1)
    data.unmount()
    const reopened = await open('data')
    await selectEntry(reopened)
    expect((field(reopened, '排序').get('input').element as HTMLInputElement).value).toBe('4')
    await field(reopened, '排序').get('input').setValue('8'); await flushPromises()
    await button(reopened, '取消数据修改并重读').trigger('click'); await flushPromises()
    await selectEntry(reopened)
    expect((field(reopened, '排序').get('input').element as HTMLInputElement).value).toBe('4')
    expect(http.saves).toHaveLength(1)
  })
  it('preserves an explicit zero order on a new entry without submitting design configuration', async () => {
    const data = await open('data')
    await button(data, '新增条目').trigger('click'); await flushPromises()
    await field(data, '代码').get('input').setValue('new')
    await field(data, '名称').get('input').setValue('新条目')
    const number = field(data, '排序').get('input')
    expect(number.attributes('disabled')).toBeUndefined()
    await number.setValue('2'); await number.setValue('0'); await flushPromises()
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Added: [{val: 'new', ordIdx: 0}]}}])
    expect(http.saves[0]!.data).toHaveLength(1)
    expect(http.records['_Base_DictData']!.find(row => row['val'] === 'new')?.['ordIdx']).toBe(0)
  })
  it('keeps denied ordering read only while allowing an unrelated entry field to save', async () => {
    http.denied = ['ordIdx']
    const data = await open('data')
    await selectEntry(data)
    expect(field(data, '排序').find('input:not([disabled]):not([readonly])').exists()).toBe(false)
    await field(data, '说明').get('input').setValue('独立修改')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Changed: [{rowid: 'E1', exVal_4: '独立修改'}]}}])
    expect(http.records['_Base_DictData']![0]!['ordIdx']).toBe(1)
  })
  it('disables entry creation and protected fields according to the formal query result', async () => {
    http.allowAdd = false; http.denied = ['exVal_4']
    const data = await open('data')
    expect(button(data, '新增条目').attributes('disabled')).toBeDefined()
    await selectEntry(data)
    const protectedField = field(data, '说明')
    expect(protectedField.find('input:not([disabled]):not([readonly])').exists()).toBe(false)
    expect(http.saves).toHaveLength(0)
  })
  it('requires reread after a lost save receipt and does not repeat the write', async () => {
    const data = await open('data')
    await selectEntry(data)
    await field(data, '说明').get('input').setValue('回执中断的数据')
    http.failAfterWrite = true
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(data.get('[role="alert"]').text()).toBeTruthy()
    expect(button(data, '保存数据').attributes('disabled')).toBeDefined()
    await button(data, '重读核验（放弃本地修改）').trigger('click'); await flushPromises()
    expect(data.findComponent(RendererTable).text()).toContain('回执中断的数据')
    expect(button(data, '保存数据').attributes('disabled')).toBeUndefined()
    expect(http.saves).toHaveLength(1)
  })
  it('creates a design before entering data maintenance and persists a new six-field entry', async () => {
    http.records = {_Base_DictType: [], _Base_DictData: []}
    const design = await open('design', true)
    await field(design, '字典名称').get('input').setValue('新字典')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    expect(design.get('[role="alert"]').text()).toContain('功能描述')
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toBeUndefined()
    expect(http.saves).toHaveLength(0)
    await field(design, '功能描述').get('input').setValue('用于维护选项')
    await button(design, '保存设计').trigger('click'); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('saved')).toHaveLength(1)
    expect(http.records['_Base_DictType']).toMatchObject([{rowid: 'D1', TypeName: '新字典', functiondesc: '用于维护选项'}])
    design.unmount()
    const data = await open('data')
    await button(data, '新增条目').trigger('click'); await flushPromises()
    await field(data, '编码').get('input').setValue('A')
    await field(data, '显示文本').get('input').setValue('新条目')
    await field(data, '第五文本').get('input').setValue('第五输出')
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.records['_Base_DictData']).toMatchObject([{typeid: 'D1', val: 'A', txt: '新条目', exVal_4: '第五输出'}])
    expect(http.saves).toHaveLength(2)
  })
  it('keeps local draft cancellation available when deletion of existing entries is denied', async () => {
    http.denyDeleteIds = ['E1']
    const data = await open('data')
    await selectEntry(data)
    expect(button(data, '删除当前条目').attributes('disabled')).toBeDefined()
    await button(data, '新增条目').trigger('click'); await flushPromises()
    expect(data.findComponent(RendererTable).findAll('.el-table__body .el-table__row')).toHaveLength(2)
    expect(button(data, '删除当前条目').attributes('disabled')).toBeUndefined()
    await button(data, '删除当前条目').trigger('click'); await flushPromises()
    expect(data.findComponent(RendererTable).findAll('.el-table__body .el-table__row')).toHaveLength(1)
    expect(http.saves).toHaveLength(0)
  })
  it('stages an allowed entry removal and saves only the entry model', async () => {
    const data = await open('data')
    await selectEntry(data)
    await button(data, '删除当前条目').trigger('click'); await flushPromises()
    expect(http.records['_Base_DictData']).toHaveLength(1)
    await button(data, '保存数据').trigger('click'); await flushPromises()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData', CrudModel: {Deleted: [{rowid: 'E1'}]}}])
    expect(http.records['_Base_DictData']).toHaveLength(0)
    expect(http.records['_Base_DictType']).toHaveLength(1)
  })
  it('disables resource removal when any child record is not deletable', async () => {
    http.denyDeleteIds = ['E1']
    const design = await open('design')
    expect(button(design, '删除字典资源…').attributes('disabled')).toBeDefined()
    expect(http.saves).toHaveLength(0)
  })
  it('confirms resource removal and verifies entries and definition are gone through the same owner', async () => {
    const design = await open('design')
    await button(design, '删除字典资源…').trigger('click'); await flushPromises()
    const confirm = design.findAllComponents(RendererButton).find(item => item.props('label') === '确认删除')!
    await confirm.get('button').trigger('click'); await flushPromises()
    expect(design.findComponent(DictionaryDesign).emitted('deleted')).toHaveLength(1)
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.data).toMatchObject([{TableName: '_Base_DictData'}, {TableName: '_Base_DictType'}])
    expect(http.records['_Base_DictType']).toHaveLength(0)
    expect(http.records['_Base_DictData']).toHaveLength(0)
  })
})
