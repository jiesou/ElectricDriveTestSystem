<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, h } from 'vue'
import { Card, Tag, Empty, Button } from 'ant-design-vue'
import type { Client, CvClient } from '../types'
import { CloseOutlined } from '@ant-design/icons-vue';

const clients = ref<Client[]>([])
const loading = ref(false)
const refreshTimer = ref<number | null>(null)
function startAutoRefresh() {
  refreshTimer.value = window.setInterval(() => {
    fetchClients()
  }, 2000) // Refresh every 2 seconds
}
function stopAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
}
// 跟踪每个CV客户端的图像加载状态
const imageLoaded = ref<Record<string, boolean>>({})
function isImageLoaded(ip: string | undefined): boolean {
  return ip && imageLoaded.value[ip] || false
}
function setImageLoaded(ip: string, loaded: boolean) {
  imageLoaded.value[ip] = loaded
}

// 获取所有有 CV 客户端的客户机
const cvClients = computed(() => {
  return clients.value.filter(c => c.cvClient)
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

// 清除指定 CV 客户端的会话（由页面上的叉叉触发）
async function clearSession(cvClient: CvClient) {
  if (!cvClient) return
  try {
    const resp = await fetch(`/api/cv/clear_session/${cvClient.ip}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const result = await resp.json()
    if (result && result.success) {
      // 刷新客户端列表以反映变化
      await fetchClients()
    } else {
      console.error('[CvClientMonitor] 清除会话失败:', result)
      window.alert(result?.error || '清除会话失败')
    }
  } catch (error) {
    console.error('[CvClientMonitor] 清除会话请求失败:', error)
    window.alert('请求失败')
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
  <Card title="实时视觉客户端" style="display: none">
    <div v-if="cvClients.length === 0">
      <Empty description="暂无视觉客户端连接" />
    </div>
    <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, 600px); gap: 16px;">
      <Card v-for="client in cvClients" :key="client.id" size="small" :title="`${client.name} - 视觉客户端`">
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

        

      </Card>
    </div>
  </Card>
</template>