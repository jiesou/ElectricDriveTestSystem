import {
  AnswerLog,
  Client,
  FinishLog,
  Question,
  StartLog,
  Test,
  TestSession,
  Trouble,
  TROUBLES,
  TroubleTestFinishMessage,
  TroubleTestPullRequestMessage,
  TroubleTestPushMessage,
  TroubleTestUpdateRequestMessage,
  XiaoxinStatus,
} from "./types.ts";
import { getSecondTimestamp } from "./types.ts";
import { clientManager } from "./ClientManager.ts";

clientManager.addWSMessageHandler((client, _socket, message) => {
  switch (message.type) {
    case "trouble_test_pull_request": {
      const msg = message as TroubleTestPullRequestMessage;
      if (client.testSession && !client.testSession.finishTime) { // 如果有测验会话，且未完成
        troubleTest.pushTestToClient(client, client.testSession?.test);
      }
      break;
    }
    case "trouble_test_update_request": {
      // 客户端上传或更新整个 test 的相关信息（主要就是 all_questions）
      const msg = message as TroubleTestUpdateRequestMessage;
      if (client.testSession) {
        /* 核心：差分 diff 计算实现 TestLog 记录 */
        const oldQuestions = client.testSession.test.questions;
        const newQuestions = msg.all_questions;

        newQuestions.forEach((newQ, qIdx) => {
          const oldQ = oldQuestions[qIdx];
          if (!oldQ) return;

          newQ.troubles.forEach((newT) => {
            if (!newT.submitted_from_wire && !newT.submitted_to_wire) {
              // 如果提交内容为空，则跳过（表示未提交）
              return;
            }

            // 查找旧数据中对应的故障
            const oldT = oldQ.troubles.find((t) => t.id === newT.id);
            if (!oldT) return;

            // 如果旧数据和新数据的提交内容不一致，则记录日志
            if (newT.submitted_from_wire !== oldT.submitted_from_wire || newT.submitted_to_wire !== oldT.submitted_to_wire || newT.submitted_correct !== oldT.submitted_correct) {
              const log: AnswerLog = {
                timestamp: msg.timestamp || getSecondTimestamp(),
                action: "answer",
                details: {
                  question: newQ,
                  trouble: {
                    id: newT.id,
                    description: newT.description,
                    from_wire: newT.from_wire,
                    to_wire: newT.to_wire,
                    submitted_from_wire: newT.submitted_from_wire,
                    submitted_to_wire: newT.submitted_to_wire,
                  },
                  isCorrect: newT.submitted_correct || false,
                },
              };
              client.testSession!.logs.push(log);
              console.log(
                `[TroubleTest] Client ${client.id} submitted trouble ${newT.id} in question ${newQ.id}`,
              );
            }
          });
        });

        // 直接覆盖服务器上的 client.testSession（客户端为胖客户端，服务端只保存状态）
        client.testSession.test.questions = msg.all_questions;
        client.testSession.finishTime = msg.finish_time;
        client.testSession.finishedScore = msg.finished_score;

        // 如果有完成时间，且之前没记录过完成日志，说明这次交卷了
        if (
          msg.finish_time &&
          !client.testSession.logs.some((l) => l.action === "finish")
        ) {
          const log: FinishLog = {
            timestamp: msg.finish_time,
            action: "finish",
            details: { score: msg.finished_score },
          };
          client.testSession.logs.push(log);
          troubleTest.finishTest(client, msg.finish_time);
        }
      } else {
        // 如果没有 testSession，则当场创建一个新的（虽然正常情况下不应该发生，但总之这相当于允许客户机主动发起测验）
        const startLog: StartLog = {
          timestamp: getSecondTimestamp(),
          action: "start",
          details: { question: msg.all_questions[0] },
        };
        client.testSession = {
          id: `${client.id}_${Date.now()}`,
          test: {
            id: Date.now(),
            questions: msg.all_questions,
            startTime: msg.start_time,
            durationTime: msg.duration_time,
          },
          finishTime: msg.finish_time,
          finishedScore: msg.finished_score,
          logs: [startLog],
        };

        // 如果有完成时间，说明直接交卷了
        if (msg.finish_time) {
          const log: FinishLog = {
            timestamp: msg.finish_time,
            action: "finish",
            details: { score: msg.finished_score },
          };
          client.testSession.logs.push(log);
        }
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
      const data = JSON.parse(Deno.readTextFileSync("data/data.json"));
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
          const existingData = JSON.parse(Deno.readTextFileSync("data/data.json"));
          const mergedData = { ...existingData, ...dataToSave };
          Deno.writeTextFileSync("data/data.json", JSON.stringify(mergedData));
        } catch {
          Deno.writeTextFileSync("data/data.json", JSON.stringify(dataToSave));
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
    const startLog: StartLog = {
      timestamp: getSecondTimestamp(),
      action: "start",
      details: { question: test.questions[0] },
    };
    const session: TestSession = {
      id: `${client.id}_${Date.now()}`,
      test,
      logs: [startLog],
    };
    client.testSession = session;

    // 更新小新智能体状态：排故进行时
    if (client.cvClient) {
      const xiaoxinStatus: XiaoxinStatus = {
        type: "status_text_update",
        status_text: "排故进行时！",
      };
      client.cvClient.xiaoxin_status = xiaoxinStatus;
    }

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
    if (!client?.testSession) return;

    const now = timestamp || getSecondTimestamp();
    client.testSession.finishTime = now;

    const finishMessage: TroubleTestFinishMessage = {
      type: "trouble_test_finish",
      timestamp: now,
    };

    clientManager.sendWSMessage(client.socket, finishMessage);

    // 测验结束，清除小新状态
    if (client.cvClient) {
      client.cvClient.xiaoxin_status = undefined;
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
}

// 全局单例
export const troubleTest = new TroubleTest();
