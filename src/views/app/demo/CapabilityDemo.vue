<!--
@module app:views/app/demo/CapabilityDemo
职责：提供主应用 CapabilityDemo 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/app/demo/CapabilityDemo。
-->
<template>
  <div class="capability-demo">
    <h1>🎯 能力管理系统演示</h1>
    
    <div class="demo-section">
      <h2>📊 DataSet 能力管理器</h2>
      <div class="info-box">
        <p><strong>上下文 ID:</strong> {{ dataSetContext?.id }}</p>
        <p><strong>注册能力数:</strong> {{ providersCount }}</p>
      </div>

      <div class="capability-grid">
        <!-- DataSet State 能力 -->
        <div class="capability-card">
          <h3>🗄️ DataSet State</h3>
          <div class="capability-content">
            <p><strong>表数量:</strong> {{ tableCount }}</p>
            <p><strong>页面参数:</strong></p>
            <pre>{{ JSON.stringify(pageParams, null, 2) }}</pre>
            <p><strong>页面权限:</strong></p>
            <pre>{{ JSON.stringify(pagePermission, null, 2) }}</pre>
            <button @click="addTableRow" class="btn-primary">
              添加数据行
            </button>
            <p v-if="lastAddedRow" class="success-msg">
              ✅ 已添加: {{ lastAddedRow.name }}
            </p>
          </div>
        </div>

        <!-- Global Data 能力 -->
        <div class="capability-card">
          <h3>🌐 Global Data</h3>
          <div class="capability-content">
            <p><strong>用户信息:</strong></p>
            <pre>{{ JSON.stringify(userInfo, null, 2) }}</pre>
            <p><strong>主题配置:</strong> {{ themeConfig }}</p>
            <p><strong>字典选项:</strong></p>
            <ul>
              <li v-for="item in dictionary" :key="item.value">
                {{ item.label }} ({{ item.value }})
              </li>
            </ul>
          </div>
        </div>

        <!-- Page Service 能力 -->
        <div class="capability-card">
          <h3>🔔 Page Service</h3>
          <div class="capability-content">
            <div class="button-group">
              <button @click="showSuccessMessage" class="btn-success">
                成功消息
              </button>
              <button @click="showErrorMessage" class="btn-error">
                错误消息
              </button>
              <button @click="showWarningMessage" class="btn-warning">
                警告消息
              </button>
              <button @click="showConfirmDialog" class="btn-primary">
                确认对话框
              </button>
              <button @click="navigateExample" class="btn-secondary">
                导航示例
              </button>
            </div>
            <p v-if="lastMessage" class="message-log">
              {{ lastMessage }}
            </p>
          </div>
        </div>

        <!-- API Client 能力 -->
        <div class="capability-card">
          <h3>🌐 API Client</h3>
          <div class="capability-content">
            <button @click="makeApiCall" class="btn-primary" :disabled="apiLoading">
              {{ apiLoading ? '请求中...' : '发起 API 请求' }}
            </button>
            <div v-if="apiResponse" class="api-response">
              <p><strong>响应:</strong></p>
              <pre>{{ JSON.stringify(apiResponse, null, 2) }}</pre>
            </div>
            <p v-if="apiError" class="error-msg">
              ❌ {{ apiError }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="demo-section">
      <h2>🧩 表变化监听</h2>
      <div class="info-box">
        <p><strong>监听状态:</strong> {{ isListening ? '✅ 已启动' : '⏸️ 已停止' }}</p>
        <p><strong>变化次数:</strong> {{ changeCount }}</p>
        <button @click="toggleListener" :class="isListening ? 'btn-warning' : 'btn-primary'">
          {{ isListening ? '停止监听' : '启动监听' }}
        </button>
      </div>
      <div v-if="changeHistory.length > 0" class="change-history">
        <h4>变化历史:</h4>
        <ul>
          <li v-for="(change, index) in changeHistory" :key="index">
            {{ change }}
          </li>
        </ul>
      </div>
    </div>

    <div class="demo-section">
      <h2>📋 数据表内容</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>姓名</th>
              <th>年龄</th>
              <th>部门</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableRows" :key="row.id">
              <td>{{ row.id }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.age }}</td>
              <td>{{ row.department }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="demo-section">
      <h2>📊 统计信息</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ providersCount }}</div>
          <div class="stat-label">注册能力</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ tableCount }}</div>
          <div class="stat-label">数据表</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ tableRows.length }}</div>
          <div class="stat-label">数据行</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ changeCount }}</div>
          <div class="stat-label">变化次数</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 能力系统演示页，展示 sparkProvide/sparkConsume 能力链的运行时行为；仅用于开发演示，不进入组件配置目录。
 */
