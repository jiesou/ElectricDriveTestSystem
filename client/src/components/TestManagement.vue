<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue'
import { Table, Button, Modal, Form, Select, DatePicker, message, Card, Tag, InputNumber, Popconfirm } from 'ant-design-vue'
import type { Question, Client, Test } from '../types'
import { getSecondTimestamp } from '../types'
import ClientTable from './ClientTable.vue'
import QuestionManagement from './QuestionManagement.vue'

const questions = ref<Question[]>([])
const tests = ref<Test[]>([])
const clients = ref<Client[]>([]) // Only used for modal selection
const loading = ref(false)

const createTestModalVisible = ref(false)
const questionManagementModalVisible = ref(false)
const questionManagementRef = ref<InstanceType<typeof QuestionManagement> | null>(null)

const formState = reactive({
  clientIds: [] as string[],
  questionIds: [] as number[],
  startTime: '' as string,
  durationTime: undefined as number | undefined
})

async function fetchData() {
  try {
    loading.value = true

    // Fetch questions, clients, and tests in parallel
    const [questionsRes, clientsRes, testsRes] = await Promise.all([
      fetch('/api/questions'),
      fetch('/api/clients'),
      fetch('/api/tests')
    ])

    const [questionsResult, clientsResult, testsResult] = await Promise.all([
      questionsRes.json(),
      clientsRes.json(),
      testsRes.json()
    ])

    if (questionsResult.success) {
      questions.value = questionsResult.data
    }

    if (clientsResult.success) {
      clients.value = clientsResult.data
    }

    if (testsResult.success) {
      tests.value = testsResult.data
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
  createTestModalVisible.value = true
}

// 当已经存在已安排测验时，用户点击“安排新测验”会触发此函数：
// 依次执行结束所有活跃测验 -> 清除测验记录 -> 刷新数据 -> 打开创建测验模态
async function confirmThenCreate() {
  try {
    loading.value = true
    // 先结束所有活跃测验
    await handleFinishTest()
    // 再清除所有测验记录
    await handleClearAllTests()
    // 刷新数据，确保 UI 状态同步
    await fetchData()

    // 打开创建模态并重置表单
    formState.clientIds = []
    formState.questionIds = []
    formState.startTime = ''
    formState.durationTime = undefined
    createTestModalVisible.value = true
  } catch (error) {
    console.error('confirmThenCreate failed:', error)
    message.error('准备新测验失败')
  } finally {
    loading.value = false
  }
}

function openQuestionManagementModal() {
  questionManagementModalVisible.value = true
}

async function handleQuestionManagementClose() {
  questionManagementModalVisible.value = false
  // Refresh questions list after closing question management modal
  await fetchData()
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

    const response = await fetch('/api/tests/test-sessions', {
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
      createTestModalVisible.value = false

      await fetchData() // Refresh all data
    } else {
      message.error(result.error || '测验创建失败')
    }
  } catch (error) {
    console.error('Failed to create test:', error)
    message.error('测验创建失败')
  }
}

// 继电器功能测试（系统自检）：调用后端广播 RelayRainbowMessage 给所有 client
async function handleRelayRainbowTest() {
  try {
    loading.value = true
    const response = await fetch('/api/tests/relay-rainbow', { method: 'POST' })
    const result = await response.json()
    if (result && result.success) {
      message.success(`系统自检广播已发送，在线客户机: ${result.data.sent || 0}`)
      
      // 轮询获取延迟结果（最多等待3秒）
      let attempts = 0
      const maxAttempts = 6 // 6次 * 500ms = 3秒
      const pollInterval = 500 // 每500ms轮询一次
      
      const pollResults = async () => {
        attempts++
        const latencyRes = await fetch('/api/tests/relay-rainbow-latency')
        const latencyResult = await latencyRes.json()
        
        if (latencyResult.success && latencyResult.data.length > 0) {
          // 显示所有客户端的延迟结果
          latencyResult.data.forEach((item: any) => {
            message.success(`客户端 ${item.clientName} 回环延迟: ${item.latencyMs}ms`)
          })
        } else if (attempts < maxAttempts) {
          // 继续轮询
          setTimeout(pollResults, pollInterval)
        }
      }
      
      // 延迟500ms后开始轮询，给ESP32一些响应时间
      setTimeout(pollResults, pollInterval)
    } else {
      message.error(result.error || '系统自检测试失败')
    }
  } catch (err) {
    console.error('relay rainbow failed', err)
    message.error('系统自检请求失败')
  } finally {
    loading.value = false
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

async function handleFinishTest() {
  try {
    const response = await fetch(`/api/tests/finish-all`, {
      method: 'POST'
    })

    const result = await response.json()
    if (result.success) {
      message.success('活跃测验已全部结束')
      await fetchData() // Refresh data
    } else {
      message.error(result.error || '结束活跃测验失败')
    }
  } catch (error) {
    console.error('Failed to finish test:', error)
    message.error('结束活跃测验失败')
  }
}

async function handleClearAllTests() {
  try {
    const response = await fetch(`/api/tests/clear-all`, {
      method: 'POST'
    })

    const result = await response.json()
    if (result.success) {
      message.success('所有测验记录已清除')
      await fetchData() // Refresh data
    } else {
      message.error(result.error || '清除测验记录失败')
    }
  } catch (error) {
    console.error('Failed to clear all tests:', error)
    message.error('清除测验记录失败')
  }
}

const testColumns = [
  {
    title: '测验ID',
    dataIndex: 'id',
    key: 'id'
  },
  {
    title: '所含题目',
    key: 'questions',
    customRender: ({ record }: { record: Test }) => {
      return record.questions.map((question: Question) =>
      h(Tag, () => `题目${question.id}: ${question.troubles.map(trouble => trouble.description).join(', ')}`)
      )
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
    title: '持续时间',
    dataIndex: 'durationTime',
    key: 'durationTime',
    customRender: ({ text }: { text: number | null }) => {
      return text ? `${Math.floor(text / 60)} 分钟` : '无限制'
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

    <Card title="测验动作" style="margin-bottom: 20px;">
        <!-- 如果已经有已安排测验，则在点击时先弹出确认，确认后自动执行: 结束所有活跃测验 -> 清除测验记录 -> 打开创建测验模态 -->
        <template v-if="tests && tests.length > 0">
          <Popconfirm
            title="现在已有测验，确定清除当前测验然后创建新的？"
            ok-text="继续"
            cancel-text="取消"
            @confirm="confirmThenCreate"
          >
            <Button type="primary">▶ 安排新测验</Button>
          </Popconfirm>
        </template>
        <template v-else>
          <Button type="primary" @click="openCreateTestModal">
            ▶ 安排新测验
          </Button>
        </template>
      <Popconfirm title="确定结束所有活跃测验？" @confirm="handleFinishTest">
        <Button danger style="margin-left: 10px;">
          ■ 结束所有活跃测验
        </Button>
      </Popconfirm>
      <Popconfirm title="确定清除测验记录？" @confirm="handleClearAllTests">
        <Button style="margin-left: 10px;">
          X 清除测验记录
        </Button>
      </Popconfirm>
      <Button style="margin-left: 10px;" @click="handleRelayRainbowTest">
        ⚡ 系统自检
      </Button>
    </Card>

    <Card title="连接的客户机" style="margin-bottom: 20px;">
      <ClientTable />
    </Card>

    <Card title="已安排的测验">
      <Table :dataSource="tests" :columns="testColumns" size="small" rowKey="id" :pagination="false" />
    </Card>

    <Modal v-model:open="createTestModalVisible" title="创建测验" @ok="handleCreateTest" width="600px">
      <Form layout="vertical">
        <Form.Item label="选择客户机" required>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <Select v-model:value="formState.clientIds" mode="multiple" placeholder="请选择目标客户机" style="width: 100%">
              <Select.Option v-for="client in clients" :key="client.id" :value="client.id">
          {{ client.name }} ({{ client.ip }})
          <Tag v-if="!client.online" color="red" size="small">离线</Tag>
          <Tag v-else-if="client.testSession?.finishTime" color="green" size="small">已结束</Tag>
          <Tag v-else-if="client.testSession" color="blue" size="small">进行中</Tag>
          <Tag v-else color="green" size="small">可用</Tag>
              </Select.Option>
            </Select>
            <Button type="link" @click="formState.clientIds = clients.map(client => client.id)">
              全选
            </Button>
          </div>
        </Form.Item>

        <Form.Item label="选择题目" required>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <Select v-model:value="formState.questionIds" mode="multiple" placeholder="请选择测验题目" style="width: 100%">
              <Select.Option v-for="question in questions" :key="question.id" :value="question.id">
                {{ question.id }}: {{ question.troubles.map(trouble => trouble.description).join(', ') }}
              </Select.Option>
            </Select>
            <Button type="link" @click="openQuestionManagementModal">
              管理题库
            </Button>
          </div>
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
          <InputNumber v-model:value="formState.durationTime" :min="1" :max="300" placeholder="留空表示无时间限制"
            style="width: 100%" />
        </Form.Item>
      </Form>
    </Modal>

    <!-- Question Management Modal -->
    <Modal v-model:open="questionManagementModalVisible" title="题库管理" width="800px" :footer="null"
      @cancel="handleQuestionManagementClose">
      <QuestionManagement ref="questionManagementRef" />
    </Modal>
  </div>
</template>