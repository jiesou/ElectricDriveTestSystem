# CV 客户端前端界面实现说明

## 概述

本次实现为电力拖动测试系统添加了 CV（计算机视觉）客户端的前端监控界面，支持实时显示视觉客户端的图像流和会话状态。

## 主要功能

### 1. 客户机状态表格增强

在"实时客户机状态"表格中添加了"关联视觉客户端"列，显示每个客户机关联的 CV 客户端 IP 地址。

### 2. 实时视觉客户端监控

新增"实时视觉客户端"组件，以卡片形式展示所有 CV 客户端的状态：

- **实时图像流**：通过 MJPEG 流显示摄像头实时画面
- **会话状态**：显示当前 CV 会话类型（装接评估/人脸签到/空闲）
- **客户端信息**：显示客户机 IP 和 CV 客户端 IP
- **会话详情**：显示会话开始时间等信息
- **空状态处理**：
  - 无 CV 客户端时显示"暂无视觉客户端连接"
  - 图像加载失败时显示"摄像头连接中..."

## 技术实现

### 后端

#### 1. 类型定义更新

在 `server/types.ts` 中为 `CvClient` 接口添加了 `latest_frame` 字段：

```typescript
export interface CvClient {
  clientType: "esp32cam" | "jetson_nano";
  ip: string;
  session?: EvaluateWiringSession | FaceSigninSession;
  latest_frame?: Uint8Array; // 最新的 JPEG 帧数据
}
```

#### 2. UDP 图传接收器

创建 `UdpCameraReceiver.ts` 类处理 UDP 图传数据包：

- **包格式**：4字节IP + 4字节frame_index + 2字节chunk_index + 2字节chunk_total + payload
- **分片组装**：自动收集并组装分片 JPEG 数据
- **缓存管理**：自动清理超过5帧的过时数据
- **Deno 2.x 兼容**：由于 Deno 2.x 移除了 UDP API，当前提供友好的警告信息

#### 3. HTTP 图像上传端点

在 `server/routes/cv.ts` 添加 `/api/cv/upload_frame` 端点：

```typescript
POST /api/cv/upload_frame
Content-Type: application/json

{
  "cvClientIp": "192.168.1.200",
  "frame": "base64_encoded_jpeg_data"
}
```

支持两种格式：
- JSON 格式（base64 编码）
- multipart/form-data 格式

#### 4. MJPEG 流端点

添加 `/api/cv/stream/:cvClientIp` 端点提供实时图像流：

```typescript
GET /api/cv/stream/:cvClientIp
Content-Type: multipart/x-mixed-replace; boundary=frame
```

- 帧率：10 fps（每 100ms 一帧）
- 格式：标准 MJPEG，所有浏览器兼容
- 自动从 `cvClient.latest_frame` 读取最新帧

### 前端

#### 1. ClientTable.vue 更新

在表格列定义中添加"关联视觉客户端"列：

```typescript
{
  title: '关联视觉客户端',
  key: 'cvClient',
  customRender: ({ record }: { record: Client }) => ({ record })
}
```

在模板中显示 CV 客户端 IP：

```vue
<template v-if="column.key === 'cvClient'">
  <span v-if="record.cvClient">{{ record.cvClient.ip }}</span>
  <span v-else style="color: #999;">无</span>
</template>
```

#### 2. CvClientMonitor.vue 新组件

新建组件用于显示 CV 客户端状态：

- **布局**：响应式网格布局（最小 400px，自动填充）
- **图像显示**：使用 `<img>` 标签直接显示 MJPEG 流
- **状态标签**：根据会话类型显示不同颜色的标签
- **信息展示**：显示客户机 IP、CV 客户端 IP、会话时间等

#### 3. ClientMonitoring.vue 集成

在客户机监控页面集成 CvClientMonitor 组件：

```vue
<!-- 实时视觉客户端 -->
<div style="margin-top: 20px;">
  <CvClientMonitor />
</div>
```

## 配置

### cvClientMap.json

在服务器目录下的 `cvClientMap.json` 文件配置客户机与 CV 客户端的映射关系：

