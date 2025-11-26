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

        <!-- 图像显示区域 -->
        <div
          style="position: relative; width: 100%; background: #f0f0f0; border-radius: 4px; overflow: hidden; min-height: 160px;">
          <!-- MJPEG 流会自动处理，加载第一帧后就会触发 load 事件 -->
          <img v-if="client.cvClient" :src="`/api/cv/stream/${client.cvClient.ip}`"
            style="width: 100%; object-fit: contain; background: #000;"
            @load="() => { if (client.cvClient) { setImageLoaded(client.cvClient.ip, true) } }" />
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
              ">
            视觉连接中...
          </div>
        </div>
        <!-- 会话信息 -->
        <div v-if="client.cvClient?.session"
          style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            <strong>开始时间:</strong> {{ new Date(client.cvClient.session.startTime * 1000).toLocaleString() }}
          </div>

          <!-- 装接评估会话详情 -->
          <div v-if="client.cvClient.session.type === 'evaluate_wiring'" style="margin-top: 8px;">
            <div v-if="!client.cvClient.session.finalResult" style="font-size: 12px; color: #1890ff;">
              拍摄采集中... (已拍摄 {{ client.cvClient.session.shots?.length || 0 }} 张)
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
                    <div>标记号码管: {{ shot.result.sleeves_num }}</div>
                    <div>交叉: {{ shot.result.cross_num }}</div>
                    <div>露铜: {{ shot.result.excopper_num }}</div>
                    <div>露端子: {{ shot.result.exterminal_num }}</div>
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
        </div>

      </Card>
    </div>
  </Card>
</template>