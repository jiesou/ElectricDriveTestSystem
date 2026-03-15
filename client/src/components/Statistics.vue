<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Card, Row, Col, Statistic, Tag } from 'ant-design-vue'
import { ArrowDownOutlined, ArrowUpOutlined, ClockCircleOutlined } from '@ant-design/icons-vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import dayjs from 'dayjs'
import TestLog from './TestLog.vue'
import type { TestSession, TestLog as TestLogType, Question } from '../types'

// 注册 ECharts 组件
use([
  CanvasRenderer,
  LineChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
])

// Mock 数据 - 同学列表
const students = ['A', 'B', 'C', 'D', 'E']

// Mock 数据 - 历史答题分数（每次测验）
const mockScoreHistory = ref<Record<string, number[]>>({
  'A': [85, 78, 92, 88, 95, 82, 90],
  'B': [72, 68, 75, 80, 78, 85, 82],
  'C': [90, 95, 88, 92, 85, 90, 93],
  'D': [65, 70, 72, 68, 75, 78, 80],
  'E': [88, 82, 85, 90, 87, 92, 88],
})

// Mock 数据 - 测验日期标签
const mockDateLabels = ref([
  '03-01', '03-05', '03-08', '03-10', '03-12', '03-14', '03-15'
])

// 生成模拟的测验日志
function generateMockLogs(startTime: number, score: number): TestLogType[] {
  const logs: TestLogType[] = []

  // 创建模拟的题目和故障
  const questions: Question[] = [
    { id: 1, troubles: [
      { id: 1, description: '故障1', from_wire: 1, to_wire: 2, submitted_from_wire: 1, submitted_to_wire: 2, submitted_correct: true },
      { id: 2, description: '故障2', from_wire: 3, to_wire: 4, submitted_from_wire: 3, submitted_to_wire: 4, submitted_correct: true },
    ]},
    { id: 2, troubles: [
      { id: 3, description: '故障3', from_wire: 5, to_wire: 6, submitted_from_wire: 5, submitted_to_wire: 7, submitted_correct: false },
    ]},
    { id: 3, troubles: [
      { id: 4, description: '故障4', from_wire: 8, to_wire: 9, submitted_from_wire: 8, submitted_to_wire: 9, submitted_correct: true },
    ]},
  ]

  // 开始日志
  logs.push({
    action: 'start',
    timestamp: startTime,
    details: { question: questions[0] }
  })

  // 答题日志
  let currentTime = startTime + 60
  questions.forEach((q) => {
    q.troubles.forEach((t) => {
      logs.push({
        action: 'answer',
        timestamp: currentTime,
        details: {
          question: q as any,
          trouble: t as any,
          isCorrect: !!t.submitted_correct
        }
      })
      currentTime += 120 + Math.floor(Math.random() * 60)
    })
  })

  // 工位清洁日志（随机添加）
  if (Math.random() > 0.5) {
    logs.push({
      action: 'desk_clean',
      timestamp: currentTime,
      details: {
        deskCleanResult: {
          image: '',
          sleeves_num: Math.floor(Math.random() * 5),
          screwdriver_ready: Math.random() > 0.3,
          wire_stripper_ready: Math.random() > 0.3,
          multimeter_ready: Math.random() > 0.3,
          crimping_ready: Math.random() > 0.3,
          clean_progress: 0.5 + Math.random() * 0.5
        }
      }
    })
    currentTime += 30
  }

  // 结束日志
  logs.push({
    action: 'finish',
    timestamp: currentTime,
    details: { score }
  })

  return logs
}

