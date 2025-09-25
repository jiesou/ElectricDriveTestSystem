<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Table, Card, Tag, Progress, Timeline, Button, Modal } from 'ant-design-vue'

interface ClientInfo {
  id: string
  ip: string
  session?: {
    currentQuestion: number
    totalQuestions: number
    remainingTroubles: number[]
    startTime: number
    endTime?: number
    durationTime?: number | null
  } | null
}

interface TestLog {
  timestamp: number
  action: 'start' | 'answer' | 'navigation' | 'finish'
  details: {
    questionNumber?: number
    troubleId?: number
    result?: boolean
    direction?: 'next' | 'prev'
    timeDiff?: number
  }
}

const clients = ref<ClientInfo[]>([])
const loading = ref(false)
const refreshTimer = ref<number | null>(null)
const logModalVisible = ref(false)
const selectedClientId = ref('')
const selectedClientLogs = ref<TestLog[]>([])

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
  },
  {
    title: '操作',
    key: 'actions',
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

async function fetchClientLogs(clientId: string) {
  try {
    const response = await fetch(`/api/clients/${clientId}/logs`)
    const result = await response.json()
    
    if (result.success) {
      selectedClientLogs.value = result.data
    }
  } catch (error) {
    console.error('Failed to fetch client logs:', error)
  }
}

function showClientLogs(clientId: string) {
  selectedClientId.value = clientId
  fetchClientLogs(clientId)
  logModalVisible.value = true
}

function getLogColor(action: string): string {
  switch (action) {
    case 'start': return 'blue'
    case 'answer': return 'green'
    case 'navigation': return 'orange'
    case 'finish': return 'red'
    default: return 'default'
  }
}

function getLogText(log: TestLog): string {
  switch (log.action) {
    case 'start':
      return `开始测验 - 第${log.details.questionNumber}题`
    case 'answer':
      const result = log.details.result ? '正确' : '错误'
      return `回答trouble${log.details.troubleId} - ${result} (第${log.details.questionNumber}题)`
    case 'navigation':
      const direction = log.details.direction === 'next' ? '下一题' : '上一题'
      return `切换到${direction} - 第${log.details.questionNumber}题`
    case 'finish':
      return '完成测验'
    default:
      return '未知操作'
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
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
              <Tag :color="record.session ? (record.session.endTime ? 'red' : 'blue') : 'default'">
                {{ record.session ? (record.session.endTime ? '已结束' : '进行中') : '空闲' }}
              </Tag>
              <div v-if="record.session" style="margin-top: 4px; font-size: 12px; color: #666;">
                第 {{ record.session.currentQuestion }}/{{ record.session.totalQuestions }} 题
                <span v-if="record.session.durationTime"> 
                  (限时{{ Math.floor(record.session.durationTime / 60) }}分钟)
                </span>
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
                当前题目剩余troubles: {{ record.session.remainingTroubles.length }}
              </div>
            </div>
            <span v-else style="color: #999;">-</span>
          </template>

          <template v-if="column.key === 'actions'">
            <Button 
              v-if="record.session" 
              type="link" 
              size="small" 
              @click="showClientLogs(record.id)">
              查看日志
            </Button>
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
            <p><strong>当前题目剩余troubles:</strong> 
              <Tag v-for="troubleId in client.session.remainingTroubles" :key="troubleId" color="orange">
                trouble {{ troubleId }}
              </Tag>
              <span v-if="client.session.remainingTroubles.length === 0" style="color: #52c41a;">
                当前题目已完成
              </span>
            </p>
          </div>
        </div>
      </Card>
    </div>

    <Modal 
      v-model:open="logModalVisible" 
      title="客户机测验日志" 
      :footer="null" 
      width="700px">
      <div v-if="selectedClientLogs.length > 0">
        <Timeline>
          <Timeline.Item 
            v-for="(log, index) in selectedClientLogs" 
            :key="index"
            :color="getLogColor(log.action)">
            <template #dot>
              <Tag :color="getLogColor(log.action)" size="small">
                {{ log.action.toUpperCase() }}
              </Tag>
            </template>
            <div>
              <div style="margin-bottom: 4px;">
                <strong>{{ getLogText(log) }}</strong>
              </div>
              <div style="font-size: 12px; color: #666;">
                时间: {{ formatTime(log.timestamp) }}
                <span v-if="log.details.timeDiff && index > 0"> 
                  (距上次操作 {{ log.details.timeDiff }}秒)
                </span>
              </div>
            </div>
          </Timeline.Item>
        </Timeline>
      </div>
      <div v-else style="text-align: center; color: #999; padding: 20px;">
        暂无日志记录
      </div>
    </Modal>
  </div>
</template>