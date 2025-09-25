<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Table, Button, Modal, Form, Select, message, Space } from 'ant-design-vue'
import type { Trouble, Question } from '../types'

const troubles = ref<Trouble[]>([])
const questions = ref<Question[]>([])
const loading = ref(false)

// Modal state
const modalVisible = ref(false)
const editingQuestion = ref<Question | null>(null)

const formState = reactive({
  troubles: [] as number[]
})

const troubleColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: 'Trouble描述', dataIndex: 'description', key: 'description' }
]

const questionColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { 
    title: '包含troubles', 
    dataIndex: 'troubles', 
    key: 'troubles',
    customRender: ({ record }: { record: Question }) => {
      const troubleDescs = record.troubles.map(trouble => {
        return `${trouble.id}:${trouble.description}`
      })
      return troubleDescs.join(', ')
    }
  },
  {
    title: '操作',
    key: 'action',
    customRender: ({ record }: { record: Question }) => ({
      record
    })
  }
]

async function fetchTroubles() {
  try {
    const response = await fetch('/api/troubles')
    const result = await response.json()
    if (result.success) {
      troubles.value = result.data
    }
  } catch (error) {
    console.error('Failed to fetch troubles:', error)
    message.error('获取故障列表失败')
  }
}

async function fetchQuestions() {
  try {
    loading.value = true
    const response = await fetch('/api/questions')
    const result = await response.json()
    if (result.success) {
      questions.value = result.data
    }
  } catch (error) {
    console.error('Failed to fetch questions:', error)
    message.error('获取题目列表失败')
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  editingQuestion.value = null
  formState.troubles = []
  modalVisible.value = true
}

function openEditModal(question: Question) {
  editingQuestion.value = question
  formState.troubles = question.troubles.map(t => t.id)
  modalVisible.value = true
}

async function handleSubmit() {
  // Note: Question management methods were removed from TestSystemManager
  // Questions should now be managed directly via the manager.questions property
  message.info('题目管理已移至服务端直接操作，前端暂时为只读模式')
}

onMounted(async () => {
  await fetchTroubles()
  await fetchQuestions()
})
</script>

<template>
  <div>
    <h2>题库管理</h2>
    
    <div style="margin-bottom: 20px;">
      <h3>可用trouble列表</h3>
      <Table 
        :dataSource="troubles" 
        :columns="troubleColumns" 
        size="small"
        :pagination="false"
        rowKey="id"
      />
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3>题目列表 (只读模式)</h3>
      <Button type="primary" disabled @click="openAddModal">
        + 添加题目 (已禁用)
      </Button>
    </div>

    <Table 
      :dataSource="questions" 
      :columns="questionColumns" 
      :loading="loading"
      rowKey="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <Space>
            <Button type="link" size="small" disabled @click="openEditModal(record as Question)">
              编辑 (禁用)
            </Button>
            <Button type="link" size="small" disabled danger>
              删除 (禁用)
            </Button>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="modalVisible"
      :title="editingQuestion ? '编辑题目' : '添加题目'"
      @ok="handleSubmit"
    >
      <Form layout="vertical">
        <Form.Item label="选择troubles" required>
          <Select
            v-model:value="formState.troubles"
            mode="multiple"
            placeholder="请选择包含的troubles"
            style="width: 100%"
          >
            <Select.Option 
              v-for="trouble in troubles" 
              :key="trouble.id" 
              :value="trouble.id"
            >
              {{ trouble.id }}: {{ trouble.description }}
            </Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>