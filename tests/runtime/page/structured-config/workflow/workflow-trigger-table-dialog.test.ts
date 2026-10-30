import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import WorkflowTriggerTableDialog from '@/views/features/data-platform/structured-config/workflow-definition/ui/workflow-trigger-table-dialog.vue'

describe('workflow-trigger-table-dialog', () => {
  it('shows workflow id in copy', () => {
    const wrapper = mount(WorkflowTriggerTableDialog, {
      props: {workflowId: 'W-99'},
      global: {
        plugins: [ElementPlus, Spark.createPlugin()],
        stubs: {RendererDialog: {template: '<div class="dialog-stub"><slot /></div>'}},
      },
    })
    expect(wrapper.text()).toContain('W-99')
    expect(wrapper.text()).toMatch(/触发表/)
    wrapper.unmount()
  })
})
