import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import WorkflowDesignNodePanel from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/node-panel/workflow-design-node-panel.vue'
import WorkflowDesignEdgePanel from '@/views/features/data-platform/structured-config/workflow-definition/design/ui/edge-panel/workflow-design-edge-panel.vue'

describe('workflow design panels', () => {
  it('node panel binds JSON textarea', async () => {
    const wrapper = mount(WorkflowDesignNodePanel, {
      props: {modelValue: '[{"id":"n1"}]'},
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    expect(wrapper.find('textarea').element.value).toContain('n1')
    wrapper.unmount()
  })
  it('edge panel binds JSON textarea', async () => {
    const wrapper = mount(WorkflowDesignEdgePanel, {
      props: {modelValue: '[{"from":"n1","to":"n2"}]'},
      global: {plugins: [ElementPlus, Spark.createPlugin()]},
    })
    expect(wrapper.find('textarea').element.value).toContain('n1')
    wrapper.unmount()
  })
})
