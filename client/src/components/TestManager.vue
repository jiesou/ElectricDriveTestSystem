<template>
  <div>
    <a-row :gutter="16">
      <!-- Test Creation -->
      <a-col :span="12">
        <a-card title="创建测试">
          <a-form layout="vertical">
            <a-form-item label="选择题库">
              <a-select v-model:value="selectedQuestionBank" placeholder="请选择题库">
                <a-select-option v-for="bank in questionBanks" :key="bank.id" :value="bank.id">
                  {{ bank.name }}
                </a-select-option>
              </a-select>
            </a-form-item>
            
            <a-form-item label="选择客户端">
              <a-checkbox-group v-model:value="selectedClients" :options="clientOptions" />
            </a-form-item>
            
            <a-form-item>
              <a-space>
                <a-button type="primary" @click="createTest" :disabled="!canCreateTest">
                  创建测试
                </a-button>
                <a-button @click="refreshData">刷新数据</a-button>
              </a-space>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>
      
      <!-- Active Tests -->
      <a-col :span="12">
        <a-card title="当前测试" :extra="`活跃测试: ${activeTests.length}`">
          <div v-if="activeTests.length === 0">
            <a-empty description="暂无活跃测试" />
          </div>
          
          <div v-for="test in activeTests" :key="test.testId">
            <a-card size="small" style="margin-bottom: 8px;">
              <template #title>
                测试 {{ test.testId.slice(-6) }}
              </template>
              
              <template #extra>
                <a-space>
                  <a-tag :color="getTestStatusColor(test.status)">
                    {{ getTestStatusText(test.status) }}
                  </a-tag>
                  <a-button 
                    size="small" 
                    type="primary"
                    @click="startTest(test.testId)"
                    :disabled="test.status !== 'pending'"
                  >
                    开始
                  </a-button>
                  <a-button 
                    size="small"
                    @click="showTestDetails(test)"
                  >
                    详情
                  </a-button>
                </a-space>
              </template>
              
              <p><strong>客户端:</strong> {{ test.clients.length }} 台</p>
              <p><strong>题目:</strong> {{ test.currentQuestionIndex + 1 }} / {{ getTotalQuestions(test.testId) }}</p>
              <p><strong>开始时间:</strong> {{ formatTime(test.startTime) }}</p>
            </a-card>
          </div>
        </a-card>
      </a-col>
    </a-row>
    
    <!-- Test Details Modal -->
    <a-modal
      v-model:open="detailsModalVisible"
      :title="`测试详情 - ${selectedTest?.testId.slice(-6)}`"
      width="1000px"
      :footer="null"
    >
      <div v-if="selectedTest && testDetails">
        <a-descriptions bordered>
          <a-descriptions-item label="测试ID">{{ selectedTest.testId }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="getTestStatusColor(selectedTest.status)">
              {{ getTestStatusText(selectedTest.status) }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="当前题目">
            {{ selectedTest.currentQuestionIndex + 1 }} / {{ getTotalQuestions(selectedTest.testId) }}
          </a-descriptions-item>
        </a-descriptions>
        
        <a-divider />
        
        <h3>客户端答题状态</h3>
        <a-table 
          :columns="clientStatusColumns"
          :dataSource="testDetails.clients"
          :pagination="false"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'answers'">
              <a-tag v-for="answer in record.answers" :key="answer.questionId" color="green">
                {{ answer.questionId }}: {{ answer.answeredFaults.length }} 个故障
              </a-tag>
            </template>
          </template>
        </a-table>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'

interface QuestionBank {
  id: string
  name: string
  questions: { faults: number[] }[]
  createTime: number
}

interface Client {
  id: string
  ip: string
  currentTest?: string
  logCount: number
}

interface TestSession {
  testId: string
  clients: string[]
  currentQuestionIndex: number
  startTime: number
  status: 'pending' | 'active' | 'completed'
}

interface TestDetails {
  session: TestSession
  clients: {
    id: string
    ip: string
    answers: { questionId: string; answeredFaults: number[]; timestamp: number }[]
    logCount: number
  }[]
}

const questionBanks = ref<QuestionBank[]>([])
const clients = ref<Client[]>([])
const activeTests = ref<TestSession[]>([])
const selectedQuestionBank = ref<string>()
const selectedClients = ref<string[]>([])
const detailsModalVisible = ref(false)
const selectedTest = ref<TestSession | null>(null)
const testDetails = ref<TestDetails | null>(null)

const clientOptions = computed(() => 
  clients.value
    .filter(c => !c.currentTest)
    .map(c => ({ label: `${c.id} (${c.ip})`, value: c.id }))
)

const canCreateTest = computed(() => 
  selectedQuestionBank.value && selectedClients.value.length > 0
)

const clientStatusColumns = [
  { title: '客户端ID', dataIndex: 'id', key: 'id' },
  { title: 'IP地址', dataIndex: 'ip', key: 'ip' },
  { title: '已答题目', key: 'answers' },
  { title: '日志条数', dataIndex: 'logCount', key: 'logCount' }
]

function getTestStatusColor(status: string): string {
  switch (status) {
    case 'pending': return 'orange'
    case 'active': return 'processing'
    case 'completed': return 'success'
    default: return 'default'
  }
}

function getTestStatusText(status: string): string {
  switch (status) {
    case 'pending': return '等待开始'
    case 'active': return '进行中'
    case 'completed': return '已完成'
    default: return '未知'
  }
}

function getTotalQuestions(_testId: string): number {
  // This is a simplified approach - in a real app you'd store test definitions
  return 3 // Default to 3 questions
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleString()
}

async function refreshData() {
  await Promise.all([loadQuestionBanks(), loadClients(), loadActiveTests()])
}

function loadQuestionBanks() {
  const banks = JSON.parse(localStorage.getItem('questionBanks') || '[]')
  questionBanks.value = banks
}

async function loadClients() {
  try {
    const response = await fetch('/api/clients')
    if (response.ok) {
      clients.value = await response.json()
    }
  } catch (error) {
    console.error('Failed to load clients:', error)
  }
}

async function loadActiveTests() {
  // This is simplified - in a real app you'd have an endpoint to list active tests
  // For now, we'll just show empty array
  activeTests.value = []
}

async function createTest() {
  if (!canCreateTest.value) return
  
  const selectedBank = questionBanks.value.find(b => b.id === selectedQuestionBank.value)
  if (!selectedBank) return
  
  try {
    const response = await fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questions: selectedBank.questions,
        clientIds: selectedClients.value
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      message.success(`测试创建成功! ID: ${result.testId}`)
      
      // Add to active tests
      activeTests.value.push({
        testId: result.testId,
        clients: selectedClients.value,
        currentQuestionIndex: 0,
        startTime: Math.floor(Date.now() / 1000),
        status: 'pending'
      })
      
      // Reset form
      selectedClients.value = []
      await loadClients() // Refresh to update client status
    } else {
      message.error('创建测试失败')
    }
  } catch (error) {
    console.error('Failed to create test:', error)
    message.error('连接服务器失败')
  }
}

async function startTest(testId: string) {
  try {
    const response = await fetch(`/api/test/${testId}/start`, {
      method: 'POST'
    })
    
    if (response.ok) {
      message.success('测试已开始!')
      const test = activeTests.value.find(t => t.testId === testId)
      if (test) {
        test.status = 'active'
      }
    } else {
      message.error('启动测试失败')
    }
  } catch (error) {
    console.error('Failed to start test:', error)
    message.error('连接服务器失败')
  }
}

async function showTestDetails(test: TestSession) {
  selectedTest.value = test
  detailsModalVisible.value = true
  
  try {
    const response = await fetch(`/api/test/${test.testId}/status`)
    if (response.ok) {
      testDetails.value = await response.json()
    }
  } catch (error) {
    console.error('Failed to load test details:', error)
    message.error('加载测试详情失败')
  }
}

onMounted(() => {
  refreshData()
})
</script>