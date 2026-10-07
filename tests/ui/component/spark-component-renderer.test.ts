import { expect, test, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkComponentRenderer, Spark, SPARK_REGISTRY_KEY } from '@spark-appworks/spark-component'
import { PAGE_COMPONENT_REGISTRY } from '../../../packages/spark-component/src/core/capability-keys'
import { createPageComponentRegistry } from '../../../packages/spark-component/src/page/context/page-component-registry'
import { sparkProvide, createSparkCapabilityContext } from '@spark-appworks/spark-utils'
import { defineComponent, h } from 'vue'
import SparkComponentRendererSource from '../../../packages/spark-component/src/components/SparkComponentRenderer.vue'

const { registry, rootContext } = Spark.createSystem()

test('SparkComponentRenderer forwards config.on listeners to rendered components', async () => {
  const ClickEmitter = defineComponent({
    emits: ['click'],
    setup(_, { emit }) {
      return () => h('button', { class: 'click-emitter', onClick: () => emit('click', 'payload') }, 'emit')
    }
  })
  registry.register({ type: 'test-click-emitter', component: ClickEmitter })

  const clickSpy = vi.fn()
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: { type: 'test-click-emitter', props: { on: { click: clickSpy } } },
      parentContext: rootContext
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  await wrapper.find('.click-emitter').trigger('click')
  expect(clickSpy).toHaveBeenCalledWith('payload')
})

test('SparkComponentRenderer requires registry registration for generic Vue global components', () => {
  const SearchBar = defineComponent({
    name: 'SearchBar',
    setup() {
      return () => h('div', { class: 'search-bar' }, 'search')
    }
  })

  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: { type: 'SearchBar' },
      parentContext: rootContext
    },
    global: {
      components: {
        SearchBar
      },
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.search-bar').exists()).toBe(false)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(true)
})

test('SparkComponentRenderer resolves page-owned Render* components for page script dynamic renderers', () => {
  const RenderStatusAction = defineComponent({
    name: 'RenderStatusAction',
    setup() {
      return () => h('div', { class: 'render-status-action' }, 'status')
    }
  })

  const pageRegistry = createPageComponentRegistry()
  pageRegistry.registerRender('RenderStatusAction', RenderStatusAction)
  const pageContext = createSparkCapabilityContext({id:'test-page',type:'spark-page'})
  sparkProvide(pageContext, PAGE_COMPONENT_REGISTRY, pageRegistry)
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: { type: 'RenderStatusAction' },
      parentContext: pageContext
    },
    global: {
      components: {
        RenderStatusAction
      },
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.render-status-action').exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})

test('SparkComponentRenderer only forwards config.props to registered components', () => {
  const RootFieldReader = defineComponent({
    props: {
      label: String,
      status: String,
      gridGap: Number,
    },
    setup(componentProps) {
      return () => h('div', {
        class: 'root-field-reader',
        'data-label': componentProps.label ?? '',
        'data-status': componentProps.status ?? '',
        'data-gap': String(componentProps.gridGap ?? ''),
      }, 'root')
    }
  })

  registry.register({ type: 'root-field-reader', component: RootFieldReader })

  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'root-field-reader',
        props: {
          label: 'props 标签',
          status: 'active',
          gridGap: 18,
        },
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  const reader = wrapper.find('.root-field-reader')
  expect(reader.attributes('data-label')).toBe('props 标签')
  expect(reader.attributes('data-status')).toBe('active')
  expect(reader.attributes('data-gap')).toBe('18')
})

test('SparkComponentRenderer rejects root-level business fields', () => {
  const invalidRootFieldConfig = {
    type: 'root-field-reader',
    label: 'root label',
  }

  expect(() => mount(SparkComponentRenderer, {
    props: {
      config: invalidRootFieldConfig,
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      },
    },
  })).toThrow(/SparkNode root field "label" is invalid/)
})

test('SparkComponentRenderer maps cross-framework config value to Vue modelValue before forwarding', () => {
  const system = Spark.createSystem()
  const ModelValueReader = defineComponent({
    inheritAttrs: false,
    props: {
      modelValue: [String, Boolean],
    },
    setup(componentProps, { attrs }) {
      return () => h('div', {
        class: 'model-value-reader',
        'data-model-value': String(componentProps.modelValue ?? ''),
        'data-has-value-attr': String(Object.prototype.hasOwnProperty.call(attrs, 'value')),
        'data-value-attr': String(attrs['value'] ?? ''),
      }, 'model')
    },
  })
  system.registry.register({ type: 'r-text', component: ModelValueReader })

  const wrapper = mount(SparkComponentRendererSource, {
    props: {
      config: {
        type: 'r-text',
        props: {
          value: 'config-value',
        },
      },
      parentContext: system.rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: system.registry,
      },
    },
  })

  const reader = wrapper.find('.model-value-reader')
  expect(reader.attributes('data-model-value')).toBe('config-value')
  expect(reader.attributes('data-has-value-attr')).toBe('false')
  expect(reader.attributes('data-value-attr')).toBe('')
})

