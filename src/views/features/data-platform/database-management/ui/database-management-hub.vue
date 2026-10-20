<!--
@module app:views/features/data-platform/database-management/ui/database-management-hub
职责：数据库管理组合入口；/dbms 与蓝图 DataBaseManage 路径统一消费 features 页，不聚合 catalog 读链。
-->
<template>
  <section class="database-management-hub">
    <header class="database-management-hub__header">
      <h2>数据库管理</h2>
      <p>服务器注册与库表视图目录均经 spark-data（FormKey = 数据空间 ID）。</p>
    </header>
    <nav class="database-management-hub__tabs" role="tablist" aria-label="数据库管理分区">
      <button type="button" role="tab" :aria-selected="tab === 'server'" :class="{active: tab === 'server'}" @click="tab = 'server'">服务器</button>
      <button type="button" role="tab" :aria-selected="tab === 'catalog'" :class="{active: tab === 'catalog'}" @click="tab = 'catalog'">表和视图</button>
    </nav>
    <div class="database-management-hub__panel" role="tabpanel">
      <ServiceManagementPage v-if="tab === 'server'" />
      <TableAndViewPage v-else />
    </div>
  </section>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import ServiceManagementPage from './service-management-page.vue'
import TableAndViewPage from '../table-and-view/ui/table-and-view-page.vue'

const tab = ref<'server' | 'catalog'>('catalog')
</script>

<style scoped>
.database-management-hub { display: grid; gap: 0; min-height: 100%; background: var(--el-bg-color); }
.database-management-hub__header { padding: 16px 24px 0; }
.database-management-hub__header h2 { margin: 0 0 4px; font-size: 18px; }
.database-management-hub__header p { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }
.database-management-hub__tabs { display: flex; gap: 8px; padding: 12px 24px; border-bottom: 1px solid var(--el-border-color-lighter); }
.database-management-hub__tabs button {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  border-radius: 4px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 13px;
}
.database-management-hub__tabs button.active { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.database-management-hub__panel :deep(.database-server-page),
.database-management-hub__panel :deep(.table-and-view-page) { padding-top: 8px; }
.database-management-hub__panel :deep(h1) { display: none; }
</style>
