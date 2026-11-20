export type ProjectPlanningHrArtifactFinding = Readonly<{
  level: 'pass' | 'warn' | 'fail' | 'info'
  check: string
  message: string
}>

export type ProjectPlanningHrArtifactReport = Readonly<{
  ok: boolean
  findings: readonly ProjectPlanningHrArtifactFinding[]
  summary: Readonly<{
    pass: number
    warn: number
    fail: number
    info: number
  }>
}>

export type ProjectPlanningHrArtifactAssertOptions = Readonly<{
  minChildren?: number
  minCoverageRatio?: number
  requireNavigationRoot?: boolean
}>

export declare const FORBIDDEN_PAGE_DESIGN_MARKERS: readonly string[]
export declare const HR_COVERAGE_MATRIX: readonly Readonly<{
  label: string
  pattern: RegExp
}>[]

export declare function assertProjectPlanningHrArtifact(
  artifact: unknown,
  options?: ProjectPlanningHrArtifactAssertOptions,
): ProjectPlanningHrArtifactReport

export declare function walkNavigationNodes(root: unknown): Array<Record<string, unknown>>
