import {
  Client,
  Question,
  Test,
  TestSession,
  Trouble,
  TROUBLES,
  TroubleTestPushMessage,
  TroubleTestUpdateRequestMessage,
} from "./types.ts";
import { getSecondTimestamp } from "./types.ts";
import { clientManager } from "./ClientManager.ts";

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

  pushTestToClient(client: Client, test: Test) {
    const troubleTestPushMessage: TroubleTestPushMessage = {
      type: "trouble_test_push",
      all_questions: test.questions,
      start_time: test.startTime,
      duration_time: test.durationTime,
    };

    clientManager.sendWSMessage(
      client.socket,
      troubleTestPushMessage,
    );
  }

  // 创建测验会话
  createTestSession(client: Client, test: Test) {
    const session: TestSession = {
      id: `${client.id}_${Date.now()}`,
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

    this.pushTestToClient(client, test);
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


clientManager.addWSMessageHandler((client, _socket, message) => {
  switch (message.type) {
    case "trouble_test_update_request": {
      // 客户端上传或更新整个 test 的相关信息（主要就是 all_questions）
      const troubleTestUpdateRequestMessage = message as TroubleTestUpdateRequestMessage;
      if (client.testSession) {
        // 直接覆盖服务器上的 client.testSession（客户端为胖客户端，服务端只保存状态）
        client.testSession.test.questions = troubleTestUpdateRequestMessage.all_questions;
      } else {
        // 如果没有 testSession，则当场创建一个新的（虽然正常情况下不应该发生，但总之这相当于允许客户机主动发起测验）
        client.testSession = {
          id: `${client.id}_${Date.now()}`,
          test: {
            id: Date.now(),
            questions: troubleTestUpdateRequestMessage.all_questions,
            startTime: troubleTestUpdateRequestMessage.start_time,
            durationTime: troubleTestUpdateRequestMessage.duration_time,
          },
          logs: [
            {
              timestamp: getSecondTimestamp(),
              action: "start",
              details: { question: troubleTestUpdateRequestMessage.all_questions[0]}
            }
          ]
        };
      }
      break;
    }
  }
});
