import {
  Client,
  Question,
  Test,
  TestSession,
  Trouble,
  TROUBLES,
  TroubleTestUpdateRequestMessage
} from "./types.ts";
import { getSecondTimestamp } from "./types.ts";
import { clientManager } from "./ClientManager.ts";

clientManager.addWSMessageHandler((client, _socket, message) => {
  switch (message.type) {
    case "trouble_tests_update": {
      // 客户端上传整个 testSession 或更新
      // 直接覆盖 client.testSession（客户端为胖客户端，服务端只保存状态）
      const session = (message as TroubleTestUpdateRequestMessage).testSession;
      if (session) {
        client.testSession = session;
        console.log(`[tests] Updated testSession for client ${client.id}`);
      }
      break;
    }
  }
});

// TroubleTest 负责排故测验的逻辑管理
export class TroubleTest {
  public tests: Test[] = [];
  private questionBank: Question[] = [];

  constructor() {
    // 尝试从持久化存储恢复数据
    try {
      const data = JSON.parse(Deno.readTextFileSync("data.json"));
      this.tests = data.tests || [];
      this.questionBank = data.questionBank || [];
    } catch (error) {
      console.error("读取 data.json 中的测验数据时出错，使用默认数据:", error);
    }

    // 自动保存测验数据
    setInterval(
      () => {
        const dataToSave = {
          tests: this.tests,
          questionBank: this.questionBank,
        };
        try {
          const existingData = JSON.parse(Deno.readTextFileSync("data.json"));
          const mergedData = { ...existingData, ...dataToSave };
          Deno.writeTextFileSync("data.json", JSON.stringify(mergedData));
        } catch {
          Deno.writeTextFileSync("data.json", JSON.stringify(dataToSave));
        }
      },
      5000,
    );
  }

  // 创建测验会话
  createTestSession(clientId: string, test: Test): boolean {
    const client = clientManager.clients[clientId];
    if (!client) return false;

    const session: TestSession = {
      id: `${clientId}_${Date.now()}`,
      test,
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

  finishTest(client: Client, timestamp?: number) {
    if (!client?.testSession) return 0;

    const session = client.testSession;
    const finishTime = timestamp || getSecondTimestamp();
    // 如果已经设置过结束时间，就保持原值（避免覆盖）
    session.finishTime = session.finishTime || finishTime;
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
}

// 全局单例
export const troubleTest = new TroubleTest();
