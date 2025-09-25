// Types and interfaces
export interface Trouble {
  id: number;
  description: string;
}

export interface Question {
  id: number;
  troubles: number[]; // trouble IDs
}

export interface TestSession {
  id: string;
  questions: Question[];
  currentQuestionIndex: number;
  startTime: number; // timestamp
  clientId: string;
  remainingTroubles: number[]; // troubles not yet solved for current question
}

export interface ClientConnection {
  id: string;
  ip: string;
  socket: WebSocket;
  session?: TestSession;
}

// WebSocket message types
export interface WSMessage {
  type: string;
  [key: string]: any;
}

export interface ExistTroublesMessage extends WSMessage {
  type: "exist_troubles";
  troubles: number[];
  current_question: number;
  total_questions: number;
}

export interface AnswerMessage extends WSMessage {
  type: "answer";
  trouble_id: number;
}

export interface AnswerResultMessage extends WSMessage {
  type: "answer_result";
  result: boolean;
}

export interface QuestionNavigationMessage extends WSMessage {
  type: "last_question" | "next_question";
}

// Predefined troubles (hardcoded as requested)
export const TROUBLES: Trouble[] = [
  { id: 1, description: "101 和 102 断路" },
  { id: 2, description: "102 和 103 断路" },
  { id: 3, description: "103 和 104 断路" },
  { id: 4, description: "104 和 105 断路" },
  { id: 5, description: "201 和 202 断路" },
  { id: 6, description: "202 和 203 断路" },
];

export class TestSystemManager {
  private clients = new Map<string, ClientConnection>();
  private questionBank: Question[] = [
    { id: 1, troubles: [1, 2] },
    { id: 2, troubles: [3, 4] },
    { id: 3, troubles: [1, 3, 5] },
    { id: 4, troubles: [2, 4, 6] },
  ];
  private broadcastInterval?: number;

  constructor() {
    this.startBroadcast();
  }

  addClient(clientId: string, ip: string, socket: WebSocket) {
    const client: ClientConnection = {
      id: clientId,
      ip,
      socket,
    };
    this.clients.set(clientId, client);
    console.log(`Client ${clientId} (${ip}) connected`);
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId);
    console.log(`Client ${clientId} disconnected`);
  }

  getConnectedClients(): ClientConnection[] {
    return Array.from(this.clients.values());
  }

  createTestSession(clientId: string, questions: Question[], startTime: number): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const session: TestSession = {
      id: `${clientId}_${Date.now()}`,
      questions,
      currentQuestionIndex: 0,
      startTime,
      clientId,
      remainingTroubles: [...questions[0].troubles],
    };

    client.session = session;
    return true;
  }

  handleAnswer(clientId: string, troubleId: number): boolean {
    const client = this.clients.get(clientId);
    if (!client?.session) return false;

    const session = client.session;
    const currentQuestion = session.questions[session.currentQuestionIndex];
    
    // Check if the trouble is part of current question
    const isCorrect = currentQuestion.troubles.includes(troubleId) && 
                     session.remainingTroubles.includes(troubleId);
    
    if (isCorrect) {
      // Remove solved trouble
      session.remainingTroubles = session.remainingTroubles.filter(t => t !== troubleId);
    }

    return isCorrect;
  }

  navigateQuestion(clientId: string, direction: "next" | "prev"): boolean {
    const client = this.clients.get(clientId);
    if (!client?.session) return false;

    const session = client.session;
    const newIndex = direction === "next" 
      ? session.currentQuestionIndex + 1 
      : session.currentQuestionIndex - 1;

    if (newIndex >= 0 && newIndex < session.questions.length) {
      session.currentQuestionIndex = newIndex;
      // Reset remaining troubles for new question
      session.remainingTroubles = [...session.questions[newIndex].troubles];
      return true;
    }

    return false;
  }

  private startBroadcast() {
    this.broadcastInterval = setInterval(() => {
      this.broadcastTroubleStatus();
    }, 500); // 0.5 seconds
  }

  private broadcastTroubleStatus() {
    for (const client of this.clients.values()) {
      if (client.session && client.socket.readyState === WebSocket.OPEN) {
        const session = client.session;
        const currentTime = Date.now() / 1000;
        
        // Only broadcast if test has started
        if (currentTime >= session.startTime) {
          const message: ExistTroublesMessage = {
            type: "exist_troubles",
            troubles: session.remainingTroubles,
            current_question: session.currentQuestionIndex + 1,
            total_questions: session.questions.length,
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

  addQuestion(question: Omit<Question, "id">): Question {
    const newQuestion: Question = {
      id: Math.max(...this.questionBank.map(q => q.id), 0) + 1,
      ...question,
    };
    this.questionBank.push(newQuestion);
    return newQuestion;
  }

  getQuestions(): Question[] {
    return [...this.questionBank];
  }

  updateQuestion(id: number, updates: Partial<Question>): boolean {
    const index = this.questionBank.findIndex(q => q.id === id);
    if (index === -1) return false;
    
    this.questionBank[index] = { ...this.questionBank[index], ...updates };
    return true;
  }

  deleteQuestion(id: number): boolean {
    const index = this.questionBank.findIndex(q => q.id === id);
    if (index === -1) return false;
    
    this.questionBank.splice(index, 1);
    return true;
  }

  getTroubles(): Trouble[] {
    return [...TROUBLES];
  }

  cleanup() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
  }
}