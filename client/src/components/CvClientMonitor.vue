<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, h } from 'vue'
import { Card, Tag, Empty, Button } from 'ant-design-vue'
import type { Client, CvClient, EvaluateWiringSession, FaceSigninSession } from '../types'
import { useFakeDataMode, generateFakeData } from '../useFakeData'
import { CloseOutlined } from '@ant-design/icons-vue';

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

// 类型守卫函数
function isEvaluateWiringSession(session: any): session is EvaluateWiringSession {
  return session?.type === 'evaluate_wiring'
}

function isFaceSigninSession(session: any): session is FaceSigninSession {
  return session?.type === 'face_signin'
}

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
  <Card title="实时视觉客户端">
    <div v-if="cvClients.length === 0">
      <Empty description="暂无视觉客户端连接" />
    </div>
    <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, 600px); gap: 16px;">
      <Card v-for="client in cvClients" :key="client.id" size="small" :title="`${client.name} - 视觉客户端`">
              <template #extra>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <Tag :color="getSessionColor(client.cvClient?.session?.type)">
                    {{ getSessionTypeText(client.cvClient?.session?.type) }}
                  </Tag>
                  <!-- 如果存在会话，显示叉叉按钮用于删除会话 -->
                  <Button  v-if="client.cvClient?.session" danger shape="circle" @click="clearSession(client.cvClient)" :icon="h(CloseOutlined)">
                  </Button>
                </div>
              </template>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
            <strong>IP:</strong> {{ client.cvClient?.ip }}
          </div>
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
            <strong>关联客户机IP:</strong> {{ client.ip }}
          </div>

          <!-- 图像显示区域 -->
          <div
            style="position: relative; width: 100%; background: #f0f0f0; border-radius: 4px; overflow: hidden; min-height: 160px;">
            <!-- MJPEG 流会自动处理，加载第一帧后就会触发 load 事件 -->
            <img v-if="client.cvClient" :src="getStreamUrl(client.cvClient.ip)" alt="实时图像"
              style="width: 100%; object-fit: contain; background: #000;" @load="onImageLoad(client.cvClient.ip)"
              @error="onImageError(client.cvClient.ip)" @loadstart="autoHidePlaceholder(client.cvClient.ip)" />
            <!-- 占位符：摄像头连接中，仅在图像未加载时显示 -->
            <div v-if="client.cvClient && !isImageLoaded(client.cvClient.ip)" style="
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
              ">
              视觉连接中...
            </div>
          </div>
        </div>

        <!-- 会话信息 -->
        <div v-if="client.cvClient?.session"
          style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">
          <div style="font-size: 12px; color: #666;">
            <strong>当前会话:</strong> {{ getSessionTypeText(client.cvClient.session.type) }}
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            <strong>开始时间:</strong> {{ new Date(client.cvClient.session.startTime * 1000).toLocaleString() }}
          </div>

          <!-- 装接评估会话详情 -->
          <div v-if="isEvaluateWiringSession(client.cvClient.session)" style="margin-top: 8px;">
            <div v-if="!client.cvClient.session.finalResult" style="font-size: 12px; color: #1890ff;">
              📸 拍摄采集中... (已拍摄 {{ client.cvClient.session.shots?.length || 0 }} 张)
            </div>

            <!-- 显示拍摄的图像 -->
            <div v-if="client.cvClient.session.shots && client.cvClient.session.shots.length > 0"
              style="margin-top: 8px;">
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                <strong>拍摄记录:</strong>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, 600px); gap: 8px;">
                <div v-for="(shot, idx) in client.cvClient.session.shots" :key="idx"
                  style="border: 1px solid #d9d9d9; border-radius: 4px; overflow: hidden;">
                  <img v-if="shot.image" :src="shot.image" :alt="`拍摄 ${idx + 1}`"
                    style="width: 100%; object-fit: contain; background: #000; display: block;" />
                  <div style="padding: 4px; font-size: 11px; background: #fafafa;">
                    <div>🏷️ 标记号码管: {{ shot.result.sleeves_num }}</div>
                    <div>❌ 交叉: {{ shot.result.cross_num }}</div>
                    <div>🔶 露铜: {{ shot.result.excopper_num }}</div>
                    <div>📌 露端子: {{ shot.result.exterminal_num }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="client.cvClient.session.finalResult" style="font-size: 12px; margin-top: 8px;">
              <div style="color: #52c41a; margin-bottom: 4px;"><strong>✅ 评估完成</strong></div>
              <div style="color: #666; margin-top: 4px;">
                <strong>得分:</strong> {{ client.cvClient.session.finalResult.scores }} 分
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>未标号码管:</strong> {{ client.cvClient.session.finalResult.no_sleeves_num }} 个
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>交叉接线:</strong> {{ client.cvClient.session.finalResult.cross_num }} 处
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>露铜:</strong> {{ client.cvClient.session.finalResult.excopper_num }} 处
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>露端子:</strong> {{ client.cvClient.session.finalResult.exterminal_num }} 处
              </div>
            </div>
          </div>

          <!-- 人脸签到会话详情 -->
          <div v-if="isFaceSigninSession(client.cvClient.session)" style="margin-top: 8px;">
            <div v-if="!client.cvClient.session.finalResult" style="font-size: 12px; color: #1890ff;">
              👤 人脸识别中...
            </div>
            <div v-else style="font-size: 12px;">
              <div style="color: #52c41a; margin-bottom: 4px;"><strong>✅ 识别完成</strong></div>
              <div style="color: #666; margin-top: 4px;">
                <strong>识别为:</strong> {{ client.cvClient.session.finalResult.who }}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </Card>
</template>
