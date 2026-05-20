<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Table, message } from 'ant-design-vue'
import type { Trouble } from '../types'
import QuestionManagement from './QuestionManagement.vue'
import { apiJson } from '../api-client'

const troubles = ref<Trouble[]>([])
const loading = ref(false)

const troubleColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '起始线号', dataIndex: 'from_wire', key: 'from_wire' },
  { title: '结束线号', dataIndex: 'to_wire', key: 'to_wire' }
]

async function fetchTroubles() {
  try {
    loading.value = true
    troubles.value = await apiJson<Trouble[]>('/api/troubles')
  } catch (error) {
    console.error('Failed to fetch troubles:', error)
    message.error('获取故障列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchTroubles()
})
</script>

<template>
  <div>
    <h2>题库管理</h2>

    <div style="display:flex; gap:20px; align-items:flex-start;">
      <img   alt="示意图" style="width:60%; height:auto; object-fit:contain;" />

      <div style="flex:1;">
        <div style="margin-bottom: 20px;">
          <h3>可用故障列表</h3>
          <Table 
            :dataSource="troubles" 
            :columns="troubleColumns" 
            size="small"
            :pagination="false"
            rowKey="id"
            :loading="loading"
          />
        </div>

      </div>
    </div>
    <QuestionManagement />
  </div>
</template>
