<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Table, Tag, Input, message } from 'ant-design-vue'
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons-vue'
import type { Client, Trouble } from '../types'
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
          已提交: {{
            Array.isArray(record.testSession?.solvedTroubles)
              ? record.testSession.solvedTroubles.reduce((acc: number, [, solved]: [number, Trouble[]]) => acc + solved.length, 0)
              : 0
          }} 个
        </div>
      </template>
    </template>
  </Table>
</template>
