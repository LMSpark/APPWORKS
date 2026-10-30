<!--
@module app:views/app/demo/Dashboard
职责：提供主应用 Dashboard 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/app/demo/Dashboard。
-->
<template>
  <div class="dashboard-page">
    <el-page-header content="管理仪表板" @back="$router.go(-1)">
      <template #icon>
        <span style="font-size: 20px">🏠</span>
      </template>
    </el-page-header>

    <div class="dashboard-content">
      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">👥</div>
              <div class="stats-info">
                <div class="stats-value">1,234</div>
                <div class="stats-label">用户总数</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">📊</div>
              <div class="stats-info">
                <div class="stats-value">567</div>
                <div class="stats-label">今日访问</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">🔥</div>
              <div class="stats-info">
                <div class="stats-value">89</div>
                <div class="stats-label">热门内容</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">💰</div>
              <div class="stats-info">
                <div class="stats-value">¥12,345</div>
                <div class="stats-label">今日收入</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 功能区域 -->
      <el-row :gutter="20" class="feature-row">
        <el-col :span="12">
          <el-card header="快捷操作">
            <div class="quick-actions">
              <el-button-group>
                <el-button type="primary" @click="goToConfigPage">
                  📝 配置页面演示
                </el-button>
                <el-button type="success" @click="goToVueComponent">
                  🎯 Vue 组件页面
                </el-button>
                <el-button type="warning" @click="goToSettings">
                  ⚙️ 系统设置
                </el-button>
              </el-button-group>
            </div>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card header="页面类型对比">
            <el-table :data="pageTypes" style="width: 100%">
              <el-table-column prop="type" label="页面类型" width="120" />
              <el-table-column prop="tech" label="技术实现" />
              <el-table-column prop="example" label="示例页面" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <!-- 提示信息 -->
      <el-alert 
        title="混合渲染模式" 
        type="info" 
        :closable="false"
        style="margin-top: 20px"
      >
        <template #default>
          <p>🎯 <strong>当前页面</strong>: Vue 组件页面 (传统开发模式)</p>
          <p>📊 <strong>配置页面</strong>: 通过 JSON 配置生成 (零代码模式)</p>
          <p>🔄 <strong>混合模式</strong>: 同时支持两种页面渲染方式</p>
        </template>
      </el-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 管理仪表盘，聚合展示关键业务指标、统计图表和快速操作入口；属于应用路由页，不允许作为 SparkNode 组件配置生成。
 */
/**
 * 管理仪表板页面 - Vue 组件页面示例
 * 
 * @component Dashboard
 * @description
 * 展示系统核心指标、快捷操作和页面类型对比的管理仪表板。
 * 这是一个纯 Vue 组件页面，演示了传统开发模式与 SPARK 配置驱动模式的对比。
 * 
 * 核心功能：
 * 1. **统计卡片**：显示用户总数、今日访问、热门内容、今日收入等关键指标
 * 2. **快捷操作**：提供快速导航到配置页面演示、Vue 组件页面、系统设置
 * 3. **类型对比**：展示 Vue 组件页面 vs 配置页面的技术实现差异
 * 4. **混合渲染说明**：解释系统支持的两种页面渲染模式
 * 5. **响应式布局**：基于 Element Plus 的栅格系统
 * 
 * @example
 * 路由配置：
 * ```typescript
 * {
 *   path: '/dashboard',
 *   component: Dashboard
 * }
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { ref } from 'vue'
import { useNav } from '@spark-appworks/spark-app'

const nav = useNav()

// 页面类型对比数据
const pageTypes = ref([
  {
    type: 'Vue 组件',
    tech: 'Vue SFC + TypeScript',
    example: '管理仪表板'
  },
  {
    type: '配置页面', 
    tech: 'JSON DSL + PageRenderer',
    example: '工作台'
  },
  {
    type: 'SPARK 组件',
    tech: 'SPARK 组件系统',
    example: '表格演示'
  }
])

// 快捷操作
const goToConfigPage = () => {
  nav?.navigateToPath('/')
}

const goToVueComponent = () => {
  nav?.navigateToPath('/about')
}

const goToSettings = () => {
  nav?.navigateToPath('/settings')
}
</script>

<style scoped>
.dashboard-page {
  padding: 24px;
}

.dashboard-content {
  margin-top: 24px;
}

.stats-row {
  margin-bottom: 24px;
}

.stats-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
}

.stats-card :deep(.el-card__body) {
  padding: 20px;
}

.stats-content {
  display: flex;
  align-items: center;
}

.stats-icon {
  font-size: 40px;
  margin-right: 16px;
}

.stats-value {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stats-label {
  font-size: 14px;
  opacity: 0.9;
}

.feature-row {
  margin-bottom: 24px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-actions .el-button-group {
  display: flex;
  flex-direction: column;
}

.quick-actions .el-button {
  margin-left: 0 !important;
  margin-bottom: 8px;
  justify-content: flex-start;
}
</style>
