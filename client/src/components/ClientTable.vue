<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { Table, Tag, Input, message } from 'ant-design-vue'
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons-vue'
import type { Client } from '../types'
import { useMockDataService, generateMockData } from '../useMockData'

const clients = ref<Client[]>([])
const loading = ref<boolean | { delay: number }>(false)
const refreshTimer = ref<number | null>(null)

// 根据模拟数据模式返回实际显示的客户端列表
const displayClients = computed(() => {
  if (useMockDataService.value) {
    return generateMockData()
  }
  return clients.value
})

const columns = [
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
    title: '关联视觉客户端',
    key: 'cvClient'
  },
  {
    title: '在线状态',
    key: 'online'
  },
  {
    title: '测验状态',
    key: 'testStatus'
  }
]

// local editable state map: clientId -> editing name
const editingNames = ref<Record<string, string>>({})
const editingId = ref<string | null>(null)

async function saveClientName(clientId: string) {
  const newName = editingNames.value[clientId]
  if (!newName || newName.trim() === '') {
    message.error('名称不能为空')
    return false
  }

  try {
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    const json = await res.json()
    if (json.success) {
      // update local list
      const idx = clients.value.findIndex((c) => c.id === clientId)
    if (idx !== -1 && clients.value[idx]) clients.value[idx].name = newName
      editingId.value = null
      message.success('保存成功')
      return true
    } else {
      message.error(json.error || '保存失败')
      return false
    }
  } catch (err) {
    console.error('Failed to save client name', err)
    message.error('保存失败')
    return false
  }
}

function startEdit(record: any) {
  editingNames.value[record.id] = record.name || ''
  editingId.value = record.id
  nextTick(() => {
    const input = document.querySelector(`input[value="${editingNames.value[record.id]}"]`) as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

async function fetchClients() {
  try {
    loading.value = { delay: 2000 }
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
  }, 1000) // Fixed to 1000ms as requested
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
  <Table :dataSource="displayClients" :columns="columns" :loading="loading" size="middle" rowKey="id" :pagination="false">
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'online'">
        <Tag :color="record.online ? 'green' : 'red'">
          {{ record.online ? '在线' : '离线' }}
        </Tag>
      </template>

      <template v-if="column.key === 'cvClient'">
        <span v-if="record.cvClient">{{ record.cvClient.ip }}</span>
        <span v-else style="color: #999;">无</span>
      </template>

      <template v-if="column.key === 'name'">
        <div style="display:flex;align-items:center;gap:8px">
          <template v-if="editingId === record.id">
            <!--
              - 按 Enter 调用 saveClientName 保存当前名字
              - 按 Esc 取消编辑（退出编辑模式）
            -->
            <Input
              v-model:value="editingNames[record.id]"
              size="small"
              style="width: 200px"
              @keydown.enter.prevent="saveClientName(record.id)"
              @keydown.esc.prevent="editingId = null"
            />
            <CheckOutlined @click="saveClientName(record.id)" />
            <CloseOutlined @click="editingId = null" />
          </template>
          <template v-else>
            <div style="min-width:200px">{{ record.name }}</div>
            <EditOutlined @click="startEdit(record)" />
          </template>
        </div>
      </template>

      <template v-if="column.key === 'testStatus'">
        <Tag v-if="!record.online" color="red" size="small">离线</Tag>
        <Tag v-else-if="record.testSession?.finishTime" color="green" size="small">已结束</Tag>
        <Tag v-else-if="record.testSession" color="blue" size="small">进行中</Tag>
        <Tag v-else color="green" size="small">可用</Tag>
        <div v-if="record.testSession" style="margin-top: 4px; font-size: 12px; color: #666;">
          第 {{ record.testSession.currentQuestionIndex + 1 }}/{{ record.testSession.test.questions.length }} 题
        </div>
      </template>
    </template>
  </Table>
</template>