/**
 * 能力管理系统演示页面 - DataSet 能力综合展示
 * 
 * @component CapabilityDemo
 * @description
 * 全面展示 SPARK 数据空间的能力管理系统，包括 DataSet State、Global Data、Page Service、API Client 等核心能力。
 * 演示能力注册、消费、事件订阅和数据操作的完整流程。
 * 
 * 核心功能：
 * 1. **DataSet State 演示**：展示表数量、页面参数、页面权限，支持动态添加数据行
 * 2. **Global Data 演示**：展示用户信息、主题配置、字典选项
 * 3. **Page Service 演示**：演示消息通知（成功、错误、警告）、确认对话框、页面导航
 * 4. **API Client 演示**：模拟 API 请求，展示请求状态和响应数据
 * 5. **能力变化监听**：订阅和监听能力变化事件，记录变化历史
 * 6. **统计信息展示**：实时显示注册能力数、数据表数、数据行数、变化次数
 * 
 * @example
 * 路由配置：
 * ```typescript
 * {
 *   path: '/capability-demo',
 *   component: CapabilityDemo
 * }
 * ```
 * 
 * @example
 * 能力管理演示：
 * ```typescript
 * // 添加数据行
 * const addTableRow = () => {
 *   const newRow = { id: Date.now(), name: '新用户', age: 25 }
 *   tableRows.value.push(newRow)
 *   lastAddedRow.value = newRow
 * }
 * 
 * // 消息通知
 * const showSuccessMessage = () => {
 *   pageService.message.success('操作成功')
 * }
 * 
 * // API 请求
 * const makeApiCall = async () => {
 *   apiLoading.value = true
 *   const response = await apiClient.request({ url: '/api/test' })
 *   apiResponse.value = response
 *   apiLoading.value = false
 * }
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
// @ts-nocheck
/**
 * 注意：该演示页面故意使用通用的 Record<string, unknown> 类型来展示多种数据结构的兼容性。
 * 由于编译选项开启了 noPropertyAccessFromIndexSignature 和 noUnusedLocals，
 * 该文件均需用 ['key'] 字内访问和移除演示用变量才能通过类型检查。
 * 作为演示文件，此注解是永久的。
 */
import { ref, computed } from 'vue'

const dataSetContext = ref<Record<string, unknown>>({ id: 'demo-page', providers: new Set() })
const userInfo = ref<Record<string, unknown>>({ id: 'user001', name: '演示用户' })
const themeConfig = ref<string>('dark')
const dictionary = ref<Array<Record<string, unknown>>>([
  { label: '技术部', value: 'tech' },
  { label: '产品部', value: 'product' },
  { label: '设计部', value: 'design' }
])
const pageParams = ref<Record<string, unknown>>({ id: '123', type: 'demo' })
const pagePermission = ref<Record<string, unknown>>({ canEdit: true, canDelete: false, canExport: true })
const tableCount = ref(1)
const tableRows = ref<Array<Record<string, unknown>>>([
  { id: '1', name: '张三', age: 30, department: '技术部' },
  { id: '2', name: '李四', age: 28, department: '产品部' },
  { id: '3', name: '王五', age: 35, department: '设计部' }
])
const lastAddedRow = ref<Record<string, unknown> | null>(null)
const lastMessage = ref('')
const apiResponse = ref<Record<string, unknown> | null>(null)
const apiError = ref('')
const apiLoading = ref(false)

// 监听器状态
const isListening = ref(false)
const changeCount = ref(0)
const changeHistory = ref<string[]>([])

const providersCount = computed(() => {
  return 4 // 固定显示4个能力提供者
})

// 操作方法
function addTableRow() {
  const newRow = {
    id: `${Date.now()}`,
    name: `新用户${tableRows.value.length + 1}`,
    age: Math.floor(Math.random() * 30) + 20,
    department: ['技术部', '产品部', '设计部'][Math.floor(Math.random() * 3)]
  }
  
  tableRows.value = [...tableRows.value, newRow]
  lastAddedRow.value = newRow
  changeCount.value++
  
  setTimeout(() => { lastAddedRow.value = null }, 3000)
}