test('SparkComponentRenderer drops config value when Vue modelValue is already present', () => {
  const system = Spark.createSystem()
  const ModelValueReader = defineComponent({
    inheritAttrs: false,
    props: {
      modelValue: [String, Boolean],
    },
    setup(componentProps, { attrs }) {
      return () => h('div', {
        class: 'model-value-reader',
        'data-model-value': String(componentProps.modelValue ?? ''),
        'data-has-value-attr': String(Object.prototype.hasOwnProperty.call(attrs, 'value')),
        'data-value-attr': String(attrs['value'] ?? ''),
      }, 'model')
    },
  })
  system.registry.register({ type: 'r-text', component: ModelValueReader })

  const wrapper = mount(SparkComponentRendererSource, {
    props: {
      config: {
        type: 'r-text',
        props: {
          value: 'config-value',
          modelValue: 'vue-model',
        },
      },
      parentContext: system.rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: system.registry,
      },
    },
  })

  const reader = wrapper.find('.model-value-reader')
  expect(reader.attributes('data-model-value')).toBe('vue-model')
  expect(reader.attributes('data-has-value-attr')).toBe('false')
  expect(reader.attributes('data-value-attr')).toBe('')
})

test('SparkComponentRenderer does not forward empty children prop to registered components', () => {
  const AttrReader = defineComponent({
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => h('div', {
        class: 'registered-attr-reader',
        'data-has-children': String('children' in attrs),
      }, 'attr')
    }
  })

  registry.register({ type: 'registered-attr-reader', component: AttrReader })

  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'registered-attr-reader',
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.registered-attr-reader').attributes('data-has-children')).toBe('false')
})

