// 简化的ESP32模拟器 - 自动答题流程
import { getSecondTimestamp } from "./types.ts";

const WS_URL = "ws://localhost:8000/ws";

class SimpleESP32Simulator {
  private socket: WebSocket | null = null;
  private clientId: string = "";
  private isConnected: boolean = false;
  private currentQuestion: number = 0;
  private totalQuestions: number = 0;
  private isTestActive: boolean = false;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(WS_URL);

      this.socket.onopen = () => {
        console.log("✅ ESP32模拟器已连接到服务器");
        this.isConnected = true;
        // 清除之前的定时器（如果有的话）
        if (this.pingIntervalId !== null) {
          clearInterval(this.pingIntervalId);
        }
        // 设置新的定时器
        this.pingIntervalId = setInterval(() => {
          this.ping();
        }, 3000);
      const message = { type: "evaluate_wiring_yolo_request" };
      const response = JSON.stringify(message);
      console.log("📤 发送工艺评估请求:", response);
      this.socket?.send(response);
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          console.log("📥 收到消息:", event.data);
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error("解析消息失败:", error);
        }
      };

      this.socket.onclose = () => {
        console.log("🔌 ESP32模拟器断开连接");
        this.isConnected = false;
        // 清除心跳定时器
        if (this.pingIntervalId !== null) {
          clearInterval(this.pingIntervalId);
          this.pingIntervalId = null;
        }
        console.log(`🔄 尝试重连...`);

        setTimeout(() => {
          this.connect().catch((error) => {
            console.error("重连失败:", error);
          });
        }, 5000); // 5秒后重连
      };

      this.socket.onerror = (error) => {
        console.error("❌ WebSocket错误:", error);
        reject(error);
      };
    });
  }

  private handleMessage(message: any) {

    switch (message.type) {
      case "connected":
        this.clientId = message.clientId;
        console.log(`🎯 连接成功! 分配到的客户端ID: ${this.clientId}`);
        break;

      case "in_testing":
        if (!this.isTestActive) {
          this.isTestActive = true;
          this.currentQuestion = message.current_question_index + 1;
          this.totalQuestions = message.total_questions;
          console.log(
            `📝 开始答题 - 第${this.currentQuestion}/${this.totalQuestions}题`,
          );
        }

        // 更新当前题目索引
        this.currentQuestion = message.current_question_index + 1;
        console.log(`📍 当前题目索引: ${this.currentQuestion}/${this.totalQuestions}`);

        // 如果有剩余的故障，立即回答第一个
        if (message.exist_troubles && message.exist_troubles.length > 0) {
          const troubleToAnswer = message.exist_troubles[0];
          console.log(`🔧 回答故障: ${troubleToAnswer.id}`);
          this.sendAnswer(troubleToAnswer.id);
        } else {
          // 当前题目没有剩余故障
          console.log(`✅ 第${this.currentQuestion}题完成`);
          
          // 检查是否所有题目都完成（注意：currentQuestion是从1开始的）
          if (this.currentQuestion >= this.totalQuestions) {
            // 所有题目完成，自动交卷
            console.log(`🏁 所有题目完成，准备交卷`);
            this.finishTest();
          } else {
            // 还有题目，进入下一题
            console.log(`➡️ 进入下一题`);
            this.nextQuestion();
          }
        }
        break;

      case "answer_result": {
        const result = message.result ? "正确" : "错误";
        console.log(`🎯 故障${message.trouble.id}回答${result}`);
        // 回答后立即检查是否还有故障，不需要等待服务器推送
        break;
      }

      case "finish_result":
        console.log(`🎉 测试完成! 得分: ${message.finished_score}分`);
        this.isTestActive = false;
        break;

      case "error":
        console.error(`❌ 服务器返回: ${JSON.stringify(message)}`);
        break;
      
      case "pong":
        break;

      case "relay_rainbow":
        console.log(`⚡ 收到系统自检消息，回复 ack`);
        this.sendAckRelayRainbow();
        break;

      default:
        console.log(`❓ 未知消息类型: ${message.type}`);
    }
  }

  sendAnswer(troubleId: number) {
    if (!this.isConnected) return;

    const message = {
      type: "answer",
      trouble_id: troubleId,
    };

    const response = JSON.stringify(message);
    console.log("📤 发送答案:", response);
    this.socket?.send(response);
  }

  nextQuestion() {
    if (!this.isConnected) return;

    const message = { type: "next_question" };
    const response = JSON.stringify(message);
    console.log("📤 发送: 下一题", response);
    this.socket?.send(response);
  }

  finishTest() {
    if (!this.isConnected) return;

    const message = {
      type: "finish",
      timestamp: getSecondTimestamp(),
    };
    const response = JSON.stringify(message);
    console.log("📤 发送: 交卷", response);
    this.socket?.send(response);
  }

  ping() {
    if (!this.isConnected) return;

    const message = { type: "ping" };
    const response = JSON.stringify(message);
    console.log("📤 发送心跳包:", response);
    this.socket?.send(response);
  }

  sendAckRelayRainbow() {
    if (!this.isConnected) return;

    const message = {
      type: "ack_relay_rainbow",
      timestamp: getSecondTimestamp(),
    };
    const response = JSON.stringify(message);
    console.log("📤 发送 ack_relay_rainbow:", response);
    this.socket?.send(response);
  }

  disconnect() {
    if (this.socket) {
      console.log("🔌 断开WebSocket连接");
      this.socket.close();
      this.socket = null;
    }
    // 清除心跳定时器
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
}

// 运行模拟器
async function runSimpleSimulation() {
  const simulator = new SimpleESP32Simulator();

  try {
    console.log("🚀 启动简化版ESP32模拟器...");
    await simulator.connect();

    console.log("⏳ 等待测试开始...");

    // 模拟器会在收到in_testing消息后自动开始答题
    // 不需要额外的定时器或复杂逻辑
  } catch (error) {
    console.error("💥 启动模拟失败:", error);
  }
}

// 如果直接执行此脚本
if (import.meta.main) {
  console.log("启动简化版ESP32 WebSocket模拟器...");
  runSimpleSimulation();
}

export { SimpleESP32Simulator };