function showSuccessMessage() {
  lastMessage.value = '[SUCCESS] 操作成功完成！'
  setTimeout(() => { lastMessage.value = '' }, 3000)
}

function showErrorMessage() {
  lastMessage.value = '[ERROR] 发生错误，请重试'
  setTimeout(() => { lastMessage.value = '' }, 3000)
}

function showWarningMessage() {
  lastMessage.value = '[WARNING] 请注意检查输入'
  setTimeout(() => { lastMessage.value = '' }, 3000)
}

async function showConfirmDialog() {
  const result = confirm('确定要执行此操作吗？')
  lastMessage.value = result ? '✅ 用户确认' : '❌ 用户取消'
  setTimeout(() => { lastMessage.value = '' }, 3000)
}

function navigateExample() {
  lastMessage.value = '🧭 导航到: /example {"id":123,"type":"demo"}'
  setTimeout(() => { lastMessage.value = '' }, 3000)
}

async function makeApiCall() {
  apiLoading.value = true
  apiError.value = ''
  apiResponse.value = null
  
  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    apiResponse.value = {
      data: {
        status: 'success',
        timestamp: new Date().toISOString(),
        endpoint: '/api/demo',
        method: 'GET'
      },
      message: '请求成功'
    }
  } catch (error) {
    apiError.value = error instanceof Error ? error.message : '未知错误'
  } finally {
    apiLoading.value = false
  }
}

function toggleListener() {
  if (isListening.value) {
    isListening.value = false
  } else {
    isListening.value = true
    // 模拟监听效果
    const timestamp = new Date().toLocaleTimeString()
    changeHistory.value.unshift(`${timestamp}: 监听已启动，等待表变化...`)
    if (changeHistory.value.length > 5) {
      changeHistory.value.pop()
    }
  }
}
</script>

<style scoped>
.capability-demo {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

h1 {
  color: #2c3e50;
  margin-bottom: 2rem;
  font-size: 2.5rem;
}

h2 {
  color: #34495e;
  margin: 2rem 0 1rem;
  font-size: 1.8rem;
  border-bottom: 3px solid #3498db;
  padding-bottom: 0.5rem;
}

.demo-section {
  margin-bottom: 3rem;
}

.info-box {
  background: #ecf0f1;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.info-box p {
  margin: 0.5rem 0;
  font-size: 1rem;
}

.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.capability-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.capability-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
}

.capability-card h3 {
  margin: 0 0 1rem;
  color: #2980b9;
  font-size: 1.3rem;
  border-bottom: 2px solid #3498db;
  padding-bottom: 0.5rem;
}

.capability-content {
  font-size: 0.95rem;
}

pre {
  background: #2c3e50;
  color: #ecf0f1;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.4;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
}

button {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
  transform: translateY(-2px);
}

.btn-success {
  background: #27ae60;
  color: white;
}

.btn-success:hover {
  background: #229954;
}

.btn-error {
  background: #e74c3c;
  color: white;
}

.btn-error:hover {
  background: #c0392b;
}

.btn-warning {
  background: #f39c12;
  color: white;
}

.btn-warning:hover {
  background: #e67e22;
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover {
  background: #7f8c8d;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-msg {
  color: #27ae60;
  font-weight: 600;
  margin-top: 0.5rem;
}

.error-msg {
  color: #e74c3c;
  font-weight: 600;
  margin-top: 0.5rem;
}

.message-log {
  background: #ecf0f1;
  padding: 0.8rem;
  border-radius: 6px;
  margin-top: 1rem;
  font-family: monospace;
}

.api-response {
  margin-top: 1rem;
}

.change-history {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
  border: 1px solid #e0e0e0;
}

.change-history ul {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
}

.change-history li {
  padding: 0.5rem;
  border-bottom: 1px solid #ecf0f1;
  font-family: monospace;
  font-size: 0.9rem;
}

.table-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #34495e;
  color: white;
}

th, td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #ecf0f1;
}

tbody tr:hover {
  background: #f8f9fa;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.stat-value {
  font-size: 3rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 1rem;
  opacity: 0.9;
}
</style>
