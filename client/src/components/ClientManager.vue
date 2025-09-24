<template>
  <div>
    <a-card title="连接的客户机" :extra="`总计: ${clients.length} 台`">
      <a-button type="primary" @click="refreshClients" :loading="loading" style="margin-bottom: 16px;">
        刷新
      </a-button>
      
      <a-table 
        :columns="columns" 
        :dataSource="clients" 
        :loading="loading"
        :pagination="false"
        rowKey="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="getStatusColor(record)">
              {{ getStatusText(record) }}
            </a-tag>
          </template>
          
          <template v-if="column.key === 'actions'">
            <a-space>
              <a-button 
                size="small" 
                @click="showClientLogs(record)"
              >
                查看日志
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>
    
    <!-- Client Logs Modal -->
    <a-modal
      v-model:open="logsModalVisible"
      :title="`客户端 ${selectedClient?.id} 日志`"
      width="800px"
      :footer="null"
    >
      <div style="max-height: 400px; overflow-y: auto;">
        <a-list :dataSource="clientLogs" size="small">
          <template #renderItem="{ item }">
            <a-list-item>
              <code>{{ item }}</code>
            </a-list-item>
          </template>
        </a-list>
      </div>
      <a-button type="primary" @click="refreshClientLogs" style="margin-top: 16px;">
        刷新日志
      </a-button>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'

interface Client {
  id: string
  ip: string
  currentTest?: string
  currentQuestion?: number
  logCount: number
}

const clients = ref<Client[]>([])
const loading = ref(false)
const logsModalVisible = ref(false)
const selectedClient = ref<Client | null>(null)
const clientLogs = ref<string[]>([])

const columns = [
  {
    title: '客户端ID',
    dataIndex: 'id',
    key: 'id',
    width: 120
  },
  {
    title: 'IP地址',
    dataIndex: 'ip', 
    key: 'ip'
  },
  {
    title: '状态',
    key: 'status',
    width: 100
  },
  {
    title: '当前测试',
    dataIndex: 'currentTest',
    key: 'currentTest',
    customRender: ({ text }: { text: string }) => text || '-'
  },
  {
    title: '日志条数',
    dataIndex: 'logCount',
    key: 'logCount',
    width: 100
  },
  {
    title: '操作',
    key: 'actions',
    width: 120
  }
]

function getStatusColor(client: Client): string {
  if (client.currentTest) {
    return 'processing'
  }
  return 'success'
}

function getStatusText(client: Client): string {
  if (client.currentTest) {
    return '测试中'
  }
  return '空闲'
}

async function refreshClients() {
  loading.value = true
  try {
    const response = await fetch('/api/clients')
    if (response.ok) {
      clients.value = await response.json()
    } else {
      message.error('获取客户端列表失败')
    }
  } catch (error) {
    console.error('Failed to load clients:', error)
    message.error('连接服务器失败')
  } finally {
    loading.value = false
  }
}

async function showClientLogs(client: Client) {
  selectedClient.value = client
  logsModalVisible.value = true
  await refreshClientLogs()
}

async function refreshClientLogs() {
  if (!selectedClient.value) return
  
  try {
    const response = await fetch(`/api/client/${selectedClient.value.id}/logs`)
    if (response.ok) {
      clientLogs.value = await response.json()
    } else {
      message.error('获取日志失败')
    }
  } catch (error) {
    console.error('Failed to load client logs:', error)
    message.error('连接服务器失败')
  }
}

// Auto refresh clients every 5 seconds
let refreshInterval: number

onMounted(() => {
  refreshClients()
  refreshInterval = setInterval(refreshClients, 5000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>