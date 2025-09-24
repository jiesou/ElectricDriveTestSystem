<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Badge } from 'ant-design-vue'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

const status = ref<ConnectionStatus>('disconnected')
const socket = ref<WebSocket | null>(null)
const reconnectTimer = ref<number | null>(null)

const statusConfig = {
  connecting: { text: '连接中', status: 'processing' as const },
  connected: { text: '已连接', status: 'success' as const },
  disconnected: { text: '未连接', status: 'default' as const },
  error: { text: '连接错误', status: 'error' as const }
}

function connect() {
  if (socket.value?.readyState === WebSocket.OPEN) {
    return
  }

  status.value = 'connecting'
  
  try {
    const wsUrl = `ws://${window.location.host}/ws`
    socket.value = new WebSocket(wsUrl)

    socket.value.onopen = () => {
      status.value = 'connected'
      console.log('WebSocket connected')
    }

    socket.value.onclose = () => {
      status.value = 'disconnected'
      console.log('WebSocket disconnected')
      // Auto reconnect after 3 seconds
      reconnectTimer.value = window.setTimeout(() => {
        connect()
      }, 3000)
    }

    socket.value.onerror = (error) => {
      status.value = 'error'
      console.error('WebSocket error:', error)
    }

    socket.value.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        console.log('WebSocket message:', message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }
  } catch (error) {
    status.value = 'error'
    console.error('Failed to create WebSocket connection:', error)
  }
}

function disconnect() {
  if (reconnectTimer.value) {
    clearTimeout(reconnectTimer.value)
    reconnectTimer.value = null
  }
  
  if (socket.value) {
    socket.value.close()
    socket.value = null
  }
  
  status.value = 'disconnected'
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
})

// Export socket for use in other components
defineExpose({
  socket: socket,
  status: status,
  connect,
  disconnect
})
</script>

<template>
  <div style="display: flex; align-items: center; gap: 8px;">
    <Badge 
      :status="statusConfig[status].status" 
      :text="statusConfig[status].text"
    />
  </div>
</template>