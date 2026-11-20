import {describe, expect, it, vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {Spark,RendererButton} from '@spark-appworks/spark-component'
import WorkflowTriggerTableDialog from '@/views/features/data-platform/structured-config/workflow-definition/ui/workflow-trigger-table-dialog.vue'
vi.mock('@/lowcode/resources/structured-config/workflow-definition/resource',()=>({LowcodeWorkflowDefinition:{navigationScenarioId:'5E9676B1E38860B023921F48FB4370DE'}}))

describe('workflow-trigger-table-dialog', () => {
  it('refuses a selector without its original runtime and definition binding', async () => {
    const wrapper = mount(WorkflowTriggerTableDialog, {
      props: {workflowId: 'W-99',dataViewKey:'5E9676B1E38860B023921F48FB4370DE@Base_WorkflowDefinition@edit',validateTarget:()=>{}},
      global: {
        plugins: [ElementPlus, Spark.createPlugin()],
        stubs: {RendererDialog: {template: '<div class="dialog-stub"><slot /><slot name="footer" /></div>'}},
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('目标已变化')
    expect(wrapper.findAllComponents(RendererButton).find(button=>button.props('label')==='确认触发表')!.props('disabled')).toBe(true)
    wrapper.unmount()
  })
})
