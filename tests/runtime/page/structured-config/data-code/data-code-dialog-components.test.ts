import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {Spark} from '@spark-appworks/spark-component'
import CodeClassSelectorDialog from '@/views/features/data-platform/structured-config/data-code/ui/code-class-selector-dialog.vue'
import CodeClassEditDialog from '@/views/features/data-platform/structured-config/data-code/ui/code-class-edit-dialog.vue'
import CodeInitDialog from '@/views/features/data-platform/structured-config/data-code/ui/code-init-dialog.vue'

const stub = {RendererDialog: {props: ['title'], template: '<div>{{ title }}<slot /></div>'}}
const dialogs = [
  [CodeClassSelectorDialog, '编码类'],
  [CodeClassEditDialog, '分类'],
  [CodeInitDialog, '初始编码'],
] as const

describe('data-code dialog components', () => {
  it.each(dialogs)('renders %s title copy', (component, keyword) => {
    const wrapper = mount(component, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: stub}})
    expect(wrapper.text()).toMatch(new RegExp(keyword))
    wrapper.unmount()
  })
})
