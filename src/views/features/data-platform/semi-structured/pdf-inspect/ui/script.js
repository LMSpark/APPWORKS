/* global $page */
async function selectRule(row) {
  await $page.invokeHostCommand('pdf.catalog.select',row?.id)
}
