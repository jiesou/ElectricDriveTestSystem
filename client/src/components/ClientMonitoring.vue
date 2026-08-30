<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, Popconfirm, Button, Tag, Timeline, message } from 'ant-design-vue'
import type { Client } from '../types'
import { formatTime } from '../types'
import ClientTable from './ClientTable.vue'
import CvClientMonitor from './CvClientMonitor.vue'
import TestLog from './TestLog.vue'
import { apiJson } from '../api-client'

const props = defineProps<{ clients: Client[] }>()
const emit = defineEmits<{ (e: 'refresh'): void }>()

const showConnectionEvents = ref(false)
const showExtras = false

const activeTestClients = computed(() => props.clients.filter(c => c.testSession))
const evaluateBoards = computed(() => props.clients.filter(c => c.evaluateBoard))

async function handleForgetClients() {
  try {
    await apiJson('/api/clients/forget', { method: 'POST' })
    emit('refresh')
  } catch (err) {
    console.error('Error forgetting clients:', err)
    message.error('操作失败，请稍后重试。')
  }
}
</script>

<template>
  <div>
    <h2>客户机监控</h2>

    <Card title="实时客户机状态">
      <template #extra>
        <Popconfirm title="确定要忘记所有客户机吗？这也将清除客户机的进行中任务进度。" @confirm="handleForgetClients">
          <Button type="primary" danger>忘记所有客户机</Button>
        </Popconfirm>
      </template>
      <ClientTable :clients="props.clients" />
    </Card>

    <!-- 现场演示区：以下扩展监控默认不显示，把 showExtras 改为 true 即可 -->
    <!-- 实时视觉客户端 -->
    <div v-if="showExtras" style="margin-top: 20px">
      <CvClientMonitor :clients="props.clients" />
    </div>

    <!-- 进行中任务详情 -->
    <div v-if="showExtras && activeTestClients.length > 0" style="margin-top: 20px">
      <div v-for="client in activeTestClients" :key="client.id" style="margin-bottom: 20px;">
        <Card :title="`进行中任务详情 - ${client.name} (${client.ip})`">
          <div v-if="client.testSession">
            <div style="margin-bottom: 16px;">
              <p><strong>开始时间:</strong> {{ formatTime(client.testSession.test.startTime) }}</p>
              <p><strong>已提交:</strong> {{
                client.testSession.test.questions.reduce((acc, q) => acc + q.troubles.filter(t => t.submitted_from_wire).length, 0)
              }} 个</p>
              <TestLog
                :session="client.testSession"
                v-model:showConnectionEvents="showConnectionEvents"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>

    <!-- 装接评估详情 -->
    <div v-if="showExtras && evaluateBoards.length > 0" style="margin-top: 20px">
      <div v-for="client in evaluateBoards" :key="`eval-${client.id}`" style="margin-bottom: 20px;">
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