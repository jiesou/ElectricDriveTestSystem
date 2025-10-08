import {
  Client,
  InTestingMessage,
  Question,
  Test,
  TestSession,
  Trouble,
  TROUBLES,
} from "./types.ts";
import { getSecondTimestamp } from "./types.ts";

export class TestSystemManager {
  public clients: Record<string, Client> = {}; // Changed from Map to Record for persistence
  private tests: Test[] = [];
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
      Object.assign(this, data);
      // 恢复后将所有客户端设为离线（因为重启后WebSocket连接都断了）
      for (const clientId in this.clients) {
        this.clients[clientId].online = false;
        delete this.clients[clientId].socket;
      }
    } catch {
      // 文件不存在或解析失败，使用默认值
      console.log("No existing data.json, starting fresh");
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

  // 连接或重连客户端
  connectClient(ip: string, socket: WebSocket): Client {
    // 先查找是否有相同IP的客户机
    const existingClient = Object.values(this.clients).find(
      (client) => client.ip === ip,
    );

    const timestamp = getSecondTimestamp();

    if (existingClient) {
      // 重连现有客户端
      existingClient.online = true;
      existingClient.socket = socket;

      // 如果在测验会话中，记录重连日志
      if (existingClient.testSession) {
        existingClient.testSession.logs.push({
          timestamp,
          action: "connect",
          details: {},
        });
      }

      console.log(`Client ${existingClient.id} (${ip}) reconnected`);
      return existingClient;
    } else {
      // 创建新客户端
      const clientId = crypto.randomUUID();
      const client: Client = {
        id: clientId,
        name: ip, // Default name is IP address
        ip,
        online: true,
        socket,
      };
      this.clients[clientId] = client;
      console.log(`New client ${clientId} (${ip}) connected`);
      return client;
    }
  }

  // 断开客户端连接
  disconnectClient(client: Client) {
    const timestamp = getSecondTimestamp();

    // 如果有测试会话，记录断开连接日志
    if (client.testSession) {
      client.testSession.logs.push({
        timestamp,
        action: "disconnect",
        details: {},
      });
    }

    client.online = false;
    delete client.socket;
    console.log(`Client ${client.id} disconnected`);
  }

  createTestSession(clientId: string, test: Test): boolean {
    const client = this.clients[clientId];
    if (!client) return false;

    const timestamp = getSecondTimestamp();
    const session: TestSession = {
      id: `${clientId}_${Date.now()}`,
      test,
      currentQuestionIndex: 0,
      solvedTroubles: [],
      logs: [
        {
          timestamp,
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
    // Check if the trouble is part of current question
    const isCorrect = !haveBeenSolved &&
      currentQuestion.troubles.some((t: Trouble) => t.id === trouble.id);

    if (isCorrect) {
      // Add to solved troubles for current question
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
    const timestamp = getSecondTimestamp();
    session.logs.push({
      timestamp,
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
    const solvedTroubles =
      session.solvedTroubles.find(([index]: [number, Trouble[]]) =>
        index === session.currentQuestionIndex
      )?.[1] || [];
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

      // Log the navigation
      const timestamp = getSecondTimestamp();
      session.logs.push({
        timestamp,
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

  finishTest(client: Client, timestamp?: number): boolean {
    if (!client?.testSession) return false;

    const session = client.testSession;
    const finishTime = timestamp || getSecondTimestamp();
    session.finishTime = finishTime;

    // Log the finish
    session.logs.push({
      timestamp: finishTime,
      action: "finish",
      details: {},
    });

    return true;
  }

  private startBroadcast() {
    this.broadcastInterval = setInterval(() => {
      this.broadcastTroubleStatus();
    }, 1000); // 1 seconds
  }

  private broadcastTroubleStatus() {
    for (const [_clientId, client] of Object.entries(this.clients)) {
      if (!client.online) continue;
      if (
        client.testSession && client.socket &&
        client.socket.readyState === WebSocket.OPEN
      ) {
        const session = client.testSession;
        const currentTime = getSecondTimestamp();

        // Check if session has timed out
        if (
          session.test.durationTime && !session.finishTime &&
          currentTime >= session.test.startTime + session.test.durationTime
        ) {
          session.finishTime = session.test.startTime +
            session.test.durationTime;
          session.logs.push({
            timestamp: session.finishTime,
            action: "finish",
            details: {},
          });
          console.log(`Session timeout for client ${client.id}`);
        }

        // Only broadcast if test has started and not finished
        if (currentTime >= session.test.startTime && !session.finishTime) {
          const remainingTroubles = this.getRemainingTroubles(session);
          const message: InTestingMessage = {
            type: "in_testing",
            all_troubles: TROUBLES,
            exist_troubles: remainingTroubles,
            current_question: session.currentQuestionIndex + 1,
            total_questions: session.test.questions.length,
            start_time: session.test.startTime,
            duration_time: session.test.durationTime,
          };

          try {
            client.socket.send(JSON.stringify(message));
          } catch (error) {
            console.error(`Failed to send to client ${client.id}:`, error);
          }
        }
      }
    }
  }

  getTroubles(): Trouble[] {
    return [...TROUBLES];
  }

  getTests(): Test[] {
    return [...this.tests];
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
