import {expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {defineComponent, h, onBeforeUnmount, onMounted} from 'vue'

it('releases child event payloads emitted both before and during root unmount', () => {
  const payload = {page: 'disposed-page'}
  const Child = defineComponent({
    emits: ['ready', 'disposing'],
    setup(_, {emit}) {
      onMounted(() => emit('ready', payload))
      onBeforeUnmount(() => emit('disposing', payload))
      return () => h('div')
    },
  })
  const parent = mount(defineComponent({setup: () => () => h(Child)}))
  const child = parent.getComponent(Child)
  expect(child.emitted('ready')).toEqual([[payload]])
  parent.unmount()
  expect(child.emitted('ready')).toBeUndefined()
  expect(child.emitted('disposing')).toBeUndefined()
})
