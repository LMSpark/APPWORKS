<!--
@module app:components/ErrorFallback
职责：提供主应用 ErrorFallback 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 components/ErrorFallback。
-->
<template>
  <div class="error-fallback">
    <div class="error-content">
      <h1 class="error-icon">⚠️</h1>
      <h2 class="error-title">应用启动失败</h2>
      <p class="error-message">{{ error?.message || '未知错误' }}</p>
      <div class="error-actions">
        <button class="reload-button" @click="reload">
          重新加载
        </button>
        <button class="detail-button" @click="toggleDetails">
          {{ showDetails ? '隐藏' : '查看' }}详情
        </button>
      </div>
      <pre v-if="showDetails" class="error-stack">{{ error?.stack }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 错误回退组件 - 应用启动失败处理
 * 
 * @component ErrorFallback
 * @description
 * 应用级错误边界组件，当应用初始化或运行时发生致命错误时显示友好的错误界面。
 * 提供重新加载和查看详情功能，帮助用户和开发者快速定位问题。
 * 
 * 核心功能：
 * 1. **友好界面**：渐变背景 + 图标动画，降低用户焦虑
 * 2. **错误详情**：展示错误消息和堆栈，方便调试
 * 3. **快速恢复**：提供重载按钮，一键重启应用
 * 4. **信息切换**：可展开/折叠详细堆栈信息
 * 5. **响应式设计**：适配各种屏幕尺寸
 * 
 * @example
 * ```vue
 * <ErrorFallback
 *   :error="new Error('Failed to load configuration')"
 * />
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { ref } from 'vue'

/**
 * 组件属性定义
 */
defineProps<{
  /**
   * 错误对象
   * 包含错误消息（message）和堆栈信息（stack）
   * @default undefined
   * @example
   * new Error('Network timeout')
   */
  error?: Error
}>()

const showDetails = ref(false)

const reload = () => {
  location.reload()
}

const toggleDetails = () => {
  showDetails.value = !showDetails.value
}
</script>

<style scoped>
.error-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem;
}

.error-content {
  text-align: center;
  max-width: 600px;
  width: 100%;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.error-icon {
  font-size: 4rem;
  margin: 0 0 1rem 0;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.error-title {
  font-size: 1.75rem;
  margin: 0 0 1rem 0;
  font-weight: 600;
}

.error-message {
  opacity: 0.95;
  margin: 0 0 2rem 0;
  font-size: 1.1rem;
  line-height: 1.6;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 1rem;
}

.reload-button,
.detail-button {
  padding: 0.75rem 2rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.reload-button {
  background: white;
  color: #667eea;
}

.reload-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.detail-button {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.detail-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.error-stack {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.5rem;
  text-align: left;
  font-size: 0.875rem;
  line-height: 1.5;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
