import {
  Client,
  InTestingMessage,
  FinishResultMessage,
  Question,
  Test,
  TestSession,
  Trouble,
  TROUBLES,
} from "./types.ts";
import { getSecondTimestamp } from "./types.ts";
import { clientManager } from "./ClientManager.ts";

export class TestSystemManager {
  // 获取clients的便捷方法
  private get clients(): Record<string, Client> {
    return clientManager.clients || {};
  }
  public tests: Test[] = [];
  private questionBank: Question[] = [
    {
      id: 1,
      troubles: [
        TROUBLES[0], // 101 和 102 断路
        TROUBLES[1], // 102 和 103 断路
      ],
    },
    {
      id: 2,
      troubles: [
        TROUBLES[2], // 103 和 104 断路
        TROUBLES[3], // 104 和 105 断路
      ],
    },
    {
      id: 3,
      troubles: [
        TROUBLES[0], // 101 和 102 断路
        TROUBLES[2], // 103 和 104 断路
        TROUBLES[4], // 201 和 202 断路
      ],
    },
    {
      id: 4,
      troubles: [
        TROUBLES[1], // 102 和 103 断路
        TROUBLES[3], // 104 和 105 断路
        TROUBLES[5], // 202 和 203 断路
      ],
    },
  ];
  private broadcastInterval?: number;

  constructor() {
    /* 野鸡持久存储方案 */
    try {
      const data = JSON.parse(Deno.readTextFileSync("data.json"));
      this.tests = data.tests || [];
      this.questionBank = data.questionBank || [];

      // 恢复客户端数据到 clientManager
      if (data.clients) {
        for (const [clientId, clientDataRaw] of Object.entries(data.clients)) {
          // 类型窄化：确保 clientData 是对象之后再进行展开
          const clientData = clientDataRaw as Client | undefined;
          if (!clientData || typeof clientData !== "object") {
            continue;
          }
          // 恢复客户端状态，但保持离线状态（因为重启后WebSocket连接都断了）
          const restoredClient: Client = {
            ...clientData,
            online: false,
            socket: undefined, // 移除 socket 引用
          };
          clientManager.clients[clientId] = restoredClient;
        }
      }
    } catch (error) {
      console.error("读取 data.json 数据库时出错，自动使用全新默认数据:", error);
    }

    this.startBroadcast();
    // 自动保存
    setInterval(
      () => {
        // 保存前移除 socket 对象（不能序列化）
        const dataToSave = {
          ...this,
          clients: Object.fromEntries(
            Object.entries(this.clients).map(([id, client]) => [
              id,
              {
                ...client,
                socket: undefined, // 移除 socket 引用
              },
            ]),
          ),
        };
        Deno.writeTextFileSync("data.json", JSON.stringify(dataToSave));
      },
      5000,
    );
  }

  // 创建测验会话
  createTestSession(clientId: string, test: Test): boolean {
    const client = this.clients[clientId];
    if (!client) return false;

    const session: TestSession = {
      id: `${clientId}_${Date.now()}`,
      test,
      currentQuestionIndex: 0,
      solvedTroubles: [],
      logs: [
        {
          timestamp: getSecondTimestamp(),
          action: "start",
          details: { question: test.questions[0] },
        },
      ],
    };

    client.testSession = session;
    return true;
  }

  handleAnswer(client: Client, trouble: Trouble): boolean {
    if (!client?.testSession) return false;

    const session = client.testSession;
    const currentQuestion =
      session.test.questions[session.currentQuestionIndex];

    const haveBeenSolved = session.solvedTroubles.find(([index, troubles]) =>
      index === session.currentQuestionIndex &&
      troubles.some((t) => t.id === trouble.id)
    );
    // 检查 session 对应 question 确实包含该 trouble，且未被解决过
    const isCorrect = !haveBeenSolved &&
      currentQuestion.troubles.some((t: Trouble) => t.id === trouble.id);

    if (isCorrect) {
      // 加入到 currentQuestion 的 solvedTroubles
      const existingEntry = session.solvedTroubles.find((
        [index]: [number, Trouble[]],
      ) => index === session.currentQuestionIndex);
      if (existingEntry) {
        existingEntry[1].push(trouble);
      } else {
        session.solvedTroubles.push([session.currentQuestionIndex, [trouble]]);
      }
    }

    // Log the answer
    session.logs.push({
      timestamp: getSecondTimestamp(),
      action: "answer",
      details: {
        question: currentQuestion,
        trouble,
        result: isCorrect,
      },
    });

    return isCorrect;
  }

  get questions(): Question[] {
    return [...this.questionBank];
  }

  addQuestion(question: Omit<Question, "id">): Question {
    const newQuestion: Question = {
      id: Math.max(...this.questionBank.map((q) => q.id), 0) + 1,
      ...question,
    };
    this.questionBank.push(newQuestion);
    return newQuestion;
  }

