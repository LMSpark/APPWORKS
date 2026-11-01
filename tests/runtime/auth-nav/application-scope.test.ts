import { describe, expect, it } from 'vitest'
import {
  buildApplicationPath,
  buildApplicationRootPath,
  parseApplicationPathScope,
  stripApplicationPath,
} from '@/services/application-scope'

describe('application-scope helpers', () => {
  const scope = { projectId: 'homepage' }

  it('parses application scoped paths without a tenant segment', () => {
    expect(parseApplicationPathScope('/apps/homepage/dev')).toEqual(scope)
    expect(parseApplicationPathScope('/apps/homepage')).toEqual(scope)
    expect(parseApplicationPathScope('/about')).toBeNull()
    expect(parseApplicationPathScope('/apps')).toBeNull()
  })

  it('builds application paths and preserves already scoped paths', () => {
    expect(buildApplicationRootPath(scope)).toBe('/apps/homepage')
    expect(buildApplicationPath(scope, 'dev')).toBe('/apps/homepage/dev')
    expect(buildApplicationPath(scope, '/dev')).toBe('/apps/homepage/dev')
    expect(buildApplicationPath(scope, ' /dev ')).toBe('/apps/homepage/dev')
    expect(buildApplicationPath(scope, '/apps/analytics/dev')).toBe('/apps/analytics/dev')
    expect(buildApplicationPath(scope, '')).toBe('/apps/homepage/')
  })

  it('strips an application prefix and preserves the remaining route', () => {
    expect(stripApplicationPath('/apps/homepage/dev')).toBe('/dev')
    expect(stripApplicationPath('/apps/homepage')).toBe('')
    expect(stripApplicationPath('/about')).toBe('/about')
  })
})
