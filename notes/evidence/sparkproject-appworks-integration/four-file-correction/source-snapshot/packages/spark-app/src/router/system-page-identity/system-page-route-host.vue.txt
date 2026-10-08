<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { SystemPageIdentityResolver } from './system-page-identity-resolver'

const route = useRoute()
const router = useRouter()
const resolver = SystemPageIdentityResolver.forRouter(router)
const page = computed(() => {
  void resolver.revision.value
  return resolver.resolveComponent(route)
})
</script>

<template>
  <component
    v-if="page"
    :is="page"
  />
  <section v-else role="alert" class="system-page-identity-error">
    <h1>无法确定系统页面</h1>
    <p>{{ route.meta['systemPageIdentityError'] || '页面身份尚未验证。' }}</p>
    <p>请从导航菜单重新选择。</p>
  </section>
</template>

<style scoped>
.system-page-identity-error {
  min-height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0.75rem;
  padding: 2rem;
  color: #334155;
}
</style>
