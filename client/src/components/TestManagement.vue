<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue'
import { Table, Button, Modal, Form, Select, DatePicker, message, Card, Tag, InputNumber } from 'ant-design-vue'
import type { Question, Client, TestSession } from '../types'
import { getSecondTimestamp } from '../types'

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
  durationTime: undefined as number | undefined
})

async function fetchData() {
  try {
    loading.value = true

    // Fetch questions, clients, and test sessions in parallel
    const [questionsRes, clientsRes, sessionsRes] = await Promise.all([
      fetch('/api/questions'),
      fetch('/api/clients'),
      fetch('/api/test-sessions')
    ])

    const [questionsResult, clientsResult, sessionsResult] = await Promise.all([
      questionsRes.json(),
      clientsRes.json(),
      sessionsRes.json()
    ])

    if (questionsResult.success) {
      questions.value = questionsResult.data
    }

    if (clientsResult.success) {
      clients.value = clientsResult.data
    }

    if (sessionsResult.success) {
      testSessions.value = sessionsResult.data
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
  formState.durationTime = undefined
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
      : getSecondTimestamp()

    const response = await fetch('/api/test-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientIds: formState.clientIds,
        questionIds: formState.questionIds,
        startTime,
        durationTime: formState.durationTime ? formState.durationTime * 60 : null
      })
    })

    const result = await response.json()
    if (result.success) {
      const successCount = result.data.filter((r: any) => r.success).length
      message.success(`测验创建成功，${successCount}/${result.data.length} 个客户机已分配测验`)
      modalVisible.value = false

      await fetchData() // Refresh all data
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
    title: '客户机名称',
    dataIndex: 'name',
    key: 'name'
  },
  {
    title: 'IP地址',
    dataIndex: 'ip',
    key: 'ip'
  },
  {
    title: '测验状态',
    key: 'testStatus',
    customRender: ({ record }: { record: Client }) => {
      return record.testSession ? '进行中' : '空闲'
    }
  }
]

const sessionColumns = [
  {
    title: '客户机IP',
    dataIndex: 'clientIp',
    key: 'clientIp'
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
    title: '所含题目',
    dataIndex: 'questionIds',
    key: 'questions',
    customRender: ({ record }: { record: any }) => {
      return record.questionIds.map((questionId: number, index: number) => 
        h(Tag, { key: questionId, style: index > 0 ? 'margin-left: 4px' : '', color: 'blue' }, () => `题目${questionId}`)
      )
    }
  },
  {
    title: '进度',
    key: 'progress',
    customRender: ({ record }: { record: any }) => {
      return `${record.currentQuestionIndex + 1}/${record.totalQuestions}`
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
        ▶ 安排新测验
      </Button>
    </Card>

    <Card title="连接的客户机" style="margin-bottom: 20px;">
      <Table :dataSource="clients" :columns="clientColumns" :loading="loading" size="small" rowKey="id"
        :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'testStatus'">
            <Tag :color="record.testSession ? 'blue' : 'default'">
              {{ record.testSession ? '进行中' : '空闲' }}
            </Tag>
          </template>
        </template>
      </Table>
    </Card>

    <Card title="已安排的测验">
      <Table :dataSource="testSessions" :columns="sessionColumns" size="small" rowKey="sessionId" :pagination="false" />
    </Card>

    <Modal v-model:open="modalVisible" title="创建测验" @ok="handleCreateTest" width="600px">
      <Form layout="vertical">
        <Form.Item label="选择客户机" required>
          <Select v-model:value="formState.clientIds" mode="multiple" placeholder="请选择目标客户机" style="width: 100%">
            <Select.Option v-for="client in clients" :key="client.id" :value="client.id" :disabled="!!client.testSession">
              {{ client.name }} ({{ client.ip }})
              <Tag v-if="client.testSession" color="blue" size="small">进行中</Tag>
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

        <Form.Item label="测验持续时间（分钟）">
          <InputNumber v-model:value="formState.durationTime" :min="1" :max="300" placeholder="留空表示无时间限制" style="width: 100%" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>