// 生成模拟的 TestSession
function generateMockTestSession(id: string, startTime: number, score: number): TestSession {
  const questions: Question[] = [
    { id: 1, troubles: [
      { id: 1, description: '故障1', from_wire: 1, to_wire: 2, submitted_from_wire: 1, submitted_to_wire: 2, submitted_correct: true },
      { id: 2, description: '故障2', from_wire: 3, to_wire: 4, submitted_from_wire: 3, submitted_to_wire: 4, submitted_correct: true },
    ]},
    { id: 2, troubles: [
      { id: 3, description: '故障3', from_wire: 5, to_wire: 6, submitted_from_wire: 5, submitted_to_wire: 7, submitted_correct: false },
    ]},
    { id: 3, troubles: [
      { id: 4, description: '故障4', from_wire: 8, to_wire: 9, submitted_from_wire: 8, submitted_to_wire: 9, submitted_correct: true },
    ]},
  ]

  return {
    id,
    test: {
      id: parseInt(id) || 1,
      questions,
      startTime,
      durationTime: 1800
    },
    finishTime: startTime + 1500 + Math.floor(Math.random() * 600),
    finishedScore: score,
    logs: generateMockLogs(startTime, score)
  }
}

// Mock 数据 - 历史测验记录
interface TestRecord {
  id: string
  studentName: string
  type: '排故' | '装接'
  score: number
  date: string
  duration: number
  testSession: TestSession
}

// 生成 mockTestRecords
function generateMockTestRecords(): TestRecord[] {
  const records: TestRecord[] = []
  const dates = [
    { date: '2026-03-01', baseTime: 1740804000 },
    { date: '2026-03-05', baseTime: 1741149600 },
    { date: '2026-03-08', baseTime: 1741408800 },
    { date: '2026-03-10', baseTime: 1741581600 },
    { date: '2026-03-12', baseTime: 1741754400 },
    { date: '2026-03-14', baseTime: 1741927200 },
    { date: '2026-03-15', baseTime: 1742013600 },
  ]

  const scores = {
    'A': [85, 78, 92, 88, 95, 82, 90],
    'B': [72, 68, 75, 80, 78, 85, 82],
    'C': [90, 95, 88, 92, 85, 90, 93],
    'D': [65, 70, 72, 68, 75, 78, 80],
    'E': [88, 82, 85, 90, 87, 92, 88],
  }

  let id = 1
  dates.forEach((d, dateIdx) => {
    students.forEach((student, studentIdx) => {
      const startTime = d.baseTime + studentIdx * 3600
      const studentScore = scores[student as keyof typeof scores][dateIdx]
      records.push({
        id: String(id++),
        studentName: student,
        type: (id % 2 === 0) ? '装接' : '排故',
        score: studentScore ?? 0,
        date: d.date,
        duration: 20 + Math.floor(Math.random() * 15),
        testSession: generateMockTestSession(String(id), startTime, studentScore ?? 0)
      })
    })
  })

  return records
}

const mockTestRecords = ref<TestRecord[]>(generateMockTestRecords())

// 系统时间
const systemTime = ref(dayjs().format('HH:mm:ss'))
let timeTimer: number | undefined

