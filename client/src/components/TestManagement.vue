<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Table, Button, Modal, Form, Select, DatePicker, message, Card, Tag, Space } from 'ant-design-vue'

interface Question {
  id: number
  troubles: number[]
}

interface Client {
  id: string
  ip: string
  session?: {
    currentQuestion: number
    totalQuestions: number
    remainingTroubles: number[]
    startTime: number
  } | null
}

interface TestSession {
  id: string
  clientId: string
  clientIp: string
  startTime: number
  durationTime?: number | null
  endTime?: number | null
  questions: Question[]
  currentQuestion: number
  totalQuestions: number
  remainingTroubles: number[]
  activityLog: ActivityLogEntry[]
}

interface ActivityLogEntry {
  timestamp: number
  type: 'start' | 'answer' | 'navigate' | 'finish' | 'timeout'
  data?: any
}

const questions = ref<Question[]>([])
const clients = ref<Client[]>([])
const testSessions = ref<TestSession[]>([])
const loading = ref(false)

// Modal state
const modalVisible = ref(false)
const formState = reactive({
  clientIds: [] as string[],
  questionIds: [] as number[],
  startTime: '' as string,
  durationTime: '' as string
})

async function fetchData() {
  try {
    loading.value = true

    // Fetch questions and clients in parallel
    const [questionsRes, clientsRes] = await Promise.all([
      fetch('/api/questions'),
      fetch('/api/clients')
    ])

    const [questionsResult, clientsResult] = await Promise.all([
      questionsRes.json(),
      clientsRes.json()
    ])

    if (questionsResult.success) {
      questions.value = questionsResult.data
    }

    if (clientsResult.success) {
      clients.value = clientsResult.data
    }
  } catch (error) {
    console.error('Failed to fetch data:', error)
    message.error('获取数据失败')
  } finally {
    loading.value = false
  }
}

function openCreateTestModal() {
  formState.clientIds = []
  formState.questionIds = []
  formState.startTime = ''
  modalVisible.value = true
}

async function handleCreateTest() {
  if (formState.clientIds.length === 0) {
    message.error('请选择至少一个客户机')
    return
  }

  if (formState.questionIds.length === 0) {
    message.error('请选择至少一个题目')
    return
  }

  try {
    const startTime = formState.startTime
      ? Math.floor(new Date(formState.startTime).getTime() / 1000)
      : Math.floor(Date.now() / 1000)

    const response = await fetch('/api/test-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientIds: formState.clientIds,
        questionIds: formState.questionIds,
        startTime
      })
    })

    const result = await response.json()
    if (result.success) {
      const successCount = result.data.filter((r: any) => r.success).length
      message.success(`测验创建成功，${successCount}/${result.data.length} 个客户机已分配测验`)
      modalVisible.value = false

      // Add to local sessions list
      testSessions.value.push({
        clientIds: formState.clientIds,
        questionIds: formState.questionIds,
        startTime,
        createdAt: Date.now() / 1000
      })

      await fetchData() // Refresh client data
    } else {
      message.error(result.error || '测验创建失败')
    }
  } catch (error) {
    console.error('Failed to create test:', error)
    message.error('测验创建失败')
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

const clientColumns = [
  {
    title: 'IP地址',
    dataIndex: 'ip',
    key: 'ip'
  },
  {
    title: '测验状态',
    key: 'testStatus',
    customRender: ({ record }: { record: Client }) => {
      return record.session ? '进行中' : '空闲'
    }
  }
]

const sessionColumns = [
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    customRender: ({ text }: { text: number }) => {
      return formatTime(text)
    }
  },
  {
    title: '开始时间',
    dataIndex: 'startTime',
    key: 'startTime',
    customRender: ({ text }: { text: number }) => {
      return formatTime(text)
    }
  },
  {
    title: '所含客户机',
    dataIndex: 'clientIds',
    key: 'clients',
    customRender: ({ record }: { record: TestSession }) => {
      // TODO: 拼接客户机列表
      
    }
  },
  {
    title: '所含题目',
    dataIndex: 'questionIds',
    key: 'questions',
    customRender: ({ record }: { record: TestSession }) => {
      // TODO: 拼接题目列表

    }
  }
]

onMounted(() => {
  fetchData()
  // Refresh data every 5 seconds
  setInterval(fetchData, 5000)
})
</script>

<template>
  <div>
    <h2>测验管理</h2>

    <Card title="发起测验" style="margin-bottom: 20px;">
      <Button type="primary" @click="openCreateTestModal">
        ▶ 创建新测验
      </Button>
    </Card>

    <Card title="连接的客户机" style="margin-bottom: 20px;">
      <Table :dataSource="clients" :columns="clientColumns" :loading="loading" size="small" rowKey="id"
        :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'testStatus'">
            <Tag :color="record.session ? 'blue' : 'default'">
              {{ record.session ? '进行中' : '空闲' }}
            </Tag>
          </template>
        </template>
      </Table>
    </Card>

    <Card title="已安排的测验">
      <!-- TODO: 已安排的测验 testSessions 似乎还没有从服务器获取数据 -->
      <Table :dataSource="testSessions" :columns="sessionColumns" size="small" rowKey="createdAt" :pagination="false" />
    </Card>

    <Modal v-model:open="modalVisible" title="创建测验" @ok="handleCreateTest" width="600px">
      <Form layout="vertical">
        <Form.Item label="选择客户机" required>
          <Select v-model:value="formState.clientIds" mode="multiple" placeholder="请选择目标客户机" style="width: 100%">
            <Select.Option v-for="client in clients" :key="client.id" :value="client.id" :disabled="!!client.session">
              {{ client.ip }}
              <Tag v-if="client.session" color="blue" size="small">进行中</Tag>
            </Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="选择题目" required>
          <Select v-model:value="formState.questionIds" mode="multiple" placeholder="请选择测验题目" style="width: 100%">
            <Select.Option v-for="question in questions" :key="question.id" :value="question.id">
              题目 {{ question.id }} ({{ question.troubles.length }} 个故障)
            </Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="开始时间">
          <DatePicker v-model:value="formState.startTime" show-time placeholder="选择开始时间（留空表示立即开始）" style="width: 100%"
            :disabledDate="(current) => {
              const now = new Date()
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
              return current && current.toDate() < today
            }" :disabledTime="(current) => {
              if (!current) return {}
              const now = new Date()
              const selectedDate = current.toDate()
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
              if (selectedDate < today) return {}
              const hours = now.getHours()
              const minutes = now.getMinutes()
              const seconds = now.getSeconds()
              return {
                disabledHours: () => Array.from({ length: hours }, (_, i) => i),
                disabledMinutes: (selectedHour) => selectedHour === hours ? Array.from({ length: minutes }, (_, i) => i) : [],
                disabledSeconds: (selectedHour, selectedMinute) => selectedHour === hours && selectedMinute === minutes ? Array.from({ length: seconds }, (_, i) => i) : []
              }
            }" />
          <!-- 不能设置过去的时间 -->
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>