```json
[
  {
    "clientIp": "192.168.1.100",
    "cvClientIp": "192.168.1.200",
    "cvClientType": "esp32cam"
  },
  {
    "clientIp": "192.168.1.101",
    "cvClientIp": "192.168.1.201",
    "cvClientType": "jetson_nano"
  }
]
```

- `clientIp`：普通客户机的 IP 地址
- `cvClientIp`：关联的 CV 客户端 IP 地址
- `cvClientType`：CV 客户端类型（`esp32cam` 或 `jetson_nano`）

## 使用方法

### 启动服务器

```bash
cd server
deno run --allow-net --allow-read --allow-write main.ts
```

### CV 客户端上传图像

#### 方法 1：HTTP POST（推荐）

```bash
curl -X POST http://localhost:8000/api/cv/upload_frame \
  -H "Content-Type: application/json" \
  -d '{
    "cvClientIp": "192.168.1.200",
    "frame": "base64_encoded_jpeg_data"
  }'
```

#### 方法 2：使用模拟器测试

```bash
cd server
deno run --allow-net --allow-read cv-client-simulator.ts
```

模拟器会每秒上传一个测试帧。

### 查看监控界面

1. 打开浏览器访问 `http://localhost:8000`
2. 点击左侧菜单的"客户机监控"
3. 在"实时客户机状态"表格中查看关联的 CV 客户端 IP
4. 在"实时视觉客户端"卡片中查看实时图像流和会话状态

## API 参考

### POST /api/cv/upload_frame

上传图像帧到指定的 CV 客户端。

**请求体（JSON）**：
```json
{
  "cvClientIp": "192.168.1.200",
  "frame": "base64_encoded_jpeg_data"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "frameSize": 12345
  }
}
```

### GET /api/cv/stream/:cvClientIp

获取指定 CV 客户端的实时 MJPEG 流。

**参数**：
- `cvClientIp`：CV 客户端的 IP 地址

**响应**：
- Content-Type: `multipart/x-mixed-replace; boundary=frame`
- 持续推送 JPEG 帧数据

## 注意事项

1. **UDP 支持**：由于 Deno 2.x 移除了 `Deno.listenDatagram` API，当前版本不支持 UDP 图传。建议使用 HTTP POST 方式上传图像。

2. **性能考虑**：
   - MJPEG 流以 10fps 推送，适合大多数监控场景
   - 如需更高帧率，可调整 `cv.ts` 中的 interval 参数
   - 建议图像分辨率不超过 640x480 以确保流畅性

3. **网络要求**：
   - CV 客户端需要能够访问服务器的 HTTP 端点
   - 浏览器需要能够访问服务器以接收 MJPEG 流
   - 确保防火墙允许相应端口的通信

4. **客户端连接**：
   - CV 客户端需要先有对应的普通客户机连接到服务器
   - 映射关系在 `cvClientMap.json` 中配置
   - 普通客户机连接后自动关联 CV 客户端

## 故障排除

### 问题：显示"摄像头连接中..."

**可能原因**：
1. CV 客户端未上传图像
2. CV 客户端 IP 配置错误
3. 网络连接问题

**解决方法**：
1. 检查 `cvClientMap.json` 配置是否正确
2. 确认 CV 客户端正在上传图像
3. 查看服务器日志确认是否收到上传请求

### 问题：显示"暂无视觉客户端连接"

**可能原因**：
1. 没有配置 CV 客户端映射
2. 对应的普通客户机未连接

**解决方法**：
1. 在 `cvClientMap.json` 中添加映射配置
2. 确保对应的普通客户机已通过 WebSocket 连接到服务器

### 问题：图像不更新

**可能原因**：
1. CV 客户端停止上传
2. 网络延迟或丢包

**解决方法**：
1. 检查 CV 客户端运行状态
2. 查看服务器日志确认最近的上传时间
3. 刷新浏览器页面

## 开发计划

未来可能的改进：

1. **WebRTC 支持**：使用 WebRTC 实现更低延迟的视频流
2. **帧率控制**：允许用户动态调整帧率
3. **图像质量控制**：支持调整 JPEG 压缩质量
4. **录像功能**：支持录制和回放
5. **多窗口布局**：支持全屏或多窗口显示
6. **性能统计**：显示帧率、延迟等统计信息
