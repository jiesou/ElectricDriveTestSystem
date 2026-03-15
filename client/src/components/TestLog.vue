<script setup lang="ts">
import { ref, computed } from 'vue'
import { Timeline, Tag, Switch } from 'ant-design-vue'
import type { TestSession, TestLog as TestLogType } from '../types'
import { formatTime } from '../types'

const props = defineProps<{
  session: TestSession | null | undefined
}>()

const showConnectionEvents = ref(false);

function getLogColor(action: string): string {
  switch (action) {
    case 'start': return 'blue'
    case 'answer': return 'green'
    case 'desk_clean': return 'orange'
    case 'navigation': return 'orange'
    case 'finish': return 'red'
    case 'connect': return 'gray'
    case 'disconnect': return 'gray'
    default: return 'default'
  }
}

const filteredLogs = computed(() => {
  const logs = props.session?.logs || []
  return showConnectionEvents.value
    ? logs
    : logs.filter(log => log.action !== 'connect' && log.action !== 'disconnect')
})

function getQuestionIndex(log: TestLogType): number | string {
  if (log.action !== 'answer' || !props.session) return '?'
  const question = log.details.question
  if (!question) return '?'
  const idx = props.session.test.questions.findIndex(item => item.id === question.id)
  return idx >= 0 ? idx + 1 : '?'
}

function getTroubleIndex(log: TestLogType): number | string {
  if (log.action !== 'answer') return '?'
  const question = log.details.question
  const trouble = log.details.trouble
  if (!question || !trouble) return '?'
  const idx = question.troubles.findIndex(item => item.id === trouble.id)
  return idx >= 0 ? idx + 1 : '?'
}

function formatTimestamp(timestamp: number): string {
  return formatTime(timestamp)
}
</script>

<template>
  <div v-if="session && filteredLogs.length > 0">
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <strong>测验日志</strong>
      <Switch
        v-model:checked="showConnectionEvents"
        checked-children="显示连接变化"
        un-checked-children="隐藏连接变化"
        style="margin-left: 12px;"
      />
    </div>
    <Timeline style="margin-top: 12px;">
      <Timeline.Item
        v-for="(log, index) in filteredLogs"
        :key="index"
        :color="getLogColor(log.action)"
      >
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
              第 {{ getQuestionIndex(log) }} 题，第 {{ getTroubleIndex(log) }} 个故障 -
              选择了 <Tag v-if="log.details.trouble">{{
                log.details.trouble.submitted_from_wire }} - {{ log.details.trouble.submitted_to_wire }}</Tag>，正确答案为
                <Tag v-if="log.details.trouble">故障{{ log.details.trouble.id }} ({{
                log.details.trouble.from_wire }} - {{ log.details.trouble.to_wire }})</Tag>  - 判定 {{ log.details.isCorrect ? '答对' : '答错' }}
            </strong>
            <strong v-else-if="log.action == 'desk_clean'">
              工位清洁: 进度 {{ (log.details.deskCleanResult.clean_progress * 100).toFixed(0) }}%，
              螺丝刀 {{ log.details.deskCleanResult.screwdriver_ready ? '归位' : '未归位' }}，
              剥线钳 {{ log.details.deskCleanResult.wire_stripper_ready ? '归位' : '未归位' }}，
              万用表 {{ log.details.deskCleanResult.multimeter_ready ? '归位' : '未归位' }}，
              斜口钳 {{ log.details.deskCleanResult.crimping_ready ? '归位' : '未归位' }}，
              号码管 {{ log.details.deskCleanResult.sleeves_num }} 个
            </strong>
            <strong v-else>未知操作</strong>
          </div>
          <div style="font-size: 12px; color: #666;">
            {{ formatTimestamp(log.timestamp) }}
            <span v-if="index > 0">
              (经过 {{
                (log.timestamp - (filteredLogs[index - 1]?.timestamp || log.timestamp))
              }} 秒)
            </span>
          </div>
        </div>
      </Timeline.Item>
    </Timeline>
  </div>
</template>