test('SparkComponentRenderer auto mode forwards children prop to registered components that declare it', () => {
  const PropReader = defineComponent({
    props: {
      children: {
        type: Array,
        default: () => [],
      },
    },
    setup(componentProps) {
      return () => h('div', {
        class: 'registered-prop-reader',
        'data-children-count': String(componentProps.children.length),
      }, 'prop-reader')
    }
  })

  registry.register({ type: 'registered-prop-reader', component: PropReader })

  const wrapper = mount(SparkComponentRendererSource, {
    props: {
      config: {
        type: 'registered-prop-reader',
        children: ['prop-content'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.registered-prop-reader').exists()).toBe(true)
  expect(wrapper.find('.registered-prop-reader').attributes('data-children-count')).toBe('1')
  expect(wrapper.text()).not.toContain('prop-content')
})

test('SparkComponentRenderer renders registered components without children prop through unified slot path', () => {
  const SlotReader = defineComponent({
    inheritAttrs: false,
    setup(_, { slots }) {
      return () => h('section', { class: 'registered-slot-reader' }, slots['default']?.())
    }
  })

  registry.register({ type: 'registered-slot-reader', component: SlotReader })

  const wrapper = mount(SparkComponentRendererSource, {
    props: {
      config: {
        type: 'registered-slot-reader',
        children: ['slot-content'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.registered-slot-reader').exists()).toBe(true)
  expect(wrapper.text()).toContain('slot-content')
})

test('SparkComponentRenderer allows registry meta.childrenMode to force slot rendering', () => {
  const HybridReader = defineComponent({
    props: {
      children: {
        type: Array,
        default: () => [],
      },
    },
    setup(componentProps, { slots }) {
      return () => h('div', {
        class: 'registered-hybrid-reader',
        'data-prop-children-count': String(componentProps.children.length),
      }, slots['default']?.())
    }
  })

  registry.register({
    type: 'registered-hybrid-reader',
    component: HybridReader,
    meta: { childrenMode: 'slot' },
  })

  const wrapper = mount(SparkComponentRendererSource, {
    props: {
      config: {
        type: 'registered-hybrid-reader',
        children: ['slot-forced-content'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  const reader = wrapper.find('.registered-hybrid-reader')
  expect(reader.exists()).toBe(true)
  expect(reader.attributes('data-prop-children-count')).toBe('0')
  expect(wrapper.text()).toContain('slot-forced-content')
})

test('SparkComponentRenderer renders native html tags directly', () => {
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'div',
        props: { class: 'native-wrapper' },
        children: ['hello']
      },
      parentContext: rootContext
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.native-wrapper').exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
  expect(wrapper.text()).toContain('hello')
})

test('SparkComponentRenderer preserves numeric literal children in native rendering', () => {
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'div',
        props: { class: 'native-wrapper-number' },
        children: [123],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.native-wrapper-number').exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
  expect(wrapper.text()).toContain('123')
})

test('SparkComponentRenderer renders native buttons and still filters internal props', () => {
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'button',
        props: {
          class: 'native-scoped-button',
          '$custom': 'test-value',
          rowIndex: 3,
        },
        children: ['action'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  const button = wrapper.find('.native-scoped-button')
  expect(button.exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
  expect(button.attributes('$custom')).toBeUndefined()
  expect(wrapper.text()).toContain('action')
})

test('SparkComponentRenderer keeps scoped row props away from native tags', () => {
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'button',
        props: {
          class: 'native-row-button',
          row: { id: 'n-1', title: '节点' },
          rowIndex: 2,
          data: { id: 'n-1' },
        },
        children: ['action'],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  const button = wrapper.find('.native-row-button')
  expect(button.exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
  expect(button.attributes('row')).toBeUndefined()
  expect(button.attributes('rowindex')).toBeUndefined()
  expect(button.attributes('data')).toBeUndefined()
  expect(wrapper.text()).toContain('action')
})

test('SparkComponentRenderer renders globally registered el-* components', () => {
  const ElButton = defineComponent({
    name: 'ElButton',
    setup(_, { slots, attrs }) {
      return () => h('button', {
        class: 'el-button-global-stub',
        'data-kind': String(attrs['type'] ?? ''),
      }, slots['default']?.())
    }
  })

  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'el-button',
        props: {
          type: 'primary',
        },
        children: ['保存'],
      },
      parentContext: rootContext,
    },
    global: {
      components: {
        ElButton,
      },
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  const button = wrapper.find('.el-button-global-stub')
  expect(button.exists()).toBe(true)
  expect(button.text()).toContain('保存')
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})

test('SparkComponentRenderer keeps warning fallback for unknown non-native component types', () => {
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: { type: 'unknown-widget', children: [] },
      parentContext: rootContext
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(true)
})

test('SparkComponentRenderer fallback can expand node snapshot for unknown component types', async () => {
  const wrapper = mount(SparkComponentRenderer, {
    props: {
      config: {
        type: 'unknown-widget',
        id: 'unknown-node-1',
        props: {
          title: '测试节点',
          visible: true,
        },
        children: [],
      },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  await wrapper.find('.unregistered-details-button').trigger('click')

  const panel = wrapper.find('.unregistered-details-panel')
  expect(panel.exists()).toBe(true)
  expect(panel.text()).toContain('unknown-widget')
  expect(panel.text()).toContain('测试节点')
  expect(panel.text()).toContain('unknown-node-1')
})

test('SparkComponentRenderer falls back when registry component hostTypes do not match current parent chain', () => {
  const HostLockedCard = defineComponent({
    name: 'HostLockedCard',
    setup() {
      return () => h('div', { class: 'host-locked-card' }, 'host-locked')
    }
  })

  registry.register({
    type: 'host-locked-card',
    component: HostLockedCard,
    meta: { hostTypes: ['r-table'] },
  })

  const wrapper = mount(SparkComponentRendererSource, {
    props: {
      config: { type: 'host-locked-card' },
      parentContext: rootContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.host-locked-card').exists()).toBe(false)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(true)
  expect(wrapper.text()).toContain('宿主类型不匹配')
  expect(wrapper.text()).toContain('r-table')
})

test('SparkComponentRenderer renders registry component when hostTypes match current parent chain', () => {
  const HostLockedCard = defineComponent({
    name: 'HostLockedCardMatched',
    setup() {
      return () => h('div', { class: 'host-locked-card-matched' }, 'host-locked')
    }
  })

  registry.register({
    type: 'host-locked-card-matched',
    component: HostLockedCard,
    meta: { hostTypes: ['r-table'] },
  })

  const tableContext = {
    id: 'spark-table-provider',
    type: 'r-table',
    capabilities: new Map(),
    parent: rootContext,
  }

  const wrapper = mount(SparkComponentRendererSource, {
    props: {
      config: { type: 'host-locked-card-matched' },
      parentContext: tableContext,
    },
    global: {
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      }
    }
  })

  expect(wrapper.find('.host-locked-card-matched').exists()).toBe(true)
  expect(wrapper.find('.spark-component-unregistered').exists()).toBe(false)
})
