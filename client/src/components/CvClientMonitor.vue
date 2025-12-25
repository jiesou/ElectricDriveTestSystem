<script setup lang="ts">
import { computed, h } from 'vue'
import { Card, Tag, Empty, Button, message } from 'ant-design-vue'
import type { Client, CvClient } from '../types'
import { CloseOutlined } from '@ant-design/icons-vue'
import { apiJson } from '../api-client'

const props = defineProps<{ clients: Client[] }>()
const displayCvClients = computed(() => props.clients.filter(c => c.cvClient))

async function clearSession(cvClient: CvClient) {
  if (!cvClient) return
  try {
    await apiJson(`/api/cv/clear_session/${cvClient.ip}`, { method: 'POST' })
    message.success('已清除会话')
  } catch (error) {
    console.error('[CvClientMonitor] 清除会话请求失败:', error)
  }
}
</script>

<template>
  <Card title="实时视觉客户端">
    <div v-if="displayCvClients.length === 0">
      <Empty description="暂无视觉客户端连接" />
    </div>
    <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;">
      <Card v-for="client in displayCvClients" :key="client.id" size="small" :title="`${client.name} - 视觉客户端`">
        <template #extra>
          <div style="display: flex; align-items: center; gap: 8px;">
            <Tag v-if="client.cvClient?.session?.type == 'evaluate_wiring'" color="blue">
              装接评估
            </Tag>
            <Tag v-else-if="client.cvClient?.session?.type == 'face_signin'" color="green">
              人脸签到
            </Tag>
            <Tag v-else color="gray">
              空闲
            </Tag>
            <!-- 如果存在会话，显示叉叉按钮用于删除会话 -->
            <Button v-if="client.cvClient?.session" danger shape="circle" @click="clearSession(client.cvClient)"
              :icon="h(CloseOutlined)">
            </Button>
          </div>
        </template>

        <strong>IP:</strong> {{ client.cvClient?.ip }} <br />
        <strong>关联客户机IP:</strong> {{ client.ip }}

        <!-- 图像显示区域 -->
        <img
          v-if="client.cvClient"
          :src="`/api/cv/stream/${client.cvClient.ip}`"
          style="width: 100%; height: 240px; object-fit: contain; background:#f6f6f6;"
        />

      </Card>
    </div>
  </Card>
</template>
