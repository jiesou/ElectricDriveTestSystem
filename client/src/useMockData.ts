// 模拟数据功能：用于演示时按 Home 键显示固定的测试数据
import { ref } from 'vue'
import type { Client, Test, TestSession, TestLog, Trouble, Question } from './types'
import { getSecondTimestamp } from './types'

// 是否启用模拟数据模式
export const useMockDataService = ref(false)

// 生成模拟数据
export function generateMockData(): Client[] {
  const now = getSecondTimestamp()
  
  // 前三个故障（从 troubles.json）
  const troubles: Trouble[] = [
    { id: 1, description: "200 和 233 断路", from_wire: 200, to_wire: 233 },
    { id: 2, description: "215 和 216 断路", from_wire: 215, to_wire: 216 },
    { id: 3, description: "207 和 220 断路", from_wire: 207, to_wire: 220 }
  ]
  
  // 三道题，每题一个故障
  const questions: Question[] = [
    { id: 1, troubles: [troubles[0]!] },
    { id: 2, troubles: [troubles[1]!] },
    { id: 3, troubles: [troubles[2]!] }
  ]
  
  // 测验开始时间（假设5分钟前开始）
  const testStartTime = now - 5 * 60
  
  // 创建测试
  const test: Test = {
    id: 1,
    questions: questions,
    startTime: testStartTime,
    durationTime: null // 无时间限制
  }
  
  // 创建测试日志
  const logs: TestLog[] = [
    // 开始测验
    {
      timestamp: testStartTime,
      action: 'start',
      details: {
        question: questions[0]
      }
    },
    // 第一题回答正确
    {
      timestamp: testStartTime + 120, // 2分钟后
      action: 'answer',
      details: {
        question: questions[0],
        trouble: troubles[0],
        result: true
      }
    },
    // 下一题
    {
      timestamp: testStartTime + 125,
      action: 'navigation',
      details: {
        question: questions[1],
        direction: 'next'
      }
    },
    // 第二题回答正确
    {
      timestamp: testStartTime + 240, // 再过约2分钟
      action: 'answer',
      details: {
        question: questions[1],
        trouble: troubles[1],
        result: true
      }
    },
    // 下一题
    {
      timestamp: testStartTime + 245,
      action: 'navigation',
      details: {
        question: questions[2],
        direction: 'next'
      }
    },
    // 第三题回答错误 (126和136断路，这是故障4)
    {
      timestamp: testStartTime + 360, // 再过约2分钟
      action: 'answer',
      details: {
        question: questions[2],
        trouble: { id: 4, description: "126 和 136 断路", from_wire: 126, to_wire: 136 },
        result: false
      }
    },
    // 交卷，得分67分
    {
      timestamp: now,
      action: 'finish',
      details: {
        score: 67
      }
    }
  ]
  
  // 创建测验会话
  const testSession: TestSession = {
    id: 'test-session-45',
    test: test,
    currentQuestionIndex: 2, // 在第三题（索引2）
    finishTime: now, // 当前时间结束
    finishedScore: 67, // 得分67分
    solvedTroubles: [
      [0, [troubles[0]!]], // 第一题解决了故障1
      [1, [troubles[1]!]], // 第二题解决了故障2
      [2, []]              // 第三题没有解决
    ],
    logs: logs
  }
  
  // 创建45号机客户端
  const fakeClient: Client = {
    id: '45',
    name: '45号机',
    ip: '192.168.100.45',
    online: true,
    testSession: testSession
  }

  // 为 Mock 模式下添加关联的 CV 客户端数据（不包含真实图片，只包含分析结果数据）
  fakeClient.cvClient = {
    clientType: 'jetson_nano',
    ip: '192.168.100.45',
    session: {
      type: 'evaluate_wiring',
      startTime: testStartTime + 30,
      // shots 中不包含真实图片（image 为空字符串），仅包含分析结果数字
      shots: [
        {
          timestamp: testStartTime + 40,
          image: '',
          result: { sleeves_num: 40, cross_num: 1, excopper_num: 0, exterminal_num: 0 }
        },
        {
          timestamp: testStartTime + 120,
          image: '',
          result: { sleeves_num: 50, cross_num: 0, excopper_num: 1, exterminal_num: 0 }
        },
        {
          timestamp: testStartTime + 120,
          image: '',
          result: { sleeves_num: 45, cross_num: 0, excopper_num: 1, exterminal_num: 0 }
        }
      ],
      finalResult: {
        no_sleeves_num: 0,
        cross_num: 1,
        excopper_num: 2,
        exterminal_num: 0,
        scores: 91
      }
    }
  }
  
  return [fakeClient]
}
