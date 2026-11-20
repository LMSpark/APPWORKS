param(
  [string[]]$Paths = @('packages', 'src', 'tests'),
  [switch]$SummaryOnly,
  [int]$Top = 50
)

$pattern = '模型值|\bmodelValue\b|update:modelValue|update:value|(?<!\.)\bvalue\b'
$commonArgs = @(
  '-n',
  '-P',
  '--no-heading',
  '--glob', '!**/dist/**',
  '--glob', '!**/target/**',
  '--glob', '!**/node_modules/**',
  '--glob', '!**/coverage/**'
)

$matches = & rg @commonArgs $pattern @Paths

if ($SummaryOnly) {
  $matches |
    ForEach-Object { ($_ -split ':', 3)[0] } |
    Group-Object |
    Sort-Object Count -Descending |
    Select-Object -First $Top |
    ForEach-Object { "{0}`t{1}" -f $_.Count, $_.Name }
  exit 0
}

$matches
