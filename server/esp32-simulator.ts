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
    console.log("Received message:", message);
    
    switch (message.type) {
      case "connected":
        this.clientId = message.clientId;
        console.log(`Assigned client ID: ${this.clientId}`);
        break;
      
      case "exist_troubles":
        console.log(`Current troubles: ${message.troubles.join(", ")}`);
        console.log(`Question ${message.current_question}/${message.total_questions}`);
        
        // Auto-answer the first trouble after 2 seconds
        if (message.troubles.length > 0) {
          setTimeout(() => {
            this.sendAnswer(message.troubles[0]);
          }, 2000);
        }
        break;
      
      case "answer_result":
        console.log(`Answer for trouble ${message.trouble_id}: ${message.result ? "CORRECT" : "WRONG"}`);
        break;
      
      case "navigation_result":
        console.log(`Navigation ${message.direction}: ${message.success ? "SUCCESS" : "FAILED"}`);
        break;
    }
  }

  sendAnswer(troubleId: number) {
    if (!this.isConnected) return;
    
    const message = {
      type: "answer",
      trouble_id: troubleId
    };
    
    console.log("Sending answer:", message);
    this.socket?.send(JSON.stringify(message));
  }

  nextQuestion() {
    if (!this.isConnected) return;
    
    const message = { type: "next_question" };
    console.log("Moving to next question");
    this.socket?.send(JSON.stringify(message));
  }

  previousQuestion() {
    if (!this.isConnected) return;
    
    const message = { type: "last_question" };
    console.log("Moving to previous question");
    this.socket?.send(JSON.stringify(message));
  }

  ping() {
    if (!this.isConnected) return;
    
    const message = { type: "ping" };
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
    await simulator.connect();
    
    // Send ping every 5 seconds
    const pingInterval = setInterval(() => {
      simulator.ping();
    }, 5000);
    
    // Simulate some interactions
    setTimeout(() => {
      console.log("\n=== Testing navigation ===");
      simulator.nextQuestion();
    }, 10000);
    
    setTimeout(() => {
      simulator.previousQuestion();
    }, 15000);
    
    // Cleanup after 30 seconds
    // setTimeout(() => {
    //   clearInterval(pingInterval);
    //   simulator.disconnect();
    //   console.log("Simulation ended");
    // }, 30000);
    
  } catch (error) {
    console.error("Failed to start simulation:", error);
  }
}

// Run if this script is executed directly
if (import.meta.main) {
  console.log("Starting ESP32 WebSocket Simulator...");
  runSimulation();
}

export { ESP32Simulator };