  updateQuestion(id: number, updates: Partial<Question>): boolean {
    const index = this.questionBank.findIndex((q) => q.id === id);
    if (index === -1) return false;

    this.questionBank[index] = { ...this.questionBank[index], ...updates };
    return true;
  }

  deleteQuestion(id: number): boolean {
    const index = this.questionBank.findIndex((q) => q.id === id);
    if (index === -1) return false;

    this.questionBank.splice(index, 1);
    return true;
  }

  private getRemainingTroubles(session: TestSession): Trouble[] {
    const currentQuestion =
      session.test.questions[session.currentQuestionIndex];
    const solvedEntry = session.solvedTroubles.find(([index]: [number, Trouble[]]) =>
      index === session.currentQuestionIndex
    );
    const solvedTroubles = solvedEntry ? solvedEntry[1] : [];
    return currentQuestion.troubles.filter((trouble: Trouble) =>
      !solvedTroubles.some((solved: Trouble) => solved.id === trouble.id)
    );
  }

  navigateQuestion(client: Client, direction: "next" | "prev"): boolean {
    if (!client?.testSession) return false;

    const session = client.testSession;
    const newIndex = direction === "next"
      ? session.currentQuestionIndex + 1
      : session.currentQuestionIndex - 1;

    if (newIndex >= 0 && newIndex < session.test.questions.length) {
      session.currentQuestionIndex = newIndex;

      // log 记录
      session.logs.push({
        timestamp: getSecondTimestamp(),
        action: "navigation",
        details: {
          question: session.test.questions[newIndex],
          direction,
        },
      });

      return true;
    }

    return false;
  }

  finishTest(client: Client, timestamp?: number): number {
    if (!client?.testSession) return 0;

    const session = client.testSession;
    const finishTime = timestamp || getSecondTimestamp();
    // 如果已经设置过结束时间，就保持原值（避免覆盖）
    session.finishTime = session.finishTime || finishTime;

    // 计算得分
    const totalTroublesCount = session.test.questions.reduce(
      (sum, q) => sum + q.troubles.length,
      0,
    );
    const solvedTroublesCount = session.solvedTroubles.reduce(
      (sum, [_questionIndex, solvedTroubles]) => sum + solvedTroubles.length,
      0,
    );
    const score = Math.round((solvedTroublesCount / totalTroublesCount) * 100);

    session.finishedScore = score;

    // Log the finish
    session.logs.push({
      timestamp: finishTime,
      action: "finish",
      details: {
        score: score,
      },
    });
    return score;
  }

  private startBroadcast() {
    this.broadcastInterval = setInterval(() => {
      this.broadcastTroubleStatus();
    }, 3000); // 轮查间隔
  }

  broadcastTroubleStatus() {
    for (const [_clientId, client] of Object.entries(this.clients)) {
      if (!client.online) continue;
      if (!client.testSession) continue;
      if (!client.socket) continue;
      if (!(client.socket.readyState === WebSocket.OPEN)) continue;
      if (client.testSession.finishTime) continue; // 已结束则跳过
      
      const session = client.testSession;
      const currentTime = getSecondTimestamp();

      // 检查测试会话是否超时
      if (
        session.test.durationTime && !session.finishTime &&
        currentTime >= session.test.startTime + session.test.durationTime
      ) {
        const timeoutTimestamp = session.test.startTime +
          session.test.durationTime;
        session.logs.push({
          timestamp: currentTime,
          action: "finish",
          details: {},
        });

        const finishedScore = this.finishTest(client, timeoutTimestamp);

        try {
          client.socket.send(JSON.stringify({
            type: "finish_result",
            finished_score: finishedScore,
            timestamp: currentTime,
          } as FinishResultMessage));
        } catch (error) {
          console.error(`[broadcast] Failed to send timeout message to client ${client.id}:`, error);
        }

        console.log(`Session timeout for client ${client.id}`);
      }

      // 只在测验进行中进行广播
      // if (currentTime < session.test.startTime) continue;
      // 测验开始前也广播当前状态
      
      const remainingTroubles = this.getRemainingTroubles(session);
      const message: InTestingMessage = {
        type: "in_testing",
        timestamp: currentTime,
        all_troubles: session.test.questions[session.currentQuestionIndex].troubles,
        exist_troubles: remainingTroubles,
        current_question_index: session.currentQuestionIndex,
        total_questions: session.test.questions.length,
        start_time: session.test.startTime,
        duration_time: session.test.durationTime,
      };

      try {
        client.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[broadcast] Failed to send WebSocket message to client ${client.id}:`, error);
      }
    }
  }

  getTroubles(): Trouble[] {
    return [...TROUBLES];
  }

  createTest(
    questions: Question[],
    startTime: number,
    durationTime: number | null = null,
  ): Test {
    const test: Test = {
      id: Date.now(),
      questions,
      startTime,
      durationTime,
    };
    this.tests.push(test);
    return test;
  }

  cleanup() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
  }
}


// 全局单例
export const manager = new TestSystemManager();