// 模拟下位机客户端，测试装接评估功能

const ws = new WebSocket('ws://localhost:8000/ws');

ws.onopen = () => {
  console.log('连接到服务器成功');
  
  // 发送 ping 消息建立连接
  ws.send(JSON.stringify({
    type: 'ping',
    timestamp: Math.floor(Date.now() / 1000)
  }));
  
  // 等待一秒后发送装接评估更新消息
  setTimeout(() => {
    const evaluateFunctionBoardUpdate = {
      type: "evaluate_function_board_update",
      description: "YY-三角 双速正转电路",
      function_steps: [
        {
          description: "按下 SB1，电机低速",
          can_wait_for_ms: 4000,
          waited_for_ms: 1500,
          passed: true,
          finished: true,
        },
        {
          description: "按下 SB3，电机停",
          can_wait_for_ms: 8000,
          waited_for_ms: 3000,
          passed: false,
          finished: false,
        },
        {
          description: "按下 SB2，电机高速",
          can_wait_for_ms: 4000,
          waited_for_ms: 0,
          passed: false,
          finished: false,
        },
        {
          description: "按下 SB3，电机停",
          can_wait_for_ms: 10000,
          waited_for_ms: 0,
          passed: false,
          finished: false,
        }
      ]
    };
    
    console.log('发送装接评估更新消息:', evaluateFunctionBoardUpdate);
    ws.send(JSON.stringify(evaluateFunctionBoardUpdate));
  }, 1000);
  
  // 再等待几秒后发送更新的状态（模拟进度）
  setTimeout(() => {
    const updatedEvaluateFunctionBoardUpdate = {
      type: "evaluate_function_board_update",
      description: "YY-三角 双速正转电路",
      function_steps: [
        {
          description: "按下 SB1，电机低速",
          can_wait_for_ms: 4000,
          waited_for_ms: 1500,
          passed: true,
          finished: true,
        },
        {
          description: "按下 SB3，电机停",
          can_wait_for_ms: 8000,
          waited_for_ms: 7500,
          passed: true,
          finished: true,
        },
        {
          description: "按下 SB2，电机高速",
          can_wait_for_ms: 4000,
          waited_for_ms: 2000,
          passed: false,
          finished: false,
        },
        {
          description: "按下 SB3，电机停",
          can_wait_for_ms: 10000,
          waited_for_ms: 0,
          passed: false,
          finished: false,
        }
      ]
    };
    
    console.log('发送更新的装接评估状态:', updatedEvaluateFunctionBoardUpdate);
    ws.send(JSON.stringify(updatedEvaluateFunctionBoardUpdate));
  }, 5000);
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('收到服务器消息:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket错误:', error);
};

ws.onclose = () => {
  console.log('连接已关闭');
};

console.log('开始连接到服务器...');