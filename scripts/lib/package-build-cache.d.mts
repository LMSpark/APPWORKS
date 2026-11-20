export function computePackageInputFingerprint(
  pkgRoot: string,
  dependencyFingerprints?: Map<string, string>,
): string

export function readBuildStamp(pkgRoot: string): { fingerprint: string } | null

export function writeBuildStamp(pkgRoot: string, fingerprint: string): void

export function isPackageBuildFresh(pkgRoot: string, fingerprint: string): boolean
