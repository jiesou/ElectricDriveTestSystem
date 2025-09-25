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
    endTime?: number
    durationTime?: number | null
    logs?: TestLog[]
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
  }
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

function getLogColor(action: string): string {
  switch (action) {
    case 'start': return 'blue'
    case 'answer': return 'green'
    case 'navigation': return 'orange'
    case 'finish': return 'red'
    default: return 'default'
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
      <Table :dataSource="clients" :columns="columns" :loading="loading" rowKey="id" :pagination="false" size="middle">
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
              <Progress :percent="Math.round((record.session.currentQuestion / record.session.totalQuestions) * 100)"
                size="small" :status="record.session.remainingTroubles.length === 0 ? 'success' : 'active'" />
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
      <div v-for="client in clients.filter(c => c.session)" :key="client.id" style="margin-bottom: 20px;">
        <Card :title="`活跃测验详情 - ${client.ip}`">
          <div v-if="client.session">
            <div style="margin-bottom: 16px;">
              <p><strong>开始时间:</strong> {{ formatTime(client.session.startTime) }}</p>
              <p><strong>当前进度:</strong> 第 {{ client.session.currentQuestion }}/{{ client.session.totalQuestions }} 题</p>
              <p><strong>当前题目剩余故障:</strong> {{ client.session.remainingTroubles.length }} 题</p>
              <div v-if="client.session.logs && client.session.logs.length > 0">
                <strong>测验日志</strong>
                <Timeline style="margin-top: 12px;">
                  <Timeline.Item v-for="(log, index) in client.session.logs" :key="index"
                    :color="getLogColor(log.action)">
                    <div>
                      <Tag :color="getLogColor(log.action)" size="small">
                        {{ log.action.toUpperCase() }}
                      </Tag>
                      <div style="margin-top: 4px;">
                        <strong v-if="log.action == 'start'">开始测验</strong>
                        <strong v-else-if="log.action == 'finish'">完成测验</strong>
                        <strong v-else-if="log.action == 'answer'">
                          选择了 <Tag>故障{{ log.details.troubleId }}</Tag> - {{log.details.result ? '正确' : '错误' }}
                        </strong>
                        <strong v-else-if="log.action == 'navigation'">
                          切换到{{ log.details.direction === 'next' ? '下一题' :'上一题' }}
                        </strong>
                        <strong v-else>未知操作</strong>
                      </div>
                      <div style="font-size: 12px; color: #666;">
                        {{ formatTime(log.timestamp) }}
                        <span v-if="index > 0">
                          (经过 {{ (log.timestamp - client.session.logs[index - 1]!!.timestamp) }} 秒)
                        </span>
                      </div>
                    </div>
                  </Timeline.Item>
                </Timeline>
              </div>

            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>