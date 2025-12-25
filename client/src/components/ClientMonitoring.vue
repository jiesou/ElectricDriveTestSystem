<script setup lang="ts">
import { ref, h, computed } from 'vue'
import { Card, Popconfirm, Button, Tag, Timeline, Switch, message } from 'ant-design-vue'
import { AimOutlined } from '@ant-design/icons-vue'
import type { Client } from '../types'
import { formatTime } from '../types'
import ClientTable from './ClientTable.vue'
import CvClientMonitor from './CvClientMonitor.vue'
import AIAnalysisModal from './AIAnalysisModal.vue'
import { apiJson } from '../api-client'

const props = defineProps<{ clients: Client[] }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const showConnectionEvents = ref(false)
const aiAnalysisModal = ref(false)
const currentAnalysisClientId = ref<string | undefined>(undefined)

const finishedTests = computed(() => props.clients.filter(c => c.testSession && c.testSession.finishTime))
const finishedEvaluateBoards = computed(() => props.clients.filter(c => c.evaluateBoard && c.evaluateBoard.function_steps.every(s => s.finished)))
const activeTestClients = computed(() => props.clients.filter(c => c.testSession))
const evaluateBoards = computed(() => props.clients.filter(c => c.evaluateBoard))

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

async function handleForgetClients() {
  try {
    await apiJson('/api/clients/forget', { method: 'POST' })
    emit('refresh')
  } catch (err) {
    console.error('Error forgetting clients:', err)
    message.error('操作失败，请稍后重试。')
  }
}

function handleAIAnalysis(clientId: string) {
  currentAnalysisClientId.value = clientId
  aiAnalysisModal.value = true
}

