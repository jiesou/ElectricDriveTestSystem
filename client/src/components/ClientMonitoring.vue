<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Table, Card, Tag, Progress, Timeline } from 'ant-design-vue'

interface ClientInfo {
  id: string
  ip: string
  session?: {
    currentQuestion: number
    totalQuestions: number
    remainingTroubles: number[]
    startTime: number
  } | null
}

const clients = ref<ClientInfo[]>([])
const loading = ref(false)
const refreshTimer = ref<number | null>(null)

const columns = [
  { 
    title: 'IP地址', 
    dataIndex: 'ip', 
    key: 'ip' 
  },
  { 
    title: '测验状态', 
    key: 'testStatus',
    customRender: ({ record }: { record: ClientInfo }) => ({
      hasSession: !!record.session,
      session: record.session
    })
  },
  { 
    title: '答题进度', 
    key: 'progress',
    customRender: ({ record }: { record: ClientInfo }) => ({ record })
  }
]

async function fetchClients() {
  try {
    loading.value = true
    const response = await fetch('/api/clients')
    const result = await response.json()
    
    if (result.success) {
      clients.value = result.data
    }
  } catch (error) {
    console.error('Failed to fetch clients:', error)
  } finally {
    loading.value = false
  }
}

function startAutoRefresh() {
  refreshTimer.value = window.setInterval(() => {
    fetchClients()
  }, 2000) // Refresh every 2 seconds
}

function stopAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
}

onMounted(() => {
  fetchClients()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div>
    <h2>客户机监控</h2>
    
    <Card title="实时客户机状态">
      <Table 
        :dataSource="clients" 
        :columns="columns" 
        :loading="loading"
        rowKey="id"
        :pagination="false"
        size="middle"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'testStatus'">
            <div>
              <Tag :color="record.session ? 'blue' : 'default'">
                {{ record.session ? '进行中' : '空闲' }}
              </Tag>
              <div v-if="record.session" style="margin-top: 4px; font-size: 12px; color: #666;">
                第 {{ record.session.currentQuestion }}/{{ record.session.totalQuestions }} 题
              </div>
            </div>
          </template>
          
          <template v-if="column.key === 'progress'">
            <div v-if="record.session">
              <Progress 
                :percent="Math.round((record.session.currentQuestion / record.session.totalQuestions) * 100)"
                size="small"
                :status="record.session.remainingTroubles.length === 0 ? 'success' : 'active'"
              />
              <div style="font-size: 12px; color: #666; margin-top: 4px;">
                当前题目剩余故障: {{ record.session.remainingTroubles.length }}
              </div>
            </div>
            <span v-else style="color: #999;">-</span>
          </template>
        </template>
      </Table>
    </Card>

    <div style="margin-top: 20px;" v-if="clients.filter(c => c.session).length > 0">
      <Card title="活跃测验详情">
        <div v-for="client in clients.filter(c => c.session)" :key="client.id" style="margin-bottom: 20px;">
          <h4>{{ client.ip }}</h4>
          <div v-if="client.session" style="padding-left: 20px;">
            <p><strong>开始时间:</strong> {{ new Date(client.session.startTime * 1000).toLocaleString() }}</p>
            <p><strong>当前进度:</strong> 第 {{ client.session.currentQuestion }}/{{ client.session.totalQuestions }} 题</p>
            <p><strong>当前题目剩余故障:</strong> 
              <Tag v-for="troubleId in client.session.remainingTroubles" :key="troubleId" color="orange">
                故障 {{ troubleId }}
              </Tag>
              <span v-if="client.session.remainingTroubles.length === 0" style="color: #52c41a;">
                当前题目已完成
              </span>
            </p>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>