<!--
@module app:views/app/DBMS
职责：提供主应用 DBMS 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/app/DBMS。
-->
<template>
  <div class="dbms-page">
    <div class="dbms-header">
      <div class="header-info">
        <h2>数据库管理</h2>
        <span class="subtitle">lowcode 已注册服务器 → 数据库 → 表 → 字段（只读）</span>
      </div>
      <div class="header-actions">
        <el-button v-if="selectedServer" :icon="Refresh" :disabled="catalogMutationsDisabled" @click="openSyncCatalog">同步服务器</el-button>
        <el-button type="primary" :icon="Plus" :disabled="catalogMutationsDisabled" @click="openCreateServer">注册服务器</el-button>
      </div>
    </div>

    <div class="dbms-toolbar">
      <div class="location-bar">
        <span>对象资源管理器</span>
        <span v-if="selectedServer">{{ selectedServer.SERVER_NAME }}</span>
        <span v-if="selectedDatabase">{{ selectedDatabase.DATABASE_NAME }}</span>
        <span v-if="selectedTable">{{ selectedTable.physicalTableName || selectedTable.tableName }}</span>
      </div>
      <div class="toolbar-actions">
        <el-button v-if="selectedServer" size="small" :icon="Refresh" :disabled="catalogMutationsDisabled" @click="openSyncCatalog">同步服务器</el-button>
        <el-button v-if="selectedServer" size="small" :icon="Plus" :disabled="catalogMutationsDisabled" @click="openCreateDatabase">注册数据库</el-button>
        <el-button v-if="selectedDatabase" size="small" type="primary" :icon="Plus" :disabled="catalogMutationsDisabled" @click="openCreateTable">创建表</el-button>
      </div>
    </div>

    <div class="dbms-body">
      <aside class="object-explorer">
        <div class="pane-header">
          <div>
            <strong>对象资源管理器</strong>
            <span>{{ servers.length }} 个连接</span>
          </div>
        </div>
        <div class="tree-body">
          <div v-if="loading.servers" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
          <div v-else-if="!servers.length" class="empty">暂无服务器</div>
          <template v-else>
            <div v-for="srv in servers" :key="srv.ID" class="tree-group">
              <button
                type="button"
                :class="['tree-node', 'server-node', { active: selectedServer?.ID === srv.ID }]"
                @click="selectServer(srv)"
              >
                <span class="tree-expander">{{ selectedServer?.ID === srv.ID ? '▾' : '▸' }}</span>
                <el-icon><Connection /></el-icon>
                <span class="tree-label" :title="srv.SERVER_NAME">{{ srv.SERVER_NAME }}</span>
              </button>
              <div v-if="selectedServer?.ID === srv.ID" class="tree-children">
                <div class="tree-meta">{{ srv.HOST }}:{{ srv.PORT }} · {{ srv.DB_TYPE }}</div>
                <div v-if="loading.databases" class="tree-loading">加载数据库...</div>
                <div v-else-if="!databases.length" class="tree-empty">暂无数据库</div>
                <div v-for="treeDb in databases" :key="treeDb.ID">
                  <button
                    type="button"
                    :class="['tree-node', 'database-node', { active: selectedDatabase?.ID === treeDb.ID }]"
                    @click="selectDatabase(treeDb)"
                  >
                    <span class="tree-expander">{{ selectedDatabase?.ID === treeDb.ID ? '▾' : '▸' }}</span>
                    <el-icon><Coin /></el-icon>
                    <span class="tree-label" :title="treeDb.DATABASE_NAME">{{ treeDb.DATABASE_NAME }}</span>
                  </button>
                  <div v-if="selectedDatabase?.ID === treeDb.ID" class="tree-children tables-branch">
                    <button type="button" class="tree-node folder-node">
                      <span class="tree-expander">▾</span>
                      <el-icon><FolderOpened /></el-icon>
                      <span class="tree-label">Tables</span>
                      <span class="tree-count">{{ tableObjects.length }}</span>
                    </button>
                    <div v-if="loading.tables" class="tree-loading">加载数据表...</div>
                    <div v-else-if="!tableObjects.length" class="tree-empty">暂无数据表</div>
                    <template v-else>
                      <button
                        v-for="tbl in tableObjects"
                        :key="tbl.id"
                        type="button"
                        :class="['tree-node', 'table-node', { active: selectedTable?.id === tbl.id }]"
                        @click="selectTable(tbl)"
                      >
                        <span class="tree-expander"></span>
                        <el-icon><Grid /></el-icon>
                        <span class="tree-label" :title="tbl.physicalTableName || tbl.tableName">{{ tbl.physicalTableName || tbl.tableName }}</span>
                      </button>
                    </template>
                    <button type="button" class="tree-node folder-node">
                      <span class="tree-expander">▾</span>
                      <el-icon><FolderOpened /></el-icon>
                      <span class="tree-label">Views（后端未提供类型判别）</span>
                      <span class="tree-count">{{ viewObjects.length }}</span>
                    </button>
                    <div v-if="!loading.tables && !viewObjects.length" class="tree-empty">暂无视图</div>
                    <template v-else>
                      <button
                        v-for="view in viewObjects"
                        :key="view.id"
                        type="button"
                        :class="['tree-node', 'table-node', { active: selectedTable?.id === view.id }]"
                        @click="selectTable(view)"
                      >
                        <span class="tree-expander"></span>
                        <el-icon><Grid /></el-icon>
                        <span class="tree-label" :title="view.physicalTableName || view.tableName">{{ view.physicalTableName || view.tableName }}</span>
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </aside>

      <main class="workspace-main">
        <div class="workspace-tabs">
          <button
            type="button"
            :class="['workspace-tab', { active: activeWorkspaceTab === 'object' }]"
            @click="selectWorkspaceTab('object')"
          >对象</button>
          <button
            type="button"
            :class="['workspace-tab', { active: activeWorkspaceTab === 'structure' }]"
            @click="selectWorkspaceTab('structure')"
          >结构</button>
          <button
            type="button"
            :class="['workspace-tab', { active: activeWorkspaceTab === 'data' }]"
            @click="selectWorkspaceTab('data')"
          >数据</button>
          <button
            type="button"
            :class="['workspace-tab', { active: activeWorkspaceTab === 'sql' }]"
            @click="selectWorkspaceTab('sql')"
          >SQL</button>
        </div>
        <div class="workspace-header">
          <div class="workspace-title">
            <h3>{{ selectedObjectTitle }}</h3>
            <span>{{ selectedObjectPath }}</span>
          </div>
          <div class="workspace-stats">
            <span>{{ databases.length }} 数据库</span>
            <span>{{ tableObjects.length }} 表</span>
            <span>{{ viewObjects.length }} 视图</span>
          </div>
        </div>

        <div v-if="activeWorkspaceTab === 'object'" class="object-grid">
          <div v-if="!selectedServer" class="empty large-empty">请从左侧对象资源管理器选择服务器</div>
          <div v-else-if="!selectedDatabase" class="table-wrap">
            <div class="grid-title">
              <strong>数据库</strong>
              <div class="grid-actions">
                <el-button size="small" :icon="Refresh" :disabled="catalogMutationsDisabled" @click="openSyncCatalog">同步服务器</el-button>
                <el-button size="small" type="primary" :icon="Plus" :disabled="catalogMutationsDisabled" @click="openCreateDatabase">注册数据库</el-button>
              </div>
            </div>
            <div v-if="loading.databases" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
            <div v-else-if="!databases.length" class="empty">暂无数据库</div>
            <table v-else class="dbms-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>数据库类型</th>
                  <th>服务器</th>
                  <th>Schema</th>
                  <th class="operation-col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="db in databases"
                  :key="db.ID"
                  :class="dbRowClass(db)"
                  @click="selectDatabase(db)"
                >
                  <td class="object-name"><el-icon><Coin /></el-icon>{{ db.DATABASE_NAME }}</td>
                  <td>{{ db.DB_TYPE || '-' }}</td>
                  <td>{{ db.SERVER_NAME || '-' }}</td>
                  <td class="mono-cell">{{ db.SCHEMA_NAME || '-' }}</td>
                  <td class="operation-col">
                    <el-button size="small" text type="danger" :disabled="catalogMutationsDisabled" @click.stop="deleteDatabaseConfirm(db)">删除</el-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="table-wrap">
            <div class="grid-title">
              <strong>物理对象</strong>
              <div class="grid-actions">
                <el-button size="small" :icon="Refresh" :disabled="catalogMutationsDisabled" @click="openSyncCatalog">同步服务器</el-button>
                <el-button size="small" type="primary" :icon="Plus" :disabled="catalogMutationsDisabled" @click="openCreateTable">创建表</el-button>
              </div>
            </div>
            <div v-if="loading.tables" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
            <div v-else-if="!tables.length" class="empty">暂无物理对象</div>
            <table v-else class="dbms-table">
              <thead>
                <tr>
                  <th>物理表名</th>
                  <th>显示别名</th>
                  <th>类型</th>
                  <th>Schema</th>
                  <th>多租户字段</th>
                  <th>字段数</th>
                  <th class="operation-col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="tbl in tables"
                  :key="tbl.id"
                  :class="{ selected: selectedTable?.id === tbl.id }"
                  @click="selectTable(tbl)"
                >
                  <td class="object-name"><el-icon><Grid /></el-icon>{{ tbl.physicalTableName || tbl.tableName }}</td>
                  <td>{{ tbl.tableName }}</td>
                  <td><el-tag size="small" :type="tbl.objectType === 'VIEW' ? 'info' : 'primary'">{{ objectTypeLabel(tbl.objectType) }}</el-tag></td>
                  <td class="mono-cell">{{ tbl.schemaName || '-' }}</td>
                  <td>{{ tbl.multiTenancy === null ? '未知' : tbl.multiTenancy ? '启用' : '未启用' }}</td>
                  <td>{{ tableColumnCount(tbl) }}</td>
                  <td class="operation-col">
                    <el-button size="small" text @click.stop="viewTableRelation(tbl)">关系</el-button>
                    <el-button size="small" text type="danger" :disabled="catalogMutationsDisabled" @click.stop="deleteTableConfirm(tbl)">删除</el-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else-if="activeWorkspaceTab === 'structure'" class="structure-grid">
          <template v-if="selectedTable">
            <div class="structure-section">
              <div class="grid-title">
                <strong>物理列</strong>
                <el-tag v-if="selectedTable.objectType === 'VIEW'" size="small" type="info">只读视图</el-tag>
              </div>
              <table class="dbms-table structure-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>物理列名</th>
                    <th>显示别名</th>
                    <th>SQL 类型</th>
                    <th>可空</th>
                    <th>主键</th>
                    <th>自增</th>
                    <th>默认值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(col, index) in selectedTableColumns" :key="col.physicalColumnName || col.name">
                    <td>{{ col.ordinalPosition ?? index + 1 }}</td>
                    <td class="mono-cell">{{ col.physicalColumnName || col.name }}</td>
                    <td>{{ col.name }}</td>
                    <td class="mono-cell">{{ col.sqlType || col.type || '-' }}</td>
                    <td>{{ col.nullable === false || col.required ? '否' : '是' }}</td>
                    <td>{{ col.primaryKey ? '是' : '-' }}</td>
                    <td>{{ col.autoIncrement ? '是' : '-' }}</td>
                    <td class="mono-cell">{{ col.defaultValue ?? '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="structure-section">
              <div class="grid-title">
                <strong>关系</strong>
                <span class="section-count">{{ selectedTableRelations.length }} 条</span>
              </div>
              <div v-if="!selectedTableRelations.length" class="empty">lowcode 当前公开接口未返回物理外键关系；不以数据模型关系冒充物理关系</div>
              <table v-else class="dbms-table relation-structure-table">
                <thead>
                  <tr>
                    <th>关系名</th>
                    <th>父物理表</th>
                    <th>父物理列</th>
                    <th>子物理表</th>
                    <th>子物理列</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="rel in selectedTableRelations" :key="rel.ID">
                    <td>{{ rel.RELATION_NAME || '-' }}</td>
                    <td class="mono-cell">{{ relationTableLabel(rel, 'parent') }}</td>
                    <td class="mono-cell">{{ rel.PARENT_FIELD }}</td>
                    <td class="mono-cell">{{ relationTableLabel(rel, 'child') }}</td>
                    <td class="mono-cell">{{ rel.CHILD_FIELD }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <div v-else class="structure-overview">
            <div class="overview-item">
              <span>当前服务器</span>
              <strong>{{ selectedServer?.SERVER_NAME ?? '未选择' }}</strong>
            </div>
            <div class="overview-item">
              <span>当前数据库</span>
              <strong>{{ selectedDatabase?.DATABASE_NAME ?? '未选择' }}</strong>
            </div>
            <div class="overview-item">
              <span>物理对象</span>
              <strong>{{ tables.length }} 个</strong>
            </div>
            <div class="overview-item">
              <span>表 / 视图</span>
              <strong>{{ tableObjects.length }} / {{ viewObjects.length }}</strong>
            </div>
            <div class="overview-item">
              <span>关系</span>
              <strong>{{ relations.length }} 条</strong>
            </div>
          </div>
        </div>
        <div v-else-if="activeWorkspaceTab === 'data'" class="data-grid">
          <div v-if="!selectedTable" class="empty large-empty">请选择表或视图浏览数据</div>
            <div v-else class="data-section">
            <div class="grid-title">
              <strong>数据浏览</strong>
              <div class="grid-actions">
                <span class="section-count">需要数据空间 + 唯一 modelId + 后端权限响应</span>
                <el-button size="small" :icon="Refresh" disabled>刷新</el-button>
              </div>
            </div>
            <div v-if="loading.data" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
            <div v-else-if="!objectData?.rows.length" class="empty">物理表身份不足以读取业务数据；请从绑定真实 FormKey 和唯一 modelId 的运行页面进入</div>
            <div v-else class="data-table-scroll">
              <table class="dbms-table data-table">
                <thead>
                  <tr>
                    <th v-for="col in objectData.columns" :key="col.physicalColumnName || col.name">
                      <span class="mono-cell">{{ col.physicalColumnName || col.name }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in objectData.rows" :key="rowIndex">
                    <td v-for="col in objectData.columns" :key="col.physicalColumnName || col.name" class="mono-cell">
                      {{ dataCellValue(row, col) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="selectedTable" class="data-pager">
              <el-button size="small" :disabled="dataPage <= 1 || loading.data" @click="changeDataPage(dataPage - 1)">上一页</el-button>
              <span>第 {{ dataPage }} 页 / {{ dataPageCount }} 页</span>
              <el-button size="small" :disabled="dataPage >= dataPageCount || loading.data" @click="changeDataPage(dataPage + 1)">下一页</el-button>
            </div>
          </div>
        </div>
        <div v-else class="sql-grid">
            <div v-if="!selectedTable" class="empty large-empty">请选择表查看 SQL 能力状态</div>
          <div v-else-if="loading.sql" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
          <template v-else>
            <div class="sql-section">
              <div class="grid-title">
                <strong>DDL</strong>
                <el-tag size="small" type="info">{{ objectSql?.dialect || 'UNKNOWN' }}</el-tag>
              </div>
              <pre class="sql-code">{{ objectSql?.ddl || 'lowcode 当前公开接口未提供只读 DDL，前端不根据字段元数据伪造 SQL。' }}</pre>
            </div>
            <div class="sql-section">
              <div class="grid-title">
                <strong>关系 SQL</strong>
                <el-tag size="small" type="info">只读</el-tag>
              </div>
              <pre class="sql-code">{{ objectSql?.relationSql || 'lowcode 当前公开接口未提供物理外键 SQL。' }}</pre>
            </div>
          </template>
        </div>
      </main>

      <aside class="property-pane">
        <div class="pane-header">
          <div>
            <strong>属性</strong>
            <span>{{ selectedObjectTitle }}</span>
          </div>
        </div>
        <dl class="property-list">
          <template v-if="selectedTable">
            <dt>对象类型</dt><dd>{{ objectTypeLabel(selectedTable.objectType) }}</dd>
            <dt>物理表名</dt><dd>{{ selectedTable.physicalTableName || '-' }}</dd>
            <dt>显示别名</dt><dd>{{ selectedTable.tableName }}</dd>
            <dt>Schema</dt><dd>{{ selectedTable.schemaName || '-' }}</dd>
            <dt>多租户字段</dt><dd>{{ selectedTable.multiTenancy === null ? '未知' : selectedTable.multiTenancy ? '启用' : '未启用' }}</dd>
            <dt>字段数量</dt><dd>{{ tableColumnCount(selectedTable) }}</dd>
            <template v-for="col in selectedTableColumns" :key="col.physicalColumnName || col.name">
              <dt>列</dt><dd class="mono-cell">{{ col.physicalColumnName || col.name }}</dd>
            </template>
          </template>
          <template v-else-if="selectedDatabase">
            <dt>对象类型</dt><dd>数据库</dd>
            <dt>数据库名</dt><dd>{{ selectedDatabase.DATABASE_NAME }}</dd>
            <dt>数据库类型</dt><dd>{{ selectedDatabase.DB_TYPE || '-' }}</dd>
            <dt>Schema</dt><dd>{{ selectedDatabase.SCHEMA_NAME || '-' }}</dd>
            <dt>数据表</dt><dd>{{ tableObjects.length }} 张</dd>
            <dt>视图</dt><dd>{{ viewObjects.length }} 个</dd>
          </template>
          <template v-else-if="selectedServer">
            <dt>对象类型</dt><dd>服务器</dd>
            <dt>名称</dt><dd>{{ selectedServer.SERVER_NAME }}</dd>
            <dt>地址</dt><dd>{{ selectedServer.HOST }}:{{ selectedServer.PORT }}</dd>
            <dt>类型</dt><dd>{{ selectedServer.DB_TYPE }}</dd>
            <dt>说明</dt><dd>{{ selectedServer.DESCRIPTION || '-' }}</dd>
          </template>
          <template v-else>
            <dt>服务器</dt><dd>{{ servers.length }} 个</dd>
            <dt>当前租户</dt><dd>{{ currentTenant }}</dd>
            <dt>当前项目</dt><dd>{{ currentProject }}</dd>
          </template>
        </dl>
        <div class="property-actions">
          <el-button v-if="selectedServer" size="small" @click="testServerConnection(selectedServer)">测试连接</el-button>
          <el-button v-if="selectedServer" size="small" :disabled="catalogMutationsDisabled" @click="openSyncCatalog">同步服务器</el-button>
          <el-button v-if="selectedTable" size="small" @click="viewTableRelation(selectedTable)">表关系</el-button>
          <el-button v-if="selectedDatabase" size="small" type="primary" :disabled="catalogMutationsDisabled" @click="openCreateTable">创建表</el-button>
        </div>
      </aside>
    </div>

    <!-- 注册服务器 Dialog -->
    <el-dialog v-model="dlgServer.visible" title="注册数据库服务器" width="540px" @closed="resetServerForm">
      <el-form :model="dlgServer.form" label-width="100px">
        <el-form-item label="服务器名称"><el-input v-model="dlgServer.form.serverName" placeholder="如：生产主库" /></el-form-item>
        <el-form-item label="主机地址"><el-input v-model="dlgServer.form.host" placeholder="192.168.1.10" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="dlgServer.form.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item label="数据库类型">
          <el-select v-model="dlgServer.form.dbType"><el-option label="MySQL" value="mysql" /><el-option label="PostgreSQL" value="postgresql" /></el-select>
        </el-form-item>
        <el-form-item label="用户名"><el-input v-model="dlgServer.form.username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="dlgServer.form.password" type="password" show-password /></el-form-item>
        <el-form-item label="隔离模式" v-if="isPlatformAdmin">
          <el-radio-group v-model="dlgServer.form.isolationMode">
            <el-radio v-for="option in isolationModeOptions" :key="option.value" :value="option.value">{{ option.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="归属租户" v-if="dlgServer.form.isolationMode !== 'TENANT_SHARED'">
          {{ currentTenant }}（自动）
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgServer.visible = false">取消</el-button>
        <el-button @click="testNewConnection" :loading="testingNew">测试连接</el-button>
        <el-button type="primary" :disabled="catalogMutationsDisabled" @click="submitCreateServer" :loading="dlgServer.loading">注册</el-button>
      </template>
    </el-dialog>

    <!-- 注册数据库 Dialog -->
    <el-dialog v-model="dlgDb.visible" title="注册数据库" width="500px" @closed="resetDbForm">
      <el-form :model="dlgDb.form" label-width="100px">
        <el-form-item label="服务器">{{ selectedServer?.SERVER_NAME }} ({{ selectedServer?.HOST }}:{{ selectedServer?.PORT }})</el-form-item>
        <el-form-item label="操作">
          <el-radio-group v-model="dlgDb.form.createNew" @change="onDatabaseOperationChange">
            <el-radio :value="false">连接已有</el-radio>
            <el-radio :value="true">新建数据库</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="dlgDb.form.createNew ? '数据库名' : '选择数据库'">
          <el-input v-if="dlgDb.form.createNew" v-model="dlgDb.form.databaseName" placeholder="如：spark_crm" />
          <div v-else class="database-picker">
            <el-select
              v-model="dlgDb.form.databaseName"
              filterable
              clearable
              placeholder="请选择已有数据库"
              no-data-text="暂无可选择数据库"
              loading-text="加载数据库..."
              :loading="physicalDatabasesLoading"
              @visible-change="onDatabasePickerVisibleChange"
            >
              <el-option
                v-for="option in physicalDatabaseOptions"
                :key="option.name"
                :label="option.registered ? `${option.name}（已注册）` : option.name"
                :value="option.name"
                :disabled="option.registered"
              />
            </el-select>
            <el-button
              :icon="Refresh"
              :loading="physicalDatabasesLoading"
              aria-label="刷新数据库列表"
              @click="loadPhysicalDatabases"
            />
          </div>
        </el-form-item>
        <el-form-item label="隔离模式">
          <el-radio-group v-model="dlgDb.form.isolationMode">
            <el-radio v-for="option in databaseIsolationOptions" :key="option.value" :value="option.value">{{ option.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="连接模式">
          <el-radio-group v-model="dlgDb.form.connectionMode">
            <el-radio value="DIRECT">直连</el-radio>
            <el-radio value="JNDI_XA">JNDI XA</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="JNDI 名称" v-if="dlgDb.form.connectionMode === 'JNDI_XA'">
          <el-input v-model="dlgDb.form.jndiName" placeholder="java:/jdbc/SparkOrdersXa" />
        </el-form-item>
        <template v-if="dlgDb.form.createNew">
          <el-form-item label="字符集"><el-input v-model="dlgDb.form.charset" placeholder="utf8mb4" /></el-form-item>
          <el-form-item label="排序规则"><el-input v-model="dlgDb.form.collation" placeholder="utf8mb4_unicode_ci" /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dlgDb.visible = false">取消</el-button>
        <el-button type="primary" :disabled="catalogMutationsDisabled" @click="submitCreateDatabase" :loading="dlgDb.loading">注册</el-button>
      </template>
    </el-dialog>

    <!-- 同步服务器 Dialog -->
    <el-dialog v-model="dlgSync.visible" title="同步服务器 Catalog" width="820px" class="sync-dialog">
      <div class="sync-summary">
        <span>{{ selectedServer?.SERVER_NAME || '未选择服务器' }}</span>
        <span>{{ catalogDatabases.length }} 个物理库</span>
        <span>{{ catalogObjectCount }} 个对象</span>
        <span>{{ catalogRelationCount }} 条外键</span>
      </div>
      <div v-if="dlgSync.loading" class="loading"><el-icon class="is-loading"><Loading /></el-icon></div>
      <div v-else-if="!dlgSync.catalog" class="empty">尚未读取 catalog</div>
      <div v-else class="catalog-preview">
        <div v-for="db in catalogDatabases" :key="db.databaseName" class="catalog-db">
          <div class="catalog-db-title">
            <strong>{{ db.databaseName }}</strong>
            <el-tag size="small" :type="db.registered ? 'success' : 'info'">{{ db.registered ? '已注册' : '未注册' }}</el-tag>
          </div>
          <div v-for="schema in db.schemas" :key="schema.schemaName || '__default__'" class="catalog-schema">
            <div class="catalog-schema-title">{{ schema.schemaName || '(default schema)' }}</div>
            <div class="catalog-objects">
              <div
                v-for="obj in schemaObjects(schema)"
                :key="`${obj.objectType}:${obj.schemaName || ''}:${obj.physicalName}`"
                class="catalog-object-row"
              >
                <div>
                  <span class="mono-cell">{{ obj.physicalName }}</span>
                  <el-tag size="small" :type="obj.objectType === 'VIEW' ? 'info' : 'primary'">{{ objectTypeLabel(obj.objectType) }}</el-tag>
                  <el-tag v-if="obj.registered" size="small" type="success">已注册</el-tag>
                </div>
                <div class="catalog-object-meta">
                  <span>{{ obj.columns.length }} 列</span>
                  <el-checkbox
                    v-if="obj.objectType === 'TABLE' && obj.physicalObjectKey.databaseId"
                    :model-value="isMutateSelected(obj)"
                    @change="toggleMutateObject(obj)"
                  >
                    托管结构
                  </el-checkbox>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dlgSync.visible = false">关闭</el-button>
        <el-button @click="loadServerCatalog" :loading="dlgSync.loading">重新扫描</el-button>
        <el-button type="primary" :disabled="catalogMutationsDisabled" @click="submitSyncServer" :loading="dlgSync.syncing">同步元数据</el-button>
      </template>
    </el-dialog>

    <!-- 创建表 Dialog -->
    <el-dialog v-model="dlgTable.visible" title="创建数据表" width="600px" @closed="resetTableForm">
      <el-form :model="dlgTable.form" label-width="120px">
        <el-form-item label="逻辑表名"><el-input v-model="dlgTable.form.tableName" placeholder="如：CustomerOrders" /></el-form-item>
        <el-form-item label="物理表名（可选）"><el-input v-model="dlgTable.form.physicalTableName" placeholder="留空自动生成" /></el-form-item>
        <el-form-item label="隔离模式">
          <el-radio-group v-model="dlgTable.form.isolationMode">
            <el-radio v-for="option in tableIsolationOptions" :key="option.value" :value="option.value">{{ option.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="字段列表">
          <div v-for="(col, idx) in dlgTable.form.columns" :key="idx" class="column-row">
            <el-input v-model="col.name" placeholder="字段名" size="small" style="width: 140px" />
            <el-select v-model="col.type" size="small" style="width: 100px">
              <el-option label="String" value="string" /><el-option label="Integer" value="integer" />
              <el-option label="Number" value="number" /><el-option label="Boolean" value="boolean" />
              <el-option label="Date" value="date" /><el-option label="DateTime" value="datetime" />
              <el-option label="Text" value="text" />
            </el-select>
            <el-input-number v-model="col.maxLength" :min="0" :max="65535" size="small" placeholder="长度" style="width: 100px" />
            <el-checkbox v-model="col.primaryKey" size="small">PK</el-checkbox>
            <el-checkbox v-model="col.required" size="small">必填</el-checkbox>
            <el-button size="small" type="danger" :icon="Delete" circle @click="dlgTable.form.columns.splice(idx, 1)" />
          </div>
          <el-button size="small" @click="addColumn">+ 添加字段</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgTable.visible = false">取消</el-button>
        <el-button type="primary" :disabled="catalogMutationsDisabled" @click="submitCreateTable" :loading="dlgTable.loading">创建</el-button>
      </template>
    </el-dialog>

    <!-- 表关系 Dialog -->
    <el-dialog v-model="dlgRelation.visible" title="表关系管理" width="650px" @closed="resetRelationForm">
      <div class="relation-db-hint">数据库: {{ selectedDatabase?.DATABASE_NAME }}</div>
      <div class="relation-list" v-if="relations.length">
        <div v-for="rel in relations" :key="rel.ID" class="relation-row">
          <span class="rel-name">{{ rel.RELATION_NAME }}</span>
          <span class="rel-arrow">{{ rel.parentPhysicalTableName || rel.parentTableName }}.{{ rel.PARENT_FIELD }} → {{ rel.childPhysicalTableName || rel.childTableName }}.{{ rel.CHILD_FIELD }}</span>
          <el-button size="small" type="danger" text :disabled="catalogMutationsDisabled" @click="deleteResourceRelation(rel.ID)">删除</el-button>
        </div>
      </div>
      <div v-else class="empty">暂无表关系</div>
      <el-divider />
      <div class="relation-form">
        <div class="rel-form-title">添加关系</div>
        <div class="rel-form-row">
          <el-select v-model="dlgRelation.form.parentTableId" placeholder="父表" size="small" style="width: 160px" @change="onParentTableChange">
            <el-option v-for="tbl in tableObjects" :key="tbl.id" :label="tbl.physicalTableName || tbl.tableName" :value="tbl.id" />
          </el-select>
          <span>.</span>
          <el-select v-model="dlgRelation.form.parentField" placeholder="字段" size="small" style="width: 140px">
            <el-option v-for="col in parentColumns" :key="col.physicalColumnName || col.name" :label="col.physicalColumnName || col.name" :value="col.physicalColumnName || col.name" />
          </el-select>
          <span style="margin: 0 6px">→</span>
          <el-select v-model="dlgRelation.form.childTableId" placeholder="子表" size="small" style="width: 160px" @change="onChildTableChange">
            <el-option v-for="tbl in tableObjects" :key="tbl.id" :label="tbl.physicalTableName || tbl.tableName" :value="tbl.id" />
          </el-select>
          <span>.</span>
          <el-select v-model="dlgRelation.form.childField" placeholder="字段" size="small" style="width: 140px">
            <el-option v-for="col in childColumns" :key="col.physicalColumnName || col.name" :label="col.physicalColumnName || col.name" :value="col.physicalColumnName || col.name" />
          </el-select>
          <el-button size="small" type="primary" :disabled="catalogMutationsDisabled" @click="submitCreateRelation">创建</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="dlgRelation.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, Loading, Delete, Connection, Coin, FolderOpened, Grid, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { isRecord } from '@spark-appworks/spark-utils'
import type { LowcodeDatabaseCatalog, LowcodeProjectBlueprintRecord } from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi, lowcodeHttp as http, readLowcodePrincipal } from '@/lowcode/lowcode-runtime'
import { parseTenantScope } from '@/services/tenant-scope'

type DbmsServer = {
  ID: string
  SERVER_NAME: string
  HOST: string
  PORT: string
  DB_TYPE: string
  DESCRIPTION: string
  ISOLATION_MODE?: IsolationMode}

type DbmsDatabase = {
  ID: string
  SERVER_ID: string
  DATABASE_NAME: string
  DB_TYPE: string
  SERVER_NAME: string
  SCHEMA_NAME: string
  STATE: number | null
  REMARK: string
  ISOLATION_MODE?: IsolationMode
  CONNECTION_MODE?: 'DIRECT' | 'JNDI_XA'
  JNDI_NAME?: string | null
  canonicalDatabaseId?: number
  duplicateDatabaseIds?: number[]}

type DbmsColumn = {
  name: string
  physicalColumnName?: string
  type?: string
  sqlType?: string
  maxLength?: number | null
  primaryKey?: boolean
  autoIncrement?: boolean
  nullable?: boolean
  required?: boolean
  defaultValue?: string | null
  ordinalPosition?: number}

type DbmsObjectType = 'TABLE' | 'VIEW'

type PhysicalObjectKey = {
  databaseId: string | null
  objectType: DbmsObjectType
  schemaName: string | null
  physicalName: string}

type DbmsTable = {
  id: string
  tableName: string
  objectType?: DbmsObjectType
  schemaName?: string | null
  physicalTableName?: string
  physicalName?: string
  isolationMode?: IsolationMode
  multiTenancy: boolean | null
  columnCount?: number
  physicalObjectKey?: PhysicalObjectKey
  columns?: DbmsColumn[]}

type DbmsRelation = {
  ID: string
  RELATION_NAME: string
  PARENT_TABLE_ID?: string
  CHILD_TABLE_ID?: string
  parentTableName: string
  parentPhysicalTableName?: string
  parentSchemaName?: string | null
  PARENT_FIELD: string
  childTableName: string
  childPhysicalTableName?: string
  childSchemaName?: string | null
  CHILD_FIELD: string}

type DbmsObjectSql = {
  objectId: string
  objectType: DbmsObjectType
  dialect: string
  ddl: string
  relationSql: string
  readOnly: boolean}

type DbmsObjectData = {
  objectId: string
  objectType: DbmsObjectType
  dialect: string
  columns: DbmsColumn[]
  rows: Array<Record<string, unknown>>
  page: number
  pageSize: number
  total: number
  readOnly: boolean}

type DbmsCatalogObject = {
  databaseId: string | null
  objectId: string | null
  objectType: DbmsObjectType
  schemaName: string | null
  physicalName: string
  logicalName?: string | null
  registered: boolean
  readOnly: boolean
  columns: DbmsColumn[]
  physicalObjectKey: PhysicalObjectKey}

type DbmsCatalogSchema = {
  schemaName: string | null
  tables: DbmsCatalogObject[]
  views: DbmsCatalogObject[]}

type DbmsCatalogDatabase = {
  databaseName: string
  databaseId: string | null
  registered: boolean
  schemas: DbmsCatalogSchema[]
  relations: unknown[]}

type DbmsCatalog = {
  serverId: string
  serverName: string
  databases: DbmsCatalogDatabase[]}

type IsolationMode = 'TENANT_SHARED' | 'TENANT_ISOLATED' | 'PROJECT_SHARED' | 'PROJECT_ISOLATED'
type WorkspaceTab = 'object' | 'structure' | 'data' | 'sql'

const isolationModeOptions: Array<{ value: IsolationMode; label: string }> = [
  { value: 'TENANT_SHARED', label: '租户共享' },
  { value: 'TENANT_ISOLATED', label: '租户隔离' },
  { value: 'PROJECT_SHARED', label: '工程共享' },
  { value: 'PROJECT_ISOLATED', label: '工程隔离' },
]

const isolationModeRanks: Record<IsolationMode, number> = {
  TENANT_SHARED: 0,
  TENANT_ISOLATED: 1,
  PROJECT_SHARED: 2,
  PROJECT_ISOLATED: 3,
}

function isIsolationMode(value: string): value is IsolationMode {
  return value === 'TENANT_SHARED'
    || value === 'TENANT_ISOLATED'
    || value === 'PROJECT_SHARED'
    || value === 'PROJECT_ISOLATED'
}

function isolationRank(mode: string | undefined): number | null {
  if (!mode || !isIsolationMode(mode)) return null
  return isolationModeRanks[mode]
}

function childIsolationOptions(parentMode: string | undefined) {
  const parentRank = isolationRank(parentMode)
  if (parentRank === null) return []
  return isolationModeOptions.filter((option) => isolationModeRanks[option.value] >= parentRank)
}

const databaseIsolationOptions = computed(() => childIsolationOptions(selectedServer.value?.ISOLATION_MODE))
const tableIsolationOptions = computed(() => childIsolationOptions(selectedDatabase.value?.ISOLATION_MODE))

// ── 当前上下文 ──
const route = useRoute()
const catalogMutationsDisabled = true
const principal = computed(() => readLowcodePrincipal())
const isPlatformAdmin = computed(() => principal.value?.roles.includes('SUPER_ADMIN') === true)
const currentTenant = computed(() => {
  const scoped = parseTenantScope(route.path)
  if (scoped) return scoped.tenantId
  if (!principal.value?.enterpriseName) throw new Error('缺少企业身份，无法加载 DBMS')
  return principal.value.enterpriseName
})
const currentProject = computed(() => {
  const scoped = parseTenantScope(route.path)
  if (scoped) return scoped.projectId
  if (!principal.value?.applicationId) throw new Error('缺少应用身份，无法加载 DBMS')
  return principal.value.applicationId
})

const governanceBlockedMessage = 'lowcode mutation 尚无写前镜像、幂等、短事务、journal、readback 与补偿合同，当前只读'

function reportGovernanceBlocked(): void {
  ElMessage.warning(governanceBlockedMessage)
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  if (isRecord(error)) {
    const response = error['response']
    if (isRecord(response)) {
      const message = response['error'] ?? response['message']
      if (typeof message === 'string' && message.trim().length > 0) return message
    }
  }
  return String(error)
}

const databaseCatalogNavigationTitles = new Set(['数据库管理', '数据资源管理', '结构化配置'])

function collectDatabaseCatalogScenarioIds(records: readonly LowcodeProjectBlueprintRecord[]): readonly string[] {
  const result = new Set<string>()
  for (const record of records) {
    const scenarioId = record.dataSpace?.scenarioId
    const navigation = record.navigation
    const target = navigation?.target?.toLowerCase() ?? ''
    if (scenarioId && (databaseCatalogNavigationTitles.has(navigation?.title ?? record.capability.name)
      || target.includes('databasecodelist'))) result.add(scenarioId)
  }
  return [...result]
}

async function resolveDatabaseCatalogScenarioIds(): Promise<readonly string[]> {
  const application = lowcodeApi.application.get()
  if (application === null) throw new Error('缺少 lowcode 应用上下文，无法定位数据库管理数据空间')
  const records = await lowcodeApi.blueprint.readRecords(application.application.id)
  const scenarioIds = collectDatabaseCatalogScenarioIds(records)
  if (scenarioIds.length === 0) throw new Error('当前应用蓝图没有绑定数据库目录场景，不能读取系统元数据')
  return scenarioIds
}

// ── 状态 ──
const loading = reactive({ servers: false, databases: false, tables: false, data: false, sql: false })
const testingNew = ref(false)

const catalogSnapshot = ref<LowcodeDatabaseCatalog | null>(null)
const servers = ref<DbmsServer[]>([])
const databases = ref<DbmsDatabase[]>([])
const tables = ref<DbmsTable[]>([])
const relations = ref<DbmsRelation[]>([])
const physicalDatabaseNames = ref<string[]>([])
const physicalDatabasesLoading = ref(false)

type SyncDialogState = {
  visible: boolean
  loading: boolean
  syncing: boolean
  catalog: DbmsCatalog | null}

const dlgSync = reactive<SyncDialogState>({
  visible: false,
  loading: false,
  syncing: false,
  catalog: null,
})

const selectedServer = ref<DbmsServer | null>(null)
const selectedDatabase = ref<DbmsDatabase | null>(null)
const selectedTable = ref<DbmsTable | null>(null)
const selectedTableColumns = ref<DbmsColumn[]>([])
const activeWorkspaceTab = ref<WorkspaceTab>('object')
const objectSql = ref<DbmsObjectSql | null>(null)
const objectData = ref<DbmsObjectData | null>(null)
const dataPage = ref(1)
const dataPageSize = ref(50)

const registeredDatabaseNames = computed(() => new Set(
  databases.value.map((db) => db.DATABASE_NAME.toLowerCase())
))
const physicalDatabaseOptions = computed(() => physicalDatabaseNames.value.map((name) => ({
  name,
  registered: registeredDatabaseNames.value.has(name.toLowerCase()),
})))
const tableObjects = computed(() => tables.value.filter((tbl) => (tbl.objectType ?? 'TABLE') === 'TABLE'))
const viewObjects = computed(() => tables.value.filter((tbl) => tbl.objectType === 'VIEW'))
const selectedTableRelations = computed(() => {
  const tableId = selectedTable.value?.id
  if (!tableId) return []
  return relations.value.filter((rel) => relationTableId(rel, 'parent') === tableId || relationTableId(rel, 'child') === tableId)
})
const dataPageCount = computed(() => {
  const total = objectData.value?.total ?? 0
  return Math.max(Math.ceil(total / dataPageSize.value), 1)
})
const catalogDatabases = computed(() => dlgSync.catalog?.databases ?? [])
const catalogObjectCount = computed(() => catalogDatabases.value.reduce((total, db) => (
  total + db.schemas.reduce((schemaTotal, schema) => schemaTotal + schema.tables.length + schema.views.length, 0)
), 0))
const catalogRelationCount = computed(() => catalogDatabases.value.reduce((total, db) => total + db.relations.length, 0))

const selectedObjectTitle = computed(() => (
  selectedTable.value?.physicalTableName
  ?? selectedTable.value?.tableName
  ?? selectedDatabase.value?.DATABASE_NAME
  ?? selectedServer.value?.SERVER_NAME
  ?? '连接概览'
))

const selectedObjectPath = computed(() => {
  const parts = [
    selectedServer.value?.SERVER_NAME,
    selectedDatabase.value?.DATABASE_NAME,
    selectedTable.value?.schemaName || undefined,
    selectedTable.value?.physicalTableName ?? selectedTable.value?.tableName,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0)
  return parts.length > 0 ? parts.join(' / ') : '未选择对象'
})

function objectTypeLabel(type: DbmsObjectType | undefined): string {
  return type === 'VIEW' ? '视图' : '表'
}

function tableColumnCount(table: DbmsTable): number | string {
  return table.columnCount ?? table.columns?.length ?? '-'
}

function relationTableId(rel: DbmsRelation, side: 'parent' | 'child'): string | null {
  const value = side === 'parent' ? rel.PARENT_TABLE_ID : rel.CHILD_TABLE_ID
  return typeof value === 'string' && value.length > 0 ? value : null
}

function relationTableLabel(rel: DbmsRelation, side: 'parent' | 'child'): string {
  const tableName = side === 'parent'
    ? (rel.parentPhysicalTableName || rel.parentTableName)
    : (rel.childPhysicalTableName || rel.childTableName)
  const schemaName = side === 'parent' ? rel.parentSchemaName : rel.childSchemaName
  return schemaName ? `${schemaName}.${tableName}` : tableName
}

function selectWorkspaceTab(tab: WorkspaceTab) {
  activeWorkspaceTab.value = tab
  if (tab === 'data') void loadObjectData()
  if (tab === 'sql') void loadObjectSql()
}

function dataCellValue(row: Record<string, unknown>, column: DbmsColumn): string {
  const key = column.physicalColumnName || column.name
  const value = row[key]
  if (value === null || value === undefined) return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ── 数据加载 ──
async function loadServers() {
  loading.servers = true
  try {
    const formKeys = await resolveDatabaseCatalogScenarioIds()
    const snapshot = await lowcodeApi.catalog.getDatabaseCatalog(formKeys)
    catalogSnapshot.value = snapshot
    const normalizedServers = snapshot.servers.map((server) => ({
      ID: server.id,
      SERVER_NAME: server.name || server.id,
      HOST: server.host,
      PORT: server.port,
      DB_TYPE: server.type,
      DESCRIPTION: server.description,
    }))
    const knownServerIds = new Set(normalizedServers.map((server) => server.ID))
    const databaseServers = snapshot.databases.flatMap((database) => {
      if (!database.serverId || knownServerIds.has(database.serverId)) return []
      knownServerIds.add(database.serverId)
      return [{
        ID: database.serverId,
        SERVER_NAME: database.serverName || database.serverId,
        HOST: '',
        PORT: '',
        DB_TYPE: database.type,
        DESCRIPTION: '由已授权数据库模型返回；服务器详情不可见',
      }]
    })
    servers.value = [...normalizedServers, ...databaseServers]
    if (snapshot.sourceErrors.length > 0) {
      ElMessage.warning(`部分元数据模型不可见：${snapshot.sourceErrors.map((item) => item.source).join('、')}`)
    }
    if (selectedServer.value && !servers.value.some((srv) => srv.ID === selectedServer.value?.ID)) {
      selectedServer.value = null
      selectedDatabase.value = null
      selectedTable.value = null
      databases.value = []
      tables.value = []
      relations.value = []
      objectSql.value = null
      objectData.value = null
    }
  } catch (error) {
    ElMessage.error(`加载服务器失败: ${apiErrorMessage(error)}`)
    servers.value = []
  } finally { loading.servers = false }
}

async function loadDatabases() {
  if (!selectedServer.value) return
  const serverId = selectedServer.value.ID
  loading.databases = true
  try {
    const rows: DbmsDatabase[] = (catalogSnapshot.value?.databases ?? [])
      .filter((database) => database.serverId === serverId)
      .map((database) => ({
        ID: database.id,
        SERVER_ID: database.serverId,
        DATABASE_NAME: database.name,
        DB_TYPE: database.type,
        SERVER_NAME: database.serverName,
        SCHEMA_NAME: database.schemaName,
        STATE: database.state,
        REMARK: database.remark,
      }))
    if (selectedServer.value?.ID === serverId) databases.value = rows
  } catch (error) {
    if (selectedServer.value?.ID === serverId) {
      ElMessage.error(`加载数据库失败: ${apiErrorMessage(error)}`)
      databases.value = []
    }
  } finally { loading.databases = false }
}

async function loadTables() {
  if (!selectedDatabase.value) return
  const databaseId = selectedDatabase.value.ID
  loading.tables = true
  try {
    const fields = catalogSnapshot.value?.fields ?? []
    const rows: DbmsTable[] = (catalogSnapshot.value?.tables ?? [])
      .filter((table) => table.databaseId === databaseId)
      .map((table) => {
        const columns: DbmsColumn[] = fields
          .filter((field) => field.tableId === table.id)
          .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))
          .map((field) => ({
            name: field.label || field.name,
            physicalColumnName: field.name,
            type: field.dataTypeName,
            sqlType: field.dataType,
            maxLength: field.length === '' || !Number.isFinite(Number(field.length)) ? null : Number(field.length),
            primaryKey: field.primaryKey === true,
            ...(field.nullable === null ? {} : { nullable: field.nullable }),
            required: field.nullable === false,
            defaultValue: field.defaultValue || null,
            ...(field.order === null ? {} : { ordinalPosition: field.order }),
          }))
        return {
          id: table.id,
          tableName: table.description || table.name,
          physicalTableName: table.name,
          objectType: 'TABLE',
          schemaName: table.schemaName || null,
          multiTenancy: table.multiTenancy,
          columnCount: columns.length,
          columns,
        }
      })
    if (selectedDatabase.value?.ID === databaseId) {
      tables.value = rows
      if (selectedTable.value && !rows.some((tbl) => tbl.id === selectedTable.value?.id)) {
        selectedTable.value = null
        selectedTableColumns.value = []
        objectSql.value = null
        objectData.value = null
      }
    }
  } catch (error) {
    if (selectedDatabase.value?.ID === databaseId) {
      ElMessage.error(`加载数据表失败: ${apiErrorMessage(error)}`)
      tables.value = []
      selectedTable.value = null
      selectedTableColumns.value = []
      objectSql.value = null
      objectData.value = null
    }
  } finally { loading.tables = false }
}

async function loadRelations() {
  relations.value = []
}

// ── 选择 ──
function selectServer(srv: DbmsServer) {
  selectedServer.value = srv
  selectedDatabase.value = null
  selectedTable.value = null
  selectedTableColumns.value = []
  objectSql.value = null
  objectData.value = null
  dlgSync.catalog = null
  mutatePhysicalObjectKeys.value = new Set()
  databases.value = []
  tables.value = []
  relations.value = []
  void loadDatabases()
}

function selectDatabase(db: DbmsDatabase) {
  selectedDatabase.value = db
  selectedTable.value = null
  selectedTableColumns.value = []
  objectSql.value = null
  objectData.value = null
  tables.value = []
  relations.value = []
  void loadTables()
  void loadRelations()
}

function dbRowClass(db: DbmsDatabase) {
  return { selected: selectedDatabase.value?.ID === db.ID }
}

function selectTable(tbl: DbmsTable) {
  selectedTable.value = tbl
  selectedTableColumns.value = tbl.columns ?? []
  objectSql.value = null
  objectData.value = null
  dataPage.value = 1
  void loadTableDetail(tbl)
  if (activeWorkspaceTab.value === 'data') void loadObjectData(tbl.id)
  if (activeWorkspaceTab.value === 'sql') void loadObjectSql(tbl.id)
}

async function loadTableDetail(tbl: DbmsTable) {
  if (selectedTable.value?.id === tbl.id) selectedTableColumns.value = tbl.columns ?? []
}

async function loadObjectSql(objectId = selectedTable.value?.id) {
  if (!objectId) {
    objectSql.value = null
    return
  }
  loading.sql = false
  objectSql.value = null
}

async function loadObjectData(objectId = selectedTable.value?.id) {
  if (!objectId) {
    objectData.value = null
    return
  }
  loading.data = false
  objectData.value = null
}

function changeDataPage(page: number) {
  dataPage.value = Math.max(1, Math.min(page, dataPageCount.value))
  void loadObjectData()
}

function schemaObjects(schema: DbmsCatalogSchema): DbmsCatalogObject[] {
  return [...schema.tables, ...schema.views]
}

function mutateKey(obj: DbmsCatalogObject): string {
  return JSON.stringify({
    databaseId: obj.physicalObjectKey.databaseId,
    objectType: obj.objectType,
    schemaName: obj.physicalObjectKey.schemaName || '',
    physicalName: obj.physicalName,
  })
}

const mutatePhysicalObjectKeys = ref(new Set<string>())

function isMutateSelected(obj: DbmsCatalogObject): boolean {
  return mutatePhysicalObjectKeys.value.has(mutateKey(obj))
}

function toggleMutateObject(obj: DbmsCatalogObject) {
  const next = new Set(mutatePhysicalObjectKeys.value)
  const key = mutateKey(obj)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  mutatePhysicalObjectKeys.value = next
}

async function openSyncCatalog() {
  if (!selectedServer.value) {
    ElMessage.warning('请先选择服务器')
    return
  }
  dlgSync.visible = true
  if (!dlgSync.catalog || dlgSync.catalog.serverId !== selectedServer.value.ID) {
    await loadServerCatalog()
  }
}

async function loadServerCatalog() {
  dlgSync.catalog = null
  reportGovernanceBlocked()
}

async function submitSyncServer() {
  reportGovernanceBlocked()
}

// ── 服务器 Dialog ──
type ServerForm = {
  serverName: string
  host: string
  port: number
  dbType: string
  username: string
  password: string
  isolationMode: IsolationMode}

type ServerDialogState = {
  visible: boolean
  loading: boolean
  form: ServerForm}

const dlgServer = reactive<ServerDialogState>({
  visible: false,
  loading: false,
  form: { serverName: '', host: '', port: 3406, dbType: 'mysql', username: '', password: '', isolationMode: 'TENANT_ISOLATED' }
})

function resetServerForm() {
  dlgServer.form = { serverName: '', host: '', port: 3406, dbType: 'mysql', username: '', password: '', isolationMode: 'TENANT_ISOLATED' }
}

function openCreateServer() {
  resetServerForm()
  dlgServer.visible = true
}

async function testNewConnection() {
  testingNew.value = true
  try {
    const connected = await http.post<boolean>('/api/Db/testConnection', {
      Type: dlgServer.form.dbType.toUpperCase(),
      ServerName: dlgServer.form.serverName,
      ip_address: dlgServer.form.host,
      UserName: dlgServer.form.username,
      Password: dlgServer.form.password,
      Port: String(dlgServer.form.port),
    })
    if (connected) ElMessage.success('连接成功')
    else ElMessage.warning('连接失败')
  } catch (error) { ElMessage.error(`测试请求失败: ${apiErrorMessage(error)}`) }
  finally { testingNew.value = false }
}

async function submitCreateServer() {
  reportGovernanceBlocked()
}

async function testServerConnection(srv: DbmsServer) {
  void srv
  ElMessage.warning('安全只读目录不会读取数据库密码；请选择“注册服务器”填写临时凭据后测试')
}

// ── 数据库 Dialog ──
type DatabaseForm = {
  databaseName: string
  createNew: boolean
  isolationMode: IsolationMode
  connectionMode: string
  jndiName: string
  charset: string
  collation: string}

type DatabaseDialogState = {
  visible: boolean
  loading: boolean
  form: DatabaseForm}

const dlgDb = reactive<DatabaseDialogState>({
  visible: false,
  loading: false,
  form: { databaseName: '', createNew: false, isolationMode: 'PROJECT_ISOLATED', connectionMode: 'DIRECT', jndiName: '', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
})

function resetDbForm() {
  dlgDb.form = { databaseName: '', createNew: false, isolationMode: 'PROJECT_ISOLATED', connectionMode: 'DIRECT', jndiName: '', charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' }
  physicalDatabaseNames.value = []
}

function openCreateDatabase() {
  resetDbForm()
  const first = databaseIsolationOptions.value[0]
  if (first) dlgDb.form.isolationMode = first.value
  dlgDb.visible = true
  void loadPhysicalDatabases()
}

function onDatabaseOperationChange(value: string | number | boolean | undefined) {
  dlgDb.form.databaseName = ''
  if (value === false) void loadPhysicalDatabases()
}

function onDatabasePickerVisibleChange(visible: boolean) {
  if (visible && physicalDatabaseNames.value.length === 0) void loadPhysicalDatabases()
}

async function loadPhysicalDatabases() {
  const server = selectedServer.value
  if (!server) return
  const serverId = server.ID
  physicalDatabasesLoading.value = true
  try {
    const names = await http.get<string[]>(`/api/Db/getUnregisteredDb/${encodeURIComponent(serverId)}`)
    if (selectedServer.value?.ID === serverId) {
      physicalDatabaseNames.value = names
    }
  } catch (error) {
    if (selectedServer.value?.ID === serverId) {
      physicalDatabaseNames.value = []
      ElMessage.error(`加载数据库列表失败: ${apiErrorMessage(error)}`)
    }
  } finally {
    physicalDatabasesLoading.value = false
  }
}

async function submitCreateDatabase() {
  reportGovernanceBlocked()
}

async function deleteDatabaseConfirm(db: DbmsDatabase) {
  void db
  reportGovernanceBlocked()
}

// ── 表 Dialog ──
type ColumnForm = { name: string; type: string; maxLength: number | null; primaryKey: boolean; required: boolean}
type TableForm = {
  tableName: string
  physicalTableName: string
  isolationMode: IsolationMode
  columns: ColumnForm[]}

type TableDialogState = {
  visible: boolean
  loading: boolean
  form: TableForm}

const dlgTable = reactive<TableDialogState>({
  visible: false,
  loading: false,
  form: { tableName: '', physicalTableName: '', isolationMode: 'PROJECT_ISOLATED', columns: [] }
})

function resetTableForm() {
  dlgTable.form = { tableName: '', physicalTableName: '', isolationMode: 'PROJECT_ISOLATED', columns: [{ name: 'id', type: 'integer', maxLength: null, primaryKey: true, required: true }] }
}

function addColumn() {
  dlgTable.form.columns.push({ name: '', type: 'string', maxLength: 255, primaryKey: false, required: false })
}

function openCreateTable() {
  resetTableForm()
  const first = tableIsolationOptions.value[0]
  if (first) dlgTable.form.isolationMode = first.value
  dlgTable.visible = true
}

async function submitCreateTable() {
  reportGovernanceBlocked()
}

async function deleteTableConfirm(tbl: DbmsTable) {
  void tbl
  reportGovernanceBlocked()
}

// ── 表关系 Dialog ──
type RelationForm = {
  parentTableId: number | null
  parentField: string
  childTableId: number | null
  childField: string}

type RelationDialogState = {
  visible: boolean
  loading: boolean
  form: RelationForm}

const dlgRelation = reactive<RelationDialogState>({
  visible: false,
  loading: false,
  form: { parentTableId: null, parentField: '', childTableId: null, childField: '' }
})
const parentColumns = ref<DbmsColumn[]>([])
const childColumns = ref<DbmsColumn[]>([])

function resetRelationForm() {
  dlgRelation.form = { parentTableId: null, parentField: '', childTableId: null, childField: '' }
  parentColumns.value = []
  childColumns.value = []
}

async function viewTableRelation(_tbl: DbmsTable) {
  await loadRelations()
  dlgRelation.visible = true
}

async function fetchTableColumns(tableId: string): Promise<DbmsColumn[]> {
  const tbl = tables.value.find((t) => t.id === tableId)
  if (!tbl) return []
  return tbl.columns ?? []
}

async function onParentTableChange(tableId: string) {
  parentColumns.value = await fetchTableColumns(tableId)
}

async function onChildTableChange(tableId: string) {
  childColumns.value = await fetchTableColumns(tableId)
}

async function submitCreateRelation() {
  reportGovernanceBlocked()
}

async function deleteResourceRelation(id: string) {
  void id
  reportGovernanceBlocked()
}

// ── 初始化 ──
onMounted(() => {
  void loadServers()
})
</script>

<style scoped>
.dbms-page {
  --dbms-text: #172033;
  --dbms-muted: #6f7d90;
  --dbms-border: #dce5f1;
  --dbms-panel: #ffffff;
  --dbms-accent: #2563eb;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
  padding: 20px 24px 18px;
  color: var(--dbms-text);
  background: #f3f6fa;
}

.dbms-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.header-info {
  min-width: 0;
}

.dbms-header h2 {
  margin: 0;
  color: var(--dbms-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0;
}

.subtitle {
  display: block;
  margin-top: 6px;
  color: var(--dbms-muted);
  font-size: 13px;
  line-height: 1.4;
}

.header-actions {
  flex-shrink: 0;
}

.context-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.context-card {
  position: relative;
  display: grid;
  min-width: 0;
  gap: 4px;
  overflow: hidden;
  padding: 12px 14px 12px 16px;
  border: 1px solid var(--dbms-border);
  border-radius: 8px;
  background: var(--dbms-panel);
  box-shadow: 0 10px 28px rgb(24 39 75 / 5%);
}

.context-card::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #14b8a6;
  content: '';
}

.context-card:nth-child(2)::before {
  background: #3b82f6;
}

.context-card:nth-child(3)::before {
  background: #f59e0b;
}

.context-card.active {
  border-color: #9cc8ff;
  box-shadow: 0 12px 30px rgb(37 99 235 / 10%);
}

.context-card.disabled {
  color: #98a3b3;
  background: #f8fafc;
}

.context-label {
  color: #54708f;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.context-card strong {
  overflow: hidden;
  color: var(--dbms-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-card.disabled strong {
  color: #8a96a6;
}

.context-card > span:last-child {
  overflow: hidden;
  color: var(--dbms-muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dbms-body {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(260px, 0.95fr) minmax(300px, 1fr) minmax(360px, 1.05fr);
  gap: 14px;
  min-height: 0;
}

.panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid var(--dbms-border);
  border-radius: 8px;
  background: var(--dbms-panel);
  box-shadow: 0 14px 34px rgb(24 39 75 / 6%);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 68px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--dbms-border);
  background: linear-gradient(180deg, #fbfcfe 0%, #f6f8fb 100%);
}

.panel-heading {
  min-width: 0;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-index {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #e8f2ff;
  color: var(--dbms-accent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.panel-left .panel-index {
  color: #0f766e;
  background: #e7f8f4;
}

.panel-right .panel-index {
  color: #b45309;
  background: #fff4df;
}

.panel-title {
  overflow: hidden;
  color: var(--dbms-text);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-meta {
  overflow: hidden;
  margin-top: 5px;
  color: var(--dbms-muted);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-header :deep(.el-button) {
  flex-shrink: 0;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
}

.list-item {
  position: relative;
  overflow: hidden;
  padding: 12px 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .15s ease;
}

.list-item + .list-item {
  margin-top: 8px;
}

.list-item:hover {
  border-color: #cdddf0;
  background: #fbfdff;
  box-shadow: 0 8px 20px rgb(24 39 75 / 7%);
  transform: translateY(-1px);
}

.list-item.active {
  border-color: #7eb8f4;
  background: linear-gradient(90deg, #eef7ff 0%, #ffffff 78%);
  box-shadow: inset 0 0 0 1px rgb(64 158 255 / 18%), 0 10px 22px rgb(37 99 235 / 9%);
}

.list-item.active::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--dbms-accent);
  content: '';
}

.panel-right .list-item {
  cursor: default;
}

.item-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.item-name {
  overflow: hidden;
  min-width: 0;
  color: #263244;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-tags {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.item-tags :deep(.el-tag) {
  flex-shrink: 0;
  border-radius: 4px;
  font-weight: 600;
}

.item-sub {
  overflow: hidden;
  margin-top: 6px;
  color: var(--dbms-muted);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #edf2f7;
}

.item-actions :deep(.el-button) {
  font-weight: 600;
}

.loading,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 128px;
  border: 1px dashed #d8e2ee;
  border-radius: 8px;
  color: var(--dbms-muted);
  background: #f8fafc;
  font-size: 13px;
}

.loading .el-icon {
  font-size: 18px;
}

.column-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.database-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  width: 100%;
  gap: 8px;
}

.database-picker :deep(.el-select) {
  width: 100%;
}

.sync-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.sync-summary span {
  padding: 4px 8px;
  border: 1px solid #d0d5dd;
  border-radius: 3px;
  color: #475467;
  background: #f9fafb;
  font-size: 12px;
}

.catalog-preview {
  max-height: 480px;
  overflow: auto;
  border: 1px solid var(--dbms-border);
  border-radius: 4px;
  background: #ffffff;
}

.catalog-db {
  border-bottom: 1px solid var(--dbms-soft-border);
}

.catalog-db:last-child {
  border-bottom: 0;
}

.catalog-db-title,
.catalog-schema-title,
.catalog-object-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.catalog-db-title {
  padding: 10px 12px;
  background: #f8fafc;
}

.catalog-schema-title {
  padding: 8px 12px;
  color: #475467;
  background: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.catalog-object-row {
  min-height: 34px;
  padding: 6px 12px 6px 24px;
  border-top: 1px solid #edf1f6;
  font-size: 12px;
}

.catalog-object-row > div {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.catalog-object-meta {
  flex-shrink: 0;
  color: #667085;
}

.relation-list {
  max-height: 200px;
  overflow-y: auto;
}

.relation-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.rel-name {
  min-width: 120px;
  font-weight: 500;
}

.rel-arrow {
  flex: 1;
  color: #606266;
  font-size: 13px;
}

.relation-db-hint {
  margin-bottom: 8px;
  color: var(--dbms-muted);
  font-size: 13px;
}

.rel-form-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.rel-form-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

@media (max-width: 1200px) {
  .dbms-page {
    padding: 16px;
  }

  .dbms-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .panel {
    min-height: 320px;
  }
}

@media (max-width: 760px) {
  .dbms-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .context-strip {
    grid-template-columns: 1fr;
  }

  .panel-header {
    align-items: flex-start;
    flex-direction: column;
  }
}

/* DBMS workbench layout: object explorer + object grid + property inspector. */
.dbms-page {
  --dbms-text: #1f2933;
  --dbms-muted: #667085;
  --dbms-border: #cfd7e3;
  --dbms-soft-border: #e3e8ef;
  --dbms-panel: #ffffff;
  --dbms-chrome: #f2f4f7;
  --dbms-chrome-dark: #e7ebf1;
  --dbms-selected: #dbeafe;
  --dbms-selected-border: #60a5fa;
  --dbms-accent: #2563eb;
  gap: 10px;
  padding: 14px;
  background: #eef2f7;
}

.dbms-header {
  min-height: 40px;
  padding: 0 2px;
}

.dbms-header h2 {
  font-size: 20px;
  font-weight: 700;
}

.subtitle {
  margin-top: 3px;
  font-size: 12px;
}

.dbms-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  gap: 12px;
  padding: 6px 8px;
  border: 1px solid var(--dbms-border);
  border-radius: 4px;
  background: linear-gradient(180deg, #f9fafb 0%, var(--dbms-chrome-dark) 100%);
}

.location-bar {
  display: flex;
  align-items: center;
  min-width: 0;
  color: var(--dbms-muted);
  font-size: 12px;
}

.location-bar span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-bar span + span::before {
  flex: 0 0 auto;
  margin: 0 7px;
  color: #98a2b3;
  content: '/';
}

.toolbar-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.dbms-body {
  flex: 1;
  display: grid;
  grid-template-columns: 300px minmax(420px, 1fr) 280px;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}

.object-explorer,
.workspace-main,
.property-pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--dbms-border);
  border-radius: 4px;
  background: var(--dbms-panel);
  box-shadow: none;
}

.object-explorer,
.property-pane {
  display: flex;
  flex-direction: column;
}

.workspace-main {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dbms-border);
  background: var(--dbms-chrome);
}

.pane-header div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pane-header strong {
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-header span {
  overflow: hidden;
  color: var(--dbms-muted);
  font-size: 12px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
  background: #fbfcfe;
}

.tree-group + .tree-group {
  margin-top: 2px;
}

.tree-node {
  display: grid;
  grid-template-columns: 16px 18px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 26px;
  gap: 5px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  color: #344054;
  background: transparent;
  font: inherit;
  font-size: 13px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}

.tree-node:hover {
  border-color: #d0d5dd;
  background: #f2f4f7;
}

.tree-node.active {
  border-color: #93c5fd;
  background: var(--dbms-selected);
  color: #123b73;
}

.tree-node .el-icon {
  color: #475467;
  font-size: 15px;
}

.server-node .el-icon {
  color: #155eef;
}

.database-node .el-icon {
  color: #0f766e;
}

.table-node .el-icon,
.folder-node .el-icon {
  color: #7c2d12;
}

.tree-expander {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #667085;
  font-size: 11px;
}

.tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-count {
  min-width: 20px;
  padding: 0 5px;
  border-radius: 10px;
  color: #475467;
  background: #e4e7ec;
  font-size: 11px;
  text-align: center;
}

.tree-children {
  margin: 2px 0 2px 13px;
  padding-left: 9px;
  border-left: 1px solid #d8dee8;
}

.tables-branch {
  margin-left: 17px;
}

.tree-meta,
.tree-loading,
.tree-empty {
  padding: 3px 6px 5px 27px;
  color: var(--dbms-muted);
  font-size: 12px;
  line-height: 1.35;
}

.workspace-tabs {
  display: flex;
  align-items: flex-end;
  height: 34px;
  padding: 5px 8px 0;
  border-bottom: 1px solid var(--dbms-border);
  background: var(--dbms-chrome);
}

.workspace-tab {
  min-width: 74px;
  height: 29px;
  margin-right: 2px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  color: #475467;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.workspace-tab.active {
  border-color: var(--dbms-border);
  color: #111827;
  background: #ffffff;
  font-weight: 600;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 62px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dbms-soft-border);
  background: #ffffff;
}

.workspace-title {
  min-width: 0;
}

.workspace-title h3 {
  overflow: hidden;
  margin: 0;
  color: #111827;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-title span {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: var(--dbms-muted);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-stats {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.workspace-stats span {
  padding: 3px 8px;
  border: 1px solid #d0d5dd;
  border-radius: 3px;
  color: #475467;
  background: #f9fafb;
  font-size: 12px;
}

.object-grid {
  min-height: 0;
  overflow: auto;
  background: #ffffff;
}

.structure-grid,
.data-grid,
.sql-grid {
  min-height: 0;
  overflow: auto;
  padding: 12px;
  background: #ffffff;
}

.structure-section,
.data-section,
.sql-section {
  min-width: 720px;
}

.structure-section + .structure-section,
.data-section + .data-section,
.sql-section + .sql-section {
  margin-top: 14px;
}

.section-count {
  color: var(--dbms-muted);
  font-size: 12px;
}

.structure-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.overview-item {
  display: grid;
  gap: 5px;
  min-height: 74px;
  padding: 12px;
  border: 1px solid var(--dbms-border);
  border-radius: 6px;
  background: #fbfcfe;
}

.overview-item span {
  color: var(--dbms-muted);
  font-size: 12px;
}

.overview-item strong {
  overflow: hidden;
  color: #111827;
  font-size: 15px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sql-code {
  min-height: 180px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  color: #111827;
  background: #f8fafc;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}

.data-table-scroll {
  overflow: auto;
  border: 1px solid var(--dbms-border);
}

.data-table {
  min-width: 960px;
  border: none;
}

.data-table th,
.data-table td {
  min-width: 140px;
}

.data-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 0 0;
  color: var(--dbms-muted);
  font-size: 12px;
}

.table-wrap {
  min-width: 720px;
  padding: 12px;
}

.grid-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.grid-title strong {
  color: #111827;
  font-size: 14px;
}

.grid-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.dbms-table {
  width: 100%;
  border: 1px solid var(--dbms-border);
  border-collapse: collapse;
  table-layout: fixed;
  background: #ffffff;
  font-size: 13px;
}

.dbms-table th,
.dbms-table td {
  overflow: hidden;
  height: 36px;
  padding: 0 10px;
  border-right: 1px solid var(--dbms-soft-border);
  border-bottom: 1px solid var(--dbms-soft-border);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dbms-table th {
  color: #475467;
  background: #f2f4f7;
  font-size: 12px;
  font-weight: 700;
}

.dbms-table tbody tr {
  cursor: pointer;
}

.dbms-table tbody tr:hover {
  background: #f8fafc;
}

.dbms-table tbody tr.selected {
  background: var(--dbms-selected);
}

.object-name {
  color: #111827;
  font-weight: 600;
}

.object-name .el-icon {
  margin-right: 6px;
  color: #475467;
  vertical-align: -2px;
}

.mono-cell {
  color: #475467;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}

.operation-col {
  width: 150px;
  text-align: right;
}

.property-list {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 0;
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
}

.property-list dt,
.property-list dd {
  min-height: 30px;
  margin: 0;
  padding: 7px 0;
  border-bottom: 1px solid #edf1f6;
  line-height: 1.35;
}

.property-list dt {
  color: var(--dbms-muted);
}

.property-list dd {
  overflow: hidden;
  color: #111827;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.property-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding: 10px;
  border-top: 1px solid var(--dbms-border);
  background: #fbfcfe;
}

.loading,
.empty {
  min-height: 96px;
  border: 1px dashed #d0d5dd;
  border-radius: 4px;
  color: var(--dbms-muted);
  background: #f9fafb;
}

.large-empty {
  min-height: 260px;
  margin: 12px;
}

@media (max-width: 1280px) {
  .dbms-body {
    grid-template-columns: 280px minmax(420px, 1fr);
  }

  .property-pane {
    display: none;
  }
}

@media (max-width: 900px) {
  .dbms-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .dbms-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .object-explorer,
  .workspace-main {
    min-height: 320px;
  }
}
</style>
