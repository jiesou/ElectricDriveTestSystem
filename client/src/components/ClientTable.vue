<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Table, Tag } from 'ant-design-vue'
import type { Client } from '../types'

interface Props {
  refreshInterval?: number // refresh interval in milliseconds, defaults to 2000
  tableSize?: 'small' | 'middle' | 'large'
  showClientName?: boolean // whether to show client name column, defaults to false
}

const props = withDefaults(defineProps<Props>(), {
  refreshInterval: 2000,
  tableSize: 'middle',
  showClientName: false
})

const clients = ref<Client[]>([])
const loading = ref(false)
const refreshTimer = ref<number | null>(null)

// Define columns based on props
const columns = computed(() => {
  const baseColumns = []
  
  if (props.showClientName) {
    baseColumns.push({
      title: '客户机名称',
      dataIndex: 'name',
      key: 'name'
    })
  }
  
  baseColumns.push(
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip'
    },
    {
      title: '在线状态',
      key: 'online',
      customRender: ({ record }: { record: Client }) => ({ record })
    },
    {
      title: '测验状态',
      key: 'testStatus',
      customRender: ({ record }: { record: Client }) => ({
        hasSession: !!record.testSession,
        session: record.testSession
      })
    }
  )
  
  return baseColumns
})

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
  }, props.refreshInterval)
}

function stopAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
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
  <Table 
    :dataSource="clients" 
    :columns="columns" 
    :loading="loading" 
    :size="tableSize"
    rowKey="id" 
    :pagination="false"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'online'">
        <Tag :color="record.online ? 'green' : 'red'">
          {{ record.online ? '在线' : '离线' }}
        </Tag>
      </template>

      <template v-if="column.key === 'testStatus'">
        <Tag :color="record.testSession ? (record.testSession.finishTime ? 'red' : 'blue') : 'default'">
          {{ record.testSession ? (record.testSession.finishTime ? '已结束' : '进行中') : '空闲' }}
        </Tag>
        <div v-if="record.testSession" style="margin-top: 4px; font-size: 12px; color: #666;">
          第 {{ record.testSession.currentQuestionIndex + 1 }}/{{ record.testSession.test.questions.length }} 题
          <span v-if="record.testSession.test.durationTime">
            (限时{{ Math.floor(record.testSession.test.durationTime / 60) }}分钟)
          </span>
        </div>
      </template>
    </template>
  </Table>
</template>