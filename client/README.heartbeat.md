客户端应用层心跳示例

说明： 服务端现在使用应用层心跳：客户端须定期发送 JSON 消息 {"type":"ping"} 到 WebSocket 服务端（/ws）。服务端在收到后会更新 `lastPing` 并回复 {"type":"pong", "timestamp": ...}。

最小浏览器端示例（在网页控制台或客户端代码中运行）：

```js
const ws = new WebSocket('ws://localhost:8000/ws');
ws.addEventListener('open', () => {
  console.log('ws open');
  // 立即发送一次 ping
  ws.send(JSON.stringify({ type: 'ping' }));
  // 每 5 秒发送一次应用层 ping
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 5000);
});

ws.addEventListener('message', (ev) => {
  try {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'pong') {
      console.log('pong from server', msg);
    }
  } catch (e) {
    console.error('invalid message', e);
  }
});

ws.addEventListener('close', (ev) => {
  console.log('ws closed', ev);
});
```

服务器端行为：若服务端连续 10 秒未收到客户端的应用层 ping，将认定为断连并主动断开连接（close code 4000, reason "heartbeat timeout"）。

注意：请确保客户端不要再依赖底层 WebSocket 的自动 ping/pong 特性，使用以上应用层 ping 即可。
