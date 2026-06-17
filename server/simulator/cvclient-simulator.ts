import { getSecondTimestamp } from "../utils/helpers.ts";

export interface SimulatorConfig {
  wsUrl?: string;
  pingIntervalMs?: number;
  reconnectDelayMs?: number;
  answerDelayMs?: number;
  alwaysCorrect?: boolean;
}

export interface SimulatorMetrics {
  connectTime: number;
  disconnectTime?: number;
  messagesSent: number;
  messagesReceived: number;
  pingsSent: number;
  pongsReceived: number;
  answersSent: number;
  answersCorrect: number;
  errors: number;
  reconnects: number;
}

export class CvClientSimulator {
  public socket: WebSocket | null = null;
  public clientId: string = "";
  public isConnected: boolean = false;
  public metrics: SimulatorMetrics = {
    connectTime: 0,
    messagesSent: 0,
    messagesReceived: 0,
    pingsSent: 0,
    pongsReceived: 0,
    answersSent: 0,
    answersCorrect: 0,
    errors: 0,
    reconnects: 0,
  };

  public currentQuestion: number = 0;
  public totalQuestions: number = 0;
  public isTestActive: boolean = false;

  private config: Required<SimulatorConfig>;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private pendingResolve: ((value: unknown) => boolean | void) | null = null;
  private messageQueue: unknown[] = [];

  constructor(config: SimulatorConfig = {}) {
    this.config = {
      wsUrl: config.wsUrl || "ws://localhost:8000/ws",
      pingIntervalMs: config.pingIntervalMs ?? 3000,
      reconnectDelayMs: config.reconnectDelayMs ?? 5000,
      answerDelayMs: config.answerDelayMs ?? 500,
      alwaysCorrect: config.alwaysCorrect ?? true,
    };
  }

  get id(): string {
    return this.clientId || "not-connected";
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.config.wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.metrics.connectTime = Date.now();
        this.startPing();
        resolve();
      };

      this.socket.onmessage = (event) => {
        this.metrics.messagesReceived++;
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch {
          // ignore parse errors
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.stopPing();
        this.metrics.reconnects++;
        setTimeout(() => this.connect(), this.config.reconnectDelayMs);
      };

      this.socket.onerror = () => {
        this.metrics.errors++;
      };
    });
  }

  disconnect(): void {
    this.stopPing();
    this.metrics.disconnectTime = Date.now();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.isConnected || !this.socket) return;
    const msg = { type, ...payload, timestamp: getSecondTimestamp() };
    this.socket.send(JSON.stringify(msg));
    this.metrics.messagesSent++;
    if (type === "ping") this.metrics.pingsSent++;
    if (type === "answer") this.metrics.answersSent++;
  }

  sendAnswer(troubleId: number): void {
    this.send("answer", { trouble_id: troubleId });
  }

  nextQuestion(): void {
    this.send("next_question");
  }

  finishTest(): void {
    this.send("finish");
  }

  ackRelayRainbow(): void {
    this.send("ack_relay_rainbow");
  }

  waitForMessage(predicate: (msg: unknown) => boolean, timeoutMs = 5000): Promise<unknown> {
    const existing = this.messageQueue.find(predicate);
    if (existing) {
      this.messageQueue = this.messageQueue.filter((m) => m !== existing);
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      this.pendingResolve = (msg: unknown) => {
        if (predicate(msg)) {
          resolve(msg);
          this.pendingResolve = null;
          return true;
        }
        return false;
      };
      setTimeout(() => {
        if (this.pendingResolve) {
          this.pendingResolve = null;
          reject(new Error("waitForMessage timeout"));
        }
      }, timeoutMs);
    });
  }

  private handleMessage(message: unknown): void {
    if (this.pendingResolve) {
      const handled = this.pendingResolve(message);
      if (handled) return;
    }
    this.messageQueue.push(message);

    const msg = message as Record<string, unknown>;
    switch (msg.type) {
      case "connected":
        this.clientId = msg.clientId as string;
        break;

      case "in_testing":
        this.isTestActive = true;
        this.currentQuestion = (msg.current_question_index as number) + 1;
        this.totalQuestions = msg.total_questions as number;

        if (msg.exist_troubles && Array.isArray(msg.exist_troubles) && msg.exist_troubles.length > 0) {
          const troubleId = (msg.exist_troubles[0] as Record<string, unknown>).id as number;
          setTimeout(() => this.sendAnswer(troubleId), this.config.answerDelayMs);
        } else if (this.currentQuestion >= this.totalQuestions) {
          setTimeout(() => this.finishTest(), this.config.answerDelayMs);
        } else {
          setTimeout(() => this.nextQuestion(), this.config.answerDelayMs);
        }
        break;

      case "answer_result":
        if ((msg.result as boolean)) {
          this.metrics.answersCorrect++;
        }
        break;

      case "relay_rainbow":
        this.ackRelayRainbow();
        break;

      case "pong":
        this.metrics.pongsReceived++;
        break;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingIntervalId = setInterval(() => {
      this.send("ping");
    }, this.config.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
}

export class SimulatorPool {
  private simulators: Map<string, CvClientSimulator> = new Map();

  async spawn(count: number, config?: SimulatorConfig): Promise<CvClientSimulator[]> {
    const created: CvClientSimulator[] = [];
    for (let i = 0; i < count; i++) {
      const sim = new CvClientSimulator(config);
      const id = `sim-${i}-${Date.now()}`;
      this.simulators.set(id, sim);
      created.push(sim);
    }
    await Promise.all(created.map((s) => s.connect()));
    return created;
  }

  get(id: string): CvClientSimulator | undefined {
    return this.simulators.get(id);
  }

  getAll(): CvClientSimulator[] {
    return Array.from(this.simulators.values());
  }

  disconnectAll(): void {
    for (const sim of this.simulators.values()) {
      sim.disconnect();
    }
    this.simulators.clear();
  }

  get aggregateMetrics() {
    const all = this.getAll();
    return {
      total: all.length,
      connected: all.filter((s) => s.isConnected).length,
      totalMessagesSent: all.reduce((sum, s) => sum + s.metrics.messagesSent, 0),
      totalMessagesReceived: all.reduce((sum, s) => sum + s.metrics.messagesReceived, 0),
      totalErrors: all.reduce((sum, s) => sum + s.metrics.errors, 0),
      totalReconnects: all.reduce((sum, s) => sum + s.metrics.reconnects, 0),
    };
  }
}
