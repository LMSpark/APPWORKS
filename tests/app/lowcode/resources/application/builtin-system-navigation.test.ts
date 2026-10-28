import {describe, expect, it} from 'vitest'
import {builtinSystemApplication, parseBuiltinSystemNavigation, readBuiltinSystemNavigation} from '@/lowcode/resources/shared/builtin-system-navigation'

const rootId = 'D99A1DCE9894698799101EFD70F8FC76'
const pageId = '0C70F74793F9E858B71E0DBDEC784D57'

function node(id: string, parentId: string, kind: 'Model' | 'Navitem' = 'Model') {
  return {id, parentId, title: id, order: 1, conid: kind === 'Navitem' ? id : '', kind,
    ...(kind === 'Navitem' ? {url: 'vue:/features/application/application-manager/ui/application-manager-page', publishInMenu: true} : {})}
}

describe('AppWorks repository navigation source', () => {
  it('loads the declared root and the registered Vue subset from the application source', async () => {
    const application = builtinSystemApplication()
    const navigation = await readBuiltinSystemNavigation()
    expect(application).toEqual({id: rootId, name: '软件工坊[AppWorks]'})
    expect(navigation.navigationRootId).toBe(application.id)
    expect(navigation.nodes.filter(item => item.kind === 'Navitem')).toHaveLength(18)
    expect(navigation.nodes.some(item => item.id === pageId
      && item.url === 'vue:/features/application/application-manager/ui/application-manager-page')).toBe(true)
  })

  it.each([
    ['root differs from the application identity', rootId.replace(/^D99/, 'E99'), [node(rootId, '000000')]],
    ['node parent is missing', rootId, [node(rootId, '000000'), node(pageId, 'A73BFB70B8EA48FA84C4D8F3CD4F20BD', 'Navitem')]],
    ['non-root parent chain has a cycle', rootId, [node(rootId, '000000'), node(pageId, 'A73BFB70B8EA48FA84C4D8F3CD4F20BD', 'Navitem'),
      node('A73BFB70B8EA48FA84C4D8F3CD4F20BD', pageId)]],
    ['an unrelated second root exists', rootId, [node(rootId, '000000'), node(pageId, '000000')]],
  ])('rejects %s', (_label, navigationRootId, nodes) => {
    expect(() => parseBuiltinSystemNavigation({protocol: 'spark-appworks.system-navigation', schemaVersion: 1,
      navigationRootId, nodes})).toThrow('BUILTIN_NAVIGATION_SOURCE_INVALID')
  })
})
