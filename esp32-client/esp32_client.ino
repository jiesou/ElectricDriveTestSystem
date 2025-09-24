#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// WiFi配置
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// 服务器配置
const char* websocket_server = "192.168.1.100";  // 替换为实际服务器IP
const int websocket_port = 8000;

// 硬件引脚定义
const int relayPins[5] = {2, 4, 5, 18, 19};  // 5个继电器控制引脚
const int buttonPins[5] = {12, 13, 14, 27, 26};  // 5个故障输入按钮
const int ledPin = 25;  // 状态指示LED

WebSocketsClient webSocket;
String clientId = "";
bool testActive = false;
unsigned long lastHeartbeat = 0;

void setup() {
    Serial.begin(115200);
    
    // 初始化引脚
    setupPins();
    
    // 连接WiFi
    connectWiFi();
    
    // 连接WebSocket
    webSocket.begin(websocket_server, websocket_port, "/ws");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
    
    Serial.println("ESP32电力拖动测试客户端启动完成");
}

void loop() {
    webSocket.loop();
    
    // 检查按钮输入
    if (testActive) {
        checkButtons();
    }
    
    // 心跳包
    if (millis() - lastHeartbeat > 30000) {
        sendHeartbeat();
        lastHeartbeat = millis();
    }
    
    delay(10);
}

void setupPins() {
    // 初始化继电器引脚
    for (int i = 0; i < 5; i++) {
        pinMode(relayPins[i], OUTPUT);
        digitalWrite(relayPins[i], LOW);
    }
    
    // 初始化按钮引脚
    for (int i = 0; i < 5; i++) {
        pinMode(buttonPins[i], INPUT_PULLUP);
    }
    
    // 初始化LED
    pinMode(ledPin, OUTPUT);
    digitalWrite(ledPin, LOW);
}

void connectWiFi() {
    WiFi.begin(ssid, password);
    Serial.print("连接WiFi");
    
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    
    Serial.println();
    Serial.print("WiFi连接成功! IP地址: ");
    Serial.println(WiFi.localIP());
    
    digitalWrite(ledPin, HIGH);  // WiFi连接成功指示
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("WebSocket断开连接");
            testActive = false;
            digitalWrite(ledPin, LOW);
            break;
            
        case WStype_CONNECTED:
            Serial.printf("WebSocket连接成功: %s\n", payload);
            sendClientInfo();
            break;
            
        case WStype_TEXT:
            handleMessage((char*)payload);
            break;
            
        default:
            break;
    }
}

void handleMessage(const char* payload) {
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload);
    
    String messageType = doc["type"];
    
    if (messageType == "connected") {
        clientId = doc["clientId"].as<String>();
        Serial.println("收到客户端ID: " + clientId);
        digitalWrite(ledPin, HIGH);
        
    } else if (messageType == "test_state") {
        testActive = true;
        JsonArray troubles = doc["exist_troubles"];
        
        Serial.print("接收到故障状态: ");
        for (int i = 0; i < troubles.size(); i++) {
            Serial.print(troubles[i].as<int>());
            Serial.print(" ");
        }
        Serial.println();
        
        updateRelays(troubles);
        
    } else if (messageType == "answer_result") {
        bool correct = doc["correct"];
        int faultId = doc["faultId"];
        
        if (correct) {
            Serial.println("答案正确! 故障" + String(faultId) + "已解决");
            blinkLed(3, 200);  // 成功指示
        } else {
            Serial.println("答案错误! 故障" + String(faultId));
            blinkLed(1, 1000);  // 错误指示
        }
        
    } else if (messageType == "test_completed") {
        Serial.println("测试完成!");
        testActive = false;
        resetAllRelays();
        blinkLed(5, 100);  // 完成指示
    }
}

void updateRelays(JsonArray troubles) {
    // 首先关闭所有继电器
    resetAllRelays();
    
    // 根据故障列表激活对应继电器
    for (int i = 0; i < troubles.size(); i++) {
        int faultId = troubles[i];
        if (faultId >= 1 && faultId <= 5) {
            digitalWrite(relayPins[faultId - 1], HIGH);
            Serial.println("激活故障" + String(faultId) + "继电器");
        }
    }
}

void checkButtons() {
    static unsigned long lastButtonCheck = 0;
    static bool buttonStates[5] = {false};
    
    if (millis() - lastButtonCheck < 50) return;  // 防抖动
    lastButtonCheck = millis();
    
    for (int i = 0; i < 5; i++) {
        bool currentState = !digitalRead(buttonPins[i]);  // 按下为LOW
        
        if (currentState && !buttonStates[i]) {
            // 按钮被按下
            submitAnswer(i + 1);
            Serial.println("按钮" + String(i + 1) + "被按下，提交故障" + String(i + 1));
        }
        
        buttonStates[i] = currentState;
    }
}

void submitAnswer(int faultId) {
    DynamicJsonDocument doc(200);
    doc["type"] = "answer";
    doc["faultId"] = faultId;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
    
    Serial.println("提交答案: 故障" + String(faultId));
}

void sendClientInfo() {
    DynamicJsonDocument doc(200);
    doc["type"] = "client_info";
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
}

void sendHeartbeat() {
    if (clientId != "") {
        DynamicJsonDocument doc(150);
        doc["type"] = "heartbeat";
        doc["clientId"] = clientId;
        
        String message;
        serializeJson(doc, message);
        webSocket.sendTXT(message);
    }
}

void resetAllRelays() {
    for (int i = 0; i < 5; i++) {
        digitalWrite(relayPins[i], LOW);
    }
    Serial.println("所有继电器已复位");
}

void blinkLed(int times, int duration) {
    for (int i = 0; i < times; i++) {
        digitalWrite(ledPin, LOW);
        delay(duration / 2);
        digitalWrite(ledPin, HIGH);
        delay(duration / 2);
    }
}