<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Table } from 'ant-design-vue'
import type { Trouble } from '../types'
import QuestionManagement from './QuestionManagement.vue'

// 使用 Vite 兼容的方式获取静态资源路径
const sch = new URL('../assets/sch.png', import.meta.url).href

const troubles = ref<Trouble[]>([])

const troubleColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '起始线号', dataIndex: 'from_wire', key: 'from_wire' },
  { title: '结束线号', dataIndex: 'to_wire', key: 'to_wire' }
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
      <img :src="sch" alt="示意图" style="width:60%; height:auto; object-fit:contain;" />

      <div style="flex:1;">
        <div style="margin-bottom: 20px;">
          <h3>可用故障列表</h3>
          <Table 
            :dataSource="troubles" 
            :columns="troubleColumns" 
            size="small"
            :pagination="false"
            rowKey="id"
          />
        </div>

      </div>
    </div>
    <QuestionManagement />
  </div>
</template>