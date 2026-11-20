export function listPackageDirs(packagesDir: string): string[]

export function sortPackagesByDependency(pkgDirs: string[], packagesDir: string): string[]

export function resolvePackagesInBuildOrder(
  packagesDir: string,
  onlyDirs?: string[] | null,
): string[]

export const PACKAGES_DIR_NAME: 'packages'
