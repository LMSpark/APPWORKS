import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {config,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import ElementPlus,{ElDatePicker} from 'element-plus'
import {PAGE_RUNTIME,Spark,FieldText,FieldDate,RendererButton,RendererDialog,registerAllRenderers,useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'
import CodeInitDialog from '@/views/features/data-platform/structured-config/data-code/ui/code-init-dialog.vue'
import {workspaceFixture} from './workspace-fixture'
import {DESIGN} from '../data-code.fixture'
vi.mock('@/lowcode/lowcode-runtime',()=>({lowcodeApi:{},lowcodeHttp:{}}))
const original={...config.global.stubs},wrappers:VueWrapper[]=[]
beforeEach(()=>{
  registerAllRenderers();const stubs={...original}
  for(const name of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[name]
  config.global.stubs=stubs
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
})
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());config.global.stubs=original;vi.restoreAllMocks();vi.unstubAllGlobals()})
async function open(){
  const f=await workspaceFixture(),closed=vi.fn()
  vi.spyOn(LowcodeDataCode,'initialization').mockReturnValue(f.workspace)
  const Host=defineComponent({setup(){const {sparkProvide}=useSparkComponent({type:'init-test'});sparkProvide(PAGE_RUNTIME,f.page)
    return()=>h(CodeInitDialog,{dataViewKey:`${DESIGN}@Base_CodeDesign@default`,onClose:closed})}})
  const wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper)
  await vi.waitFor(()=>expect(wrapper.findAllComponents(FieldText).some(field=>field.props('field')==='InitVal'&&field.find('input').exists())).toBe(true))
  const click=async(label:string)=>{await wrapper.findAllComponents(RendererButton).find(button=>button.props('label')===label)!.get('button').trigger('click');await flushPromises()}
  const value=()=>wrapper.findAllComponents(FieldText).find(field=>field.props('field')==='InitVal'&&field.find('input').exists())!
  return {...f,wrapper,closed,click,value}
}
describe('initialization original-path standard-component dialog',()=>{
  it('binds range, date and candidate fields to the same runtime and saves only initialization records',async()=>{
    const f=await open()
    expect(f.wrapper.getComponent(RendererDialog).props('title')).toBe('设置初始编码')
    expect(f.wrapper.getComponent(FieldDate).props()).toMatchObject({field:'date',dateType:'month',valueFormat:'YYYYMM'})
    expect((f.value().get('input').element as HTMLInputElement).value).toBe('005')
    await f.value().get('input').setValue('007');await flushPromises()
    expect(f.wrapper.getComponent(FieldDate).props('readonly')).toBe(true)
    await f.click('保存')
    await vi.waitFor(()=>expect(f.service.http.records['Base_CodeSerialPerform']![0]?.['Code']).toBe('005'))
    expect(f.service.http.saves.map(save=>save.table)).toEqual(['Base_CodeSerialPerform'])
    await f.click('确定');expect(f.closed).toHaveBeenCalledOnce()
  })
  it('keeps dirty values on close, explicitly cancels, then re-queries a native date change',async()=>{
    const f=await open()
    await f.value().get('input').setValue('007');await flushPromises()
    f.wrapper.getComponent(RendererDialog).vm.$emit('update:modelValue',false);await flushPromises()
    expect(f.closed).not.toHaveBeenCalled();expect(f.workspace.view.hasEditingChanges()).toBe(true)
    await f.click('取消修改');expect(f.workspace.view.hasEditingChanges()).toBe(false)
    f.wrapper.getComponent(ElDatePicker).vm.$emit('update:modelValue','202612');await flushPromises()
    await vi.waitFor(()=>expect(f.calls.at(-1)).toEqual({date:'202612'}))
    expect(f.workspace.view.rows[0]?.['prefix']).toBe('A202612')
    expect(f.service.http.saves).toEqual([])
  })
  it('retains an unknown original submission and verifies it without replay or date switching',async()=>{
    const f=await open();await f.value().get('input').setValue('007');await flushPromises()
    f.service.http.failAfterWrite=true;await f.click('保存')
    await vi.waitFor(()=>expect(f.workspace.view.hasUnconfirmedSave).toBe(true))
    expect(f.wrapper.getComponent(FieldDate).props('readonly')).toBe(true)
    await f.click('核验保存结果');expect(f.workspace.view.hasUnconfirmedSave).toBe(false)
    expect(f.service.http.saves).toHaveLength(1)
    await f.click('确定');expect(f.closed).toHaveBeenCalledOnce()
  })
  it('does not clear the candidate result for an unchanged date value',async()=>{
    const f=await open(),count=f.calls.length
    f.wrapper.getComponent(ElDatePicker).vm.$emit('update:modelValue','202611');await flushPromises()
    expect(f.workspace.view.rows).toHaveLength(1);expect(f.calls).toHaveLength(count)
  })
})
