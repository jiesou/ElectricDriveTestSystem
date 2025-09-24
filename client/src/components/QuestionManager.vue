<template>
  <div>
    <a-card title="故障库管理" style="margin-bottom: 16px;">
      <a-list :dataSource="faults" bordered>
        <template #renderItem="{ item }">
          <a-list-item>
            <strong>故障 {{ item.id }}:</strong> {{ item.description }}
          </a-list-item>
        </template>
      </a-list>
    </a-card>

    <a-card title="创建测试题目">
      <a-form layout="vertical">
        <a-form-item label="题目数量">
          <a-input-number v-model:value="questionCount" :min="1" :max="10" />
        </a-form-item>
        
        <div v-for="(question, index) in questions" :key="index">
          <h4>第 {{ index + 1 }} 题</h4>
          <a-form-item :label="`选择故障 (题目 ${index + 1})`">
            <a-checkbox-group v-model:value="question.faults" :options="faultOptions" />
          </a-form-item>
        </div>
        
        <a-form-item>
          <a-space>
            <a-button @click="generateQuestions">生成题目</a-button>
            <a-button type="primary" @click="saveQuestionBank" :disabled="!hasValidQuestions">
              保存题库
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
      
      <a-divider />
      
      <h3>题目预览</h3>
      <div v-if="hasValidQuestions">
        <a-card v-for="(question, index) in questions" :key="index" 
                style="margin-bottom: 8px;" size="small">
          <strong>题目 {{ index + 1 }}:</strong>
          <a-tag v-for="faultId in question.faults" :key="faultId" style="margin-left: 8px;">
            故障 {{ faultId }}: {{ getFaultDescription(faultId) }}
          </a-tag>
        </a-card>
      </div>
      <a-empty v-else description="请先生成题目" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'

interface Fault {
  id: number
  description: string
}

interface Question {
  faults: number[]
}

const faults = ref<Fault[]>([])
const questionCount = ref(3)
const questions = ref<Question[]>([])

const faultOptions = computed(() => 
  faults.value.map(f => ({ label: `故障${f.id}: ${f.description}`, value: f.id }))
)

const hasValidQuestions = computed(() => 
  questions.value.length > 0 && questions.value.every(q => q.faults.length > 0)
)

function generateQuestions() {
  questions.value = Array.from({ length: questionCount.value }, () => ({ faults: [] }))
}

function getFaultDescription(faultId: number): string {
  return faults.value.find(f => f.id === faultId)?.description || '未知故障'
}

async function loadFaults() {
  try {
    const response = await fetch('/api/faults')
    if (response.ok) {
      faults.value = await response.json()
    } else {
      message.error('加载故障库失败')
    }
  } catch (error) {
    console.error('Failed to load faults:', error)
    message.error('连接服务器失败')
  }
}

function saveQuestionBank() {
  if (!hasValidQuestions.value) {
    message.warning('请先完成题目设置')
    return
  }
  
  // Store in local storage as a simple question bank
  const questionBank = {
    id: Date.now().toString(),
    name: `题库_${new Date().toLocaleString()}`,
    questions: questions.value,
    createTime: Date.now()
  }
  
  const existingBanks = JSON.parse(localStorage.getItem('questionBanks') || '[]')
  existingBanks.push(questionBank)
  localStorage.setItem('questionBanks', JSON.stringify(existingBanks))
  
  message.success('题库保存成功!')
}

onMounted(() => {
  loadFaults()
  generateQuestions()
})
</script>