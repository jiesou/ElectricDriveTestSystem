// ESP32 Client Simulator for testing WebSocket functionality
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
        
        if (message.troubles.length === 0) {
          console.log("✅ All troubles in current question solved!");
        } else {
          console.log("🎯 Available troubles to answer:", message.troubles.join(", "));
          console.log("💡 Use sendAnswer(troubleId) to answer a specific trouble");
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
      timestamp: Math.floor(Date.now() / 1000)
    };
    console.log("📤 SENDING: Finishing test early");
    this.socket?.send(JSON.stringify(message));
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
    
    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      simulator.ping();
    }, 30000);
    
    console.log("\n🎮 Simulator is ready! Available commands:");
    console.log("   simulator.sendAnswer(troubleId) - Answer a specific trouble");
    console.log("   simulator.nextQuestion() - Move to next question");
    console.log("   simulator.previousQuestion() - Move to previous question");
    console.log("   simulator.finishTest() - Finish test early");
    console.log("   simulator.ping() - Send ping to server");
    console.log("   simulator.disconnect() - Disconnect from server");
    
    // Make the simulator available globally for manual control
    globalThis.simulator = simulator;
    
    // Keep running indefinitely for manual control
    
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