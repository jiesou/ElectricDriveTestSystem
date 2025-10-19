<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Card, Popconfirm, Button, Tag, Timeline, Switch, Modal, Spin } from 'ant-design-vue'
import type { Client } from '../types'
import ClientTable from './ClientTable.vue'

const clients = ref<Client[]>([])
const loading = ref(false)
const refreshTimer = ref<number | null>(null)
const showConnectionEvents = ref(false)
const aiAnalysisModal = ref(false)
const aiAnalysisContent = ref('')
const aiAnalysisLoading = ref(false)

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

function getLogColor(action: string): string {
  switch (action) {
    case 'start': return 'blue'
    case 'answer': return 'green'
    case 'navigation': return 'orange'
    case 'finish': return 'red'
    case 'connect': return 'gray'
    case 'disconnect': return 'gray'
    default: return 'default'
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

function handleForgetClients() {
  fetch('/api/clients/forget', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        fetchClients()
      } else {
        alert('操作失败，请稍后重试。')
      }
    })
    .catch(err => {
      console.error('Error forgetting clients:', err)
      alert('操作失败，请稍后重试。')
    })
}

async function handleAIAnalysis(clientId: string) {
  aiAnalysisModal.value = true
  aiAnalysisContent.value = ''
  aiAnalysisLoading.value = true

  try {
    const response = await fetch('/api/generator/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientIds: [clientId],
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6))
            if (json.content) {
              aiAnalysisContent.value += json.content
            } else if (json.error) {
              aiAnalysisContent.value += `\n\n错误: ${json.error}`
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e)
          }
        }
      }
    }
  } catch (error) {
    console.error('AI analysis error:', error)
    aiAnalysisContent.value = `分析失败: ${error}`
  } finally {
    aiAnalysisLoading.value = false
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
  <div>
    <h2>客户机监控</h2>

    <Card title="实时客户机状态">
      <template #extra>
        <Popconfirm title="确定要忘记所有客户机吗？这也将清除客户机的活跃测验进度。" @confirm="handleForgetClients">
          <Button type="primary" danger>忘记所有客户机</Button>
        </Popconfirm>
      </template>
      <ClientTable />
    </Card>


    <!-- 显示已结束的测验 -->
    <div style="margin-top: 20px;" v-if="clients.filter(c => c.testSession && c.testSession.finishTime).length > 0">
      <Card title="已结束的测验">
        <div v-for="client in clients.filter(c => c.testSession && c.testSession.finishTime)"
          :key="`finished-${client.id}`"
          style="margin-bottom: 16px; padding: 12px; border: 1px solid #f0f0f0; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>{{ client.name }} ({{ client.ip }})</strong>
              <Tag :color="client.online ? 'green' : 'gray'" size="small" style="margin-left: 8px;">
                {{ client.online ? '在线' : '离线' }}
              </Tag>
            </div>
            <div style="text-align: right;">
              <Button type="primary" size="small" @click="handleAIAnalysis(client.id)">
                大模型汇总分析
              </Button>
            </div>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            完成时间: {{ formatTime(client.testSession!.finishTime!) }} | 
            用时: {{ Math.floor((client.testSession!.finishTime! - client.testSession!.test.startTime) / 60) }}分钟
            <br>
            分数: {{ client.testSession!.finishedScore }}
            | 日志条数: {{ client.testSession!.logs.length }}
          </div>
        </div>
      </Card>
    </div>

    <!-- AI 分析结果模态框 -->
    <Modal
      v-model:open="aiAnalysisModal"
      title="大模型汇总分析"
      width="800px"
      :footer="null"
    >
      <div v-if="aiAnalysisLoading" style="text-align: center; padding: 40px;">
        <Spin size="large" />
        <p style="margin-top: 16px; color: #666;">AI 正在分析中，请稍候...</p>
      </div>
      <div v-else style="white-space: pre-wrap; line-height: 1.6; max-height: 600px; overflow-y: auto;">
        {{ aiAnalysisContent }}
      </div>
    </Modal>

    <div style="margin-top: 20px;" v-if="clients.filter(c => c.testSession).length > 0">
      <div v-for="client in clients.filter(c => c.testSession)" :key="client.id" style="margin-bottom: 20px;">
        <Card :title="`活跃测验详情 - ${client.name} (${client.ip})`">
          <div v-if="client.testSession">
            <div style="margin-bottom: 16px;">
              <p><strong>开始时间:</strong> {{ formatTime(client.testSession.test.startTime) }}</p>
              <p><strong>连接状态:</strong>
                <Tag style="margin-left: 4px;" :color="client.online ? 'green' : 'red'">
                  {{ client.online ? '在线' : '离线' }}
                </Tag>
              </p>
              <p><strong>当前进度:</strong> 第 {{ client.testSession.currentQuestionIndex + 1 }}/{{
                client.testSession.test.questions.length }} 题</p>
              <div v-if="client.testSession.logs && client.testSession.logs.length > 0">
                <strong>测验日志</strong>
                <Switch v-model:checked="showConnectionEvents" checked-children="显示连接变化" un-checked-children="隐藏连接变化"
                  style="margin-left: 12px;" />
                <Timeline style="margin-top: 12px;">
                  <Timeline.Item
                    v-for="(log, index) in client.testSession.logs.filter(log => showConnectionEvents || (log.action !== 'connect' && log.action !== 'disconnect'))"
                    :key="index" :color="getLogColor(log.action)">
                    <div>
                      <Tag :color="getLogColor(log.action)" size="small">
                        {{ log.action.toUpperCase() }}
                      </Tag>
                      <div style="margin-top: 4px;">
                        <strong v-if="log.action == 'start'">开始测验</strong>
                        <strong v-else-if="log.action == 'finish'">
                          完成测验 得分: {{ log.details.score }}
                        </strong>
                        <strong v-else-if="log.action == 'connect'">连接上服务器</strong>
                        <strong v-else-if="log.action == 'disconnect'">断开了连接</strong>
                        <strong v-else-if="log.action == 'answer'">
                          选择了 <Tag v-if="log.details.trouble">故障{{ log.details.trouble.id }} ({{
                            log.details.trouble.description }})</Tag> - {{ log.details.result ? '正确' : '错误' }}
                        </strong>
                        <strong v-else-if="log.action == 'navigation'">
                          切换到{{ log.details.direction === 'next' ? '下一题' : '上一题' }}
                        </strong>
                        <strong v-else>未知操作</strong>
                      </div>
                      <div style="font-size: 12px; color: #666;">
                        {{ formatTime(log.timestamp) }}
                        <span v-if="index > 0">
                          (经过 {{ (log.timestamp - client.testSession.logs.filter(l => showConnectionEvents || (l.action
                          !== 'connect' && l.action !== 'disconnect'))[index - 1]!.timestamp) }} 秒)
                        </span>
                      </div>
                    </div>
                  </Timeline.Item>
                </Timeline>
              </div>

            </div>
          </div>
        </Card>
      </div>
    </div>

  </div>
</template>