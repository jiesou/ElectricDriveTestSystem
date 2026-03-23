<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { Table, Tag, Input, Select, message } from 'ant-design-vue'
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons-vue'
import type { Client, Question, Trouble } from '../types'
import { apiJson } from '../api-client'

const props = defineProps<{ clients: Client[] }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

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

// CV客户端选项（从所有客户端中收集已知的cvClient）
const cvClientOptions = computed(() => {
  const ips = new Set<string>()
  props.clients.forEach(c => {
    if (c.cvClient?.ip) ips.add(c.cvClient.ip)
  })
  return [
    { value: '', label: '无' },
    ...Array.from(ips).map(ip => ({ value: ip, label: ip }))
  ]
})

// 更新客户端绑定的CV客户端
async function updateCvClient(clientId: string, cvClientIp: string) {
  const ip = cvClientIp || ''
  try {
    await apiJson(`/api/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify({ cvClientIp: ip }),
    })
    message.success(ip ? `已绑定 ${ip}` : '已解绑')
  } catch (err) {
    console.error('Failed to update CV client binding', err)
    message.error('绑定失败')
  }
}

async function saveClientName(clientId: string) {
  const newName = editingNames.value[clientId]
  if (!newName || newName.trim() === '') {
    message.error('名称不能为空')
    return false
  }

  try {
    await apiJson(`/api/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName }),
    })
    emit('refresh')
    editingId.value = null
    message.success('保存成功')
    return true
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

</script>

<template>
  <Table :dataSource="props.clients" :columns="columns" size="middle" rowKey="id" :pagination="false">
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'online'">
        <Tag :color="record.online ? 'green' : 'red'">
          {{ record.online ? '在线' : '离线' }}
        </Tag>
      </template>

      <template v-if="column.key === 'cvClient'">
        <Select
          :value="record.cvClient?.ip || ''"
          :options="cvClientOptions"
          size="small"
          style="width: 140px"
          @change="(val: unknown) => updateCvClient(record.id, String(val || ''))"
        />
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
      </template>
    </template>
  </Table>
</template>
