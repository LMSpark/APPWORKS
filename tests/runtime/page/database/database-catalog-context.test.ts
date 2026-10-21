import {computed, defineComponent, h, nextTick, provide, ref, shallowRef} from 'vue'
import {describe, expect, it} from 'vitest'
import {mount} from '@vue/test-utils'
import {
  DATABASE_CATALOG_CONTEXT,
  useDatabaseCatalogRouteScenario,
} from '@/lowcode/resources/database/database-catalog-context'

const Probe = defineComponent({
  setup() {
    const route = useDatabaseCatalogRouteScenario()
    return () => h('div', {
      'data-scenario': route.scenarioId.value,
      'data-awaiting': String(route.catalogAwaitingHubResolve.value),
      'data-failed': String(route.catalogHubResolveFailed.value),
    })
  },
})

describe('useDatabaseCatalogRouteScenario under hub', () => {
  it('waits for resolved id and does not expose preferred as scenarioId', async () => {
    const preferredScenarioId = computed(() => 'PREFERRED-NODE')
    const navigationNodeId = computed(() => 'NODE-1')
    const resolvedScenarioId = shallowRef<string>()
    const resolveError = ref('')
    const catalogFormalTier = shallowRef<'full' | 'serverOnly' | undefined>()
    const Host = defineComponent({
      setup() {
        provide(DATABASE_CATALOG_CONTEXT, {
          preferredScenarioId,
          navigationNodeId,
          resolvedScenarioId,
          resolveError,
          catalogFormalTier,
        })
        return () => h(Probe)
      },
    })
    const wrapper = mount(Host)
    expect(wrapper.get('[data-scenario]').attributes('data-scenario')).toBe('')
    expect(wrapper.get('[data-awaiting]').attributes('data-awaiting')).toBe('true')

    resolvedScenarioId.value = 'REAL-ROWID'
    await nextTick()
    expect(wrapper.get('[data-scenario]').attributes('data-scenario')).toBe('REAL-ROWID')
    expect(wrapper.get('[data-awaiting]').attributes('data-awaiting')).toBe('false')
  })

  it('surfaces hub resolve failure without falling back to preferred', async () => {
    const preferredScenarioId = computed(() => 'PREFERRED-NODE')
    const navigationNodeId = computed(() => undefined)
    const resolvedScenarioId = shallowRef<string>()
    const resolveError = ref('正式模型不完整')
    const Host = defineComponent({
      setup() {
        provide(DATABASE_CATALOG_CONTEXT, {
          preferredScenarioId,
          navigationNodeId,
          resolvedScenarioId,
          resolveError,
          catalogFormalTier: shallowRef(undefined),
        })
        return () => h(Probe)
      },
    })
    const wrapper = mount(Host)
    expect(wrapper.get('[data-scenario]').attributes('data-scenario')).toBe('')
    expect(wrapper.get('[data-failed]').attributes('data-failed')).toBe('true')
    expect(wrapper.get('[data-awaiting]').attributes('data-awaiting')).toBe('false')
  })
})
