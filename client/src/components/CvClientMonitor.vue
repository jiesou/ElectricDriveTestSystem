<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { Card, Tag, Empty } from 'ant-design-vue'
import type { Client } from '../types'
import { useFakeDataMode, generateFakeData } from '../useFakeData'

const clients = ref<Client[]>([])
const loading = ref(false)
const refreshTimer = ref<number | null>(null)
// 跟踪每个CV客户端的图像加载状态
const imageLoadedStates = ref<Record<string, boolean>>({})

// 根据假数据模式返回实际显示的客户端列表
const displayClients = computed(() => {
  if (useFakeDataMode.value) {
    return generateFakeData()
  }
  return clients.value
})

// 获取所有有 CV 客户端的客户机
const cvClients = computed(() => {
  return displayClients.value.filter(c => c.cvClient)
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
  }, 2000) // Refresh every 2 seconds
}

function stopAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
}

function getStreamUrl(cvClientIp: string): string {
  return `/api/cv/stream/${cvClientIp}`
}

function onImageLoad(cvClientIp: string) {
  // MJPEG 流加载第一帧后会触发此事件
  imageLoadedStates.value[cvClientIp] = true
  console.log(`[CvClientMonitor] 图像加载成功: ${cvClientIp}`)
}

function onImageError(cvClientIp: string) {
  imageLoadedStates.value[cvClientIp] = false
  console.error(`[CvClientMonitor] 图像加载失败: ${cvClientIp}`)
}

function isImageLoaded(cvClientIp: string): boolean {
  return imageLoadedStates.value[cvClientIp] === true
}

// 当新的 CV 客户端出现时，设置一个超时来自动隐藏占位符
// 这是为了处理某些浏览器不触发 MJPEG 流 load 事件的情况
function autoHidePlaceholder(cvClientIp: string) {
  setTimeout(() => {
    // 如果 2 秒后还没有触发 load 事件，就假设已经加载成功
    if (!imageLoadedStates.value[cvClientIp]) {
      console.log(`[CvClientMonitor] 自动隐藏占位符: ${cvClientIp}`)
      imageLoadedStates.value[cvClientIp] = true
    }
  }, 2000)
}

function getSessionTypeText(sessionType: string | undefined): string {
  if (!sessionType) return '空闲'
  switch (sessionType) {
    case 'evaluate_wiring':
      return '装接评估'
    case 'face_signin':
      return '人脸签到'
    default:
      return sessionType
  }
}

function getSessionColor(sessionType: string | undefined): string {
  if (!sessionType) return 'default'
  switch (sessionType) {
    case 'evaluate_wiring':
      return 'blue'
    case 'face_signin':
      return 'green'
    default:
      return 'default'
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
  <Card title="实时视觉客户端">
    <div v-if="cvClients.length === 0">
      <Empty description="暂无视觉客户端连接" />
    </div>
    <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 16px;">
      <Card 
        v-for="client in cvClients" 
        :key="client.id"
        size="small"
        :title="`${client.name} - 视觉客户端`"
      >
        <template #extra>
          <Tag :color="getSessionColor(client.cvClient?.session?.type)">
            {{ getSessionTypeText(client.cvClient?.session?.type) }}
          </Tag>
        </template>
        
        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
            <strong>客户机IP:</strong> {{ client.ip }}
          </div>
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
            <strong>视觉客户端IP:</strong> {{ client.cvClient?.ip }}
          </div>
        </div>

        <!-- 图像显示区域 -->
        <div style="position: relative; width: 100%; padding-top: 75%; background: #f0f0f0; border-radius: 4px; overflow: hidden;">
          <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
            <!-- MJPEG 流会自动处理，加载第一帧后就会触发 load 事件 -->
            <img 
              v-if="client.cvClient"
              :src="getStreamUrl(client.cvClient.ip)" 
              alt="实时图像"
              style="width: 100%; object-fit: contain; background: #000;"
              @load="onImageLoad(client.cvClient.ip)"
              @error="onImageError(client.cvClient.ip)"
              @loadstart="autoHidePlaceholder(client.cvClient.ip)"
            />
            <!-- 占位符：摄像头连接中，仅在图像未加载时显示 -->
            <div 
              v-if="client.cvClient && !isImageLoaded(client.cvClient.ip)"
              style="
                position: absolute; 
                top: 0; 
                left: 0; 
                width: 100%; 
                height: 100%; 
                display: flex; 
                align-items: center; 
                justify-content: center;
                background: #fafafa;
                color: #999;
                font-size: 14px;
                z-index: 1;
              "
            >
              摄像头连接中...
            </div>
          </div>
        </div>

        <!-- 会话信息 -->
        <div v-if="client.cvClient?.session" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">
          <div style="font-size: 12px; color: #666;">
            <strong>当前会话:</strong> {{ getSessionTypeText(client.cvClient.session.type) }}
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            <strong>开始时间:</strong> {{ new Date(client.cvClient.session.startTime * 1000).toLocaleString() }}
          </div>
        </div>
      </Card>
    </div>
  </Card>
</template>
