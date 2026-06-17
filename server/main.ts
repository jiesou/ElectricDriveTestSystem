import { app } from "./server.ts";
import { clientManager } from "./routes/core/ClientManager.ts";
import { UdpCameraServer } from "./UdpCameraServer.ts";

await clientManager.loadAllClients();
clientManager.startHeartbeat();
new UdpCameraServer().start(8000);

console.log("Server starting on port 8000");
console.log("WebSocket endpoint: ws://localhost:8000/ws");
console.log("API endpoint: http://localhost:8000/api");

Deno.serve({ port: 8000 }, app.fetch);
