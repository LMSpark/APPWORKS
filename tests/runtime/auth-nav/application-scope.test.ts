import { describe, expect, it } from 'vitest'
import { buildApplicationPath, buildApplicationRootPath, parseApplicationPathScope, stripApplicationPath } from '@/services/application-scope'

describe('application path helpers', () => {
  const scope = { projectId: 'homepage' }

  it('parses /apps/{projectId} paths as application scoped paths', () => {
    expect(parseApplicationPathScope('/apps/homepage/app-list')).toEqual(scope)
    expect(parseApplicationPathScope('/apps/APP-1/dashboard')).toEqual({ projectId: 'APP-1' })
    expect(parseApplicationPathScope('/about')).toBeNull()
    expect(parseApplicationPathScope('/apps')).toBeNull()
    expect(parseApplicationPathScope('/t/acme/homepage/app-list')).toBeNull()
  })

  it('builds app paths and preserves already scoped paths', () => {
    expect(buildApplicationRootPath(scope)).toBe('/apps/homepage')
    expect(buildApplicationPath(scope, 'app-list')).toBe('/apps/homepage/app-list')
    expect(buildApplicationPath(scope, '/dev')).toBe('/apps/homepage/dev')
    expect(buildApplicationPath(scope, '/apps/APP-1/dashboard')).toBe('/apps/APP-1/dashboard')
    expect(buildApplicationPath(scope, '')).toBe('/apps/homepage/')
  })

  it('strips one application path segment', () => {
    expect(stripApplicationPath('/apps/homepage/app-list')).toBe('/app-list')
    expect(stripApplicationPath('/apps/homepage')).toBe('')
    expect(stripApplicationPath('/about')).toBe('/about')
  })
})
