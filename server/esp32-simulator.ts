// ESP32 Client Simulator for testing WebSocket functionality
import { getSecondTimestamp } from "./types.ts";

const WS_URL = "ws://localhost:8000/ws";

class ESP32Simulator {
  private socket: WebSocket | null = null;
  private clientId: string = "";
  private isConnected: boolean = false;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(WS_URL);
      
      this.socket.onopen = () => {
        console.log("ESP32 Simulator connected to server");
        this.isConnected = true;
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error("Failed to parse message:", error);
        }
      };

      this.socket.onclose = () => {
        console.log("ESP32 Simulator disconnected");
        this.isConnected = false;
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(error);
      };
    });
  }

  private handleMessage(message: any) {
    console.log("\n=== RECEIVED MESSAGE ===");
    console.log("Type:", message.type);
    console.log("Full message:", JSON.stringify(message, null, 2));
    
    switch (message.type) {
      case "connected":
        this.clientId = message.clientId;
        console.log(`✅ Successfully connected! Assigned client ID: ${this.clientId}`);
        break;
      
      case "exist_troubles":
        console.log(`🔥 Current troubles: [${message.troubles.join(", ")}]`);
        console.log(`📋 Question ${message.current_question}/${message.total_questions}`);
        
        // Auto-answer the first trouble after 2 seconds
        if (message.troubles.length > 0) {
          console.log(`⏰ Will auto-answer trouble ${message.troubles[0]} in 2 seconds...`);
          setTimeout(() => {
            this.sendAnswer(message.troubles[0]);
          }, 2000);
        } else {
          console.log("✅ All troubles in current question solved!");
        }
        break;
      
      case "answer_result":
        const resultIcon = message.result ? "✅" : "❌";
        const resultText = message.result ? "CORRECT" : "WRONG";
        console.log(`${resultIcon} Answer for trouble ${message.trouble_id}: ${resultText}`);
        if (message.timestamp) {
          console.log(`⏰ Server timestamp: ${message.timestamp}`);
        }
        break;
      
      case "navigation_result":
        const navIcon = message.success ? "✅" : "❌";
        const navText = message.success ? "SUCCESS" : "FAILED";
        console.log(`${navIcon} Navigation ${message.direction}: ${navText}`);
        break;
      
      case "finish_result":
        const finishIcon = message.success ? "✅" : "❌";
        console.log(`${finishIcon} Test finish: ${message.success ? "SUCCESS" : "FAILED"}`);
        break;

      case "pong":
        console.log("🏓 Pong received from server");
        break;

      default:
        console.log(`❓ Unknown message type: ${message.type}`);
    }
    console.log("========================\n");
  }

  sendAnswer(troubleId: number) {
    if (!this.isConnected) return;
    
    const message = {
      type: "answer",
      trouble_id: troubleId
    };
    
    console.log("📤 SENDING ANSWER:", JSON.stringify(message, null, 2));
    this.socket?.send(JSON.stringify(message));
  }

  nextQuestion() {
    if (!this.isConnected) return;
    
    const message = { type: "next_question" };
    console.log("📤 SENDING: Moving to next question");
    this.socket?.send(JSON.stringify(message));
  }

  previousQuestion() {
    if (!this.isConnected) return;
    
    const message = { type: "last_question" };
    console.log("📤 SENDING: Moving to previous question");
    this.socket?.send(JSON.stringify(message));
  }

  finishTest() {
    if (!this.isConnected) return;
    
    const message = { 
      type: "finish", 
      timestamp: getSecondTimestamp()
    };
    console.log("📤 SENDING: Finishing test early");
    this.socket?.send(JSON.stringify(message));
  }

  requestWiringEvaluation() {
    setTimeout(() => {
      const message = { 
        type: "evaluate_wiring_yolo_request", 
        timestamp: getSecondTimestamp()
      };
      console.log("📤 SENDING: evaluate_wiring_yolo_request");
      this.socket?.send(JSON.stringify(message));
    }, 1000);
  }

  ping() {
    if (!this.isConnected) return;
    
    const message = { type: "ping" };
    console.log("📤 SENDING: Ping");
    this.socket?.send(JSON.stringify(message));
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

// Test the simulator
async function runSimulation() {
  const simulator = new ESP32Simulator();
  
  try {
    console.log("🚀 Starting ESP32 WebSocket Simulator...");
    await simulator.connect();
    
    // Send ping every 10 seconds
    const pingInterval = setInterval(() => {
      simulator.ping();
    }, 10000);

    setTimeout(() => {
      console.log("\n📡 === Testing wiring evaluation request ===");
      simulator.requestWiringEvaluation();
    }, 1000);
    
    // Simulate some interactions
    setTimeout(() => {
      console.log("\n🧪 === Testing navigation ===");
      simulator.nextQuestion();
    }, 15000);
    
    setTimeout(() => {
      simulator.previousQuestion();
    }, 20000);

    setTimeout(() => {
      console.log("\n🏁 === Testing early finish ===");
      simulator.finishTest();
    }, 25000);
    
    // Keep running (comment out to run indefinitely)
    // setTimeout(() => {
    //   clearInterval(pingInterval);
    //   simulator.disconnect();
    //   console.log("🔚 Simulation ended");
    // }, 40000);
    
  } catch (error) {
    console.error("💥 Failed to start simulation:", error);
  }
}

// Run if this script is executed directly
if (import.meta.main) {
  console.log("Starting ESP32 WebSocket Simulator...");
  runSimulation();
}

export { ESP32Simulator };