function pickLogs(session: Client['testSession']) {
  const logs = session?.logs || []
  return showConnectionEvents.value ? logs : logs.filter(log => log.action !== 'connect' && log.action !== 'disconnect')
}
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
      <ClientTable :clients="props.clients" />
    </Card>

    <!-- 实时视觉客户端 -->
    <div style="margin-top: 20px;">
      <CvClientMonitor :clients="props.clients" />
    </div>


    <!-- 显示已结束的测验 -->
    <div style="margin-top: 20px;" v-if="finishedTests.length > 0">
      <Card title="已结束的测验">
        <div
          v-for="client in finishedTests"
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
              <Button type="primary" size="small" :icon="h(AimOutlined)" @click="handleAIAnalysis(client.id)">
                DeepSeek 汇总分析
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
    <AIAnalysisModal v-model:open="aiAnalysisModal" :client-id="currentAnalysisClientId" />

    <!-- 已结束的装接评估 -->
    <div style="margin-top: 20px;" v-if="finishedEvaluateBoards.length > 0">
      <Card title="已结束的装接评估">
        <div
          v-for="client in finishedEvaluateBoards"
          :key="`finished-eval-${client.id}`"
          style="margin-bottom: 16px; padding: 12px; border: 1px solid #f0f0f0; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>{{ client.name }} ({{ client.ip }})</strong>
              <Tag :color="client.online ? 'green' : 'gray'" size="small" style="margin-left: 8px;">
                {{ client.online ? '在线' : '离线' }}
              </Tag>
            </div>
            <div style="text-align: right;">
              <Button type="primary" size="small" :icon="h(AimOutlined)" @click="handleAIAnalysis(client.id)">
                DeepSeek 汇总分析
              </Button>
            </div>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">
            评估板: {{ client.evaluateBoard!.description }}
            <br>
            完成步骤: {{ client.evaluateBoard!.function_steps.filter(s => s.finished).length }}/{{ client.evaluateBoard!.function_steps.length }}
            | 功能实现: {{ client.evaluateBoard!.function_steps.filter(s => s.passed).length }}/{{ client.evaluateBoard!.function_steps.length }}
            <span v-if="client.cvClient && client.cvClient.session">
              <br>
              视觉评估: {{ client.cvClient.session.type === 'evaluate_wiring' ? '装接评估' : '人脸签到' }}
              <span v-if="client.cvClient.session.type === 'evaluate_wiring' && client.cvClient.session.finalResult">
                | 评分: {{ client.cvClient.session.finalResult.scores }}
              </span>
            </span>
          </div>
        </div>
      </Card>
    </div>

    <div style="margin-top: 20px;" v-if="activeTestClients.length > 0">
      <div v-for="client in activeTestClients" :key="client.id" style="margin-bottom: 20px;">
        <Card :title="`活跃测验详情 - ${client.name} (${client.ip})`">
          <div v-if="client.testSession">
            <div style="margin-bottom: 16px;">
              <p><strong>开始时间:</strong> {{ formatTime(client.testSession.test.startTime) }}</p>
              <p><strong>已提交:</strong> {{
                client.testSession.test.questions.reduce((acc, q) => acc + q.troubles.filter(t => t.is_submitted).length, 0)
              }} 个</p>
              <div v-if="pickLogs(client.testSession).length > 0">
                <strong>测验日志</strong>
                <Switch v-model:checked="showConnectionEvents" checked-children="显示连接变化" un-checked-children="隐藏连接变化"
                  style="margin-left: 12px;" />
                <Timeline style="margin-top: 12px;">
                  <Timeline.Item
                    v-for="(log, index) in pickLogs(client.testSession)"
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
                        <strong v-else>未知操作</strong>
                      </div>
                      <div style="font-size: 12px; color: #666;">
                        {{ formatTime(log.timestamp) }}
                        <span v-if="index > 0">
                          (经过 {{
                            (log.timestamp - (pickLogs(client.testSession)[index - 1]?.timestamp || log.timestamp))
                          }} 秒)
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

    <!-- 装接评估详情 -->
    <div style="margin-top: 20px;" v-if="evaluateBoards.length > 0">
      <div v-for="client in evaluateBoards" :key="`eval-${client.id}`"
        style="margin-bottom: 20px;">

      <Card v-if="client.evaluateBoard" :title="`装接评估详情 - ${client.name} (${client.ip})`">
        <p><strong>评估板:</strong> {{ client.evaluateBoard.description }}</p>
        <p><strong>连接状态:</strong>
          <Tag style="margin-left: 4px;" :color="client.online ? 'green' : 'red'">
            {{ client.online ? '在线' : '离线' }}
          </Tag>
        </p>
        <p><strong>功能步骤进度:</strong> {{client.evaluateBoard.function_steps.filter(s => s.finished).length}}/{{
          client.evaluateBoard.function_steps.length }} 完成</p>

        <div v-if="client.evaluateBoard.function_steps && client.evaluateBoard.function_steps.length > 0">
          <strong>功能步骤详情</strong>
          <Timeline style="margin-top: 12px;">
            <Timeline.Item v-for="(step, index) in client.evaluateBoard.function_steps" :key="index"
              :color="step.finished ? (step.passed ? 'green' : 'red') : 'blue'">
              <div>
                <Tag :color="step.finished ? (step.passed ? 'green' : 'red') : 'blue'" size="small">
                  步骤 {{ index + 1 }}
                </Tag>
                <span style="margin-top: 4px;">
                  <strong>{{ step.description }}</strong>
                  <span style="margin-left: 8px;">
                    <span v-if="step.finished">
                      <Tag :color="step.passed ? 'green' : 'red'" size="small">
                        {{ step.passed ? '通过' : '失败' }}
                      </Tag>
                    </span>
                    <span v-else>
                      <Tag color="blue" size="small">进行中</Tag>
                    </span>
                  </span>
                </span>
                <br>
                等待: {{ step.waited_for_ms / 1000 }}s / {{ step.can_wait_for_ms / 1000 }}s
              </div>
            </Timeline.Item>
          </Timeline>
        </div>
      </Card>

    </div>
  </div>

  </div>
</template>