// 计算平均得分
const averageScore = computed(() => {
  const allScores = Object.values(mockScoreHistory.value).flat()
  return (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
})

// 最近一次平均分（用于对比）
const recentAverage = computed(() => {
  const recentScores = Object.values(mockScoreHistory.value).map(scores => {
    const last = scores[scores.length - 1]
    return typeof last === 'number' ? last : 0
  })
  return (recentScores.reduce((a, b) => a + b, 0) / (recentScores.length || 1)).toFixed(1)
})

// 折线图配置
const lineChartOption = computed(() => ({
  title: {
    text: '历史答题分数趋势',
    left: 'center',
    textStyle: {
      fontSize: 16,
    }
  },
  tooltip: {
    trigger: 'axis',
  },
  legend: {
    data: students.map(s => `同学 ${s}`),
    bottom: 0,
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '15%',
    top: '15%',
    containLabel: true,
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: mockDateLabels.value,
  },
  yAxis: {
    type: 'value',
    min: 50,
    max: 100,
  },
  series: students.map((student, index) => ({
    name: `同学 ${student}`,
    type: 'line',
    smooth: true,
    data: mockScoreHistory.value[student],
    itemStyle: {
      color: ['#1890ff', '#52c41a', '#faad14', '#eb2f96', '#722ed1'][index],
    },
  })),
}))

// 饼状图配置 - 排故/装接分布
const pieChartOption = computed(() => {
  const typeCount = mockTestRecords.value.reduce((acc, record) => {
    acc[record.type] = (acc[record.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    title: {
      text: '测验类型分布',
      left: 'center',
      textStyle: {
        fontSize: 16,
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} 次 ({d}%)',
    },
    legend: {
      bottom: 0,
    },
    series: [
      {
        name: '测验类型',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
          formatter: '{b}: {c}',
        },
        data: [
          { value: typeCount['排故'] || 0, name: '排故', itemStyle: { color: '#1890ff' } },
          { value: typeCount['装接'] || 0, name: '装接', itemStyle: { color: '#52c41a' } },
        ],
      },
    ],
  }
})

onMounted(() => {
  timeTimer = window.setInterval(() => {
    systemTime.value = dayjs().format('HH:mm:ss')
  }, 1000)
})

onUnmounted(() => {
  if (timeTimer) clearInterval(timeTimer)
})
</script>

<template>
  <div>
    <h2>统计数据</h2>

    <!-- 顶部统计卡片和折线图 -->
    <Row :gutter="16" style="margin-bottom: 20px;">
      <Col :span="18">
        <Card :bordered="false" style="height: 400px;">
          <VChart :option="lineChartOption" style="height: 350px; width: 100%;" />
        </Card>
      </Col>
      <Col :span="6">
        <Card :bordered="false" style="height: 400px;">
          <div style="display: flex; flex-direction: column; gap: 24px; height: 100%; justify-content: center;">
            <Statistic title="系统时间" :value="systemTime">
              <template #prefix>
                <ClockCircleOutlined style="color: #1890ff;" />
              </template>
            </Statistic>
            <Statistic title="平均得分" :value="averageScore" suffix="分">
              <template #prefix>
                <ArrowDownOutlined style="color: #cf1322;" />
              </template>
            </Statistic>
            <Statistic title="最近测验平均分" :value="recentAverage" suffix="分">
              <template #prefix>
                <ArrowUpOutlined style="color: #3f8600;" />
              </template>
            </Statistic>
            <Statistic title="总测验次数" :value="mockTestRecords.length" suffix="次" />
          </div>
        </Card>
      </Col>
    </Row>

    <!-- 历史测验记录和饼状图 -->
    <Row :gutter="16">
      <Col :span="16">
        <Card title="历史测验记录">
          <div style="max-height: 500px; overflow-y: auto;">
            <div
              v-for="record in mockTestRecords"
              :key="record.id"
              style="margin-bottom: 16px; padding: 12px; border: 1px solid #f0f0f0; border-radius: 6px;"
            >
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong>同学 {{ record.studentName }}</strong>
                  <Tag :color="record.type === '排故' ? 'blue' : 'green'" style="margin-left: 8px;">
                    {{ record.type }}
                  </Tag>
                </div>
                <div style="text-align: right;">
                  <Tag :color="record.score >= 85 ? 'green' : record.score >= 70 ? 'orange' : 'red'">
                    得分: {{ record.score }}
                  </Tag>
                </div>
              </div>
              <div style="margin-top: 8px; font-size: 12px; color: #666;">
                测验时间: {{ record.date }} | 用时: {{ record.duration }} 分钟
              </div>
              <!-- 使用 TestLog 组件展示完整日志 -->
              <div style="margin-top: 8px;">
                <TestLog :session="record.testSession" />
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col :span="8">
        <Card :bordered="false" style="height: 100%;">
          <VChart :option="pieChartOption" style="height: 350px; width: 100%;" />
        </Card>
      </Col>
    </Row>
  </div>
</template>
