export const DTS_MANIFEST_SCHEMA_VERSION: 1

export function readDtsManifestSnapshot(manifestPath: string): unknown

export function planIncrementalBundleBuild(command: Record<string, unknown>): Record<string, unknown>

export function canSkipDeclarationEmit(plan: unknown): boolean

export function resolveEmitSourcePathsForIncrementalPlan(command: Record<string, unknown>): string[]

export function augmentIncrementalPlanWithConfigDrift(
  plan: Record<string, unknown>,
  command: Record<string, unknown>,
): Record<string, unknown>

export function writeDtsManifestSnapshot(command: Record<string, unknown>): void

export function removeObsoleteBundleShards(command: Record<string, unknown>): void

export function finalizeBundleWithoutProjection(command: Record<string, unknown>): Record<string, unknown>
