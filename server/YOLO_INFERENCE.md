# YOLO11 服务端推理实现文档

## 概述

本实现为装接评估功能添加了服务端 YOLO11 目标检测推理能力。当 CV 客户端（ESP32-CAM 或 Jetson Nano）没有发送推理结果时，服务器会自动使用 ONNX Runtime 进行推理。

## 文件结构

```
server/
├── model.ts              # YOLO11 推理模块（新增）
├── routes/cv.ts          # CV 上传路由（已修改）
├── test_model.ts         # 模型推理测试脚本（新增）
├── test_cv_endpoint.ts   # CV 端点测试脚本（新增）
├── deno.json             # Deno 配置（已修改）
├── .gitignore            # Git 忽略文件（已修改）
└── yolo11n.onnx          # YOLO11 模型文件（需下载，已在 .gitignore）
```

## 主要功能

### 1. model.ts - YOLO11 推理模块

#### 核心函数

##### `detectObjects(imageBuffer, confThreshold, iouThreshold)`
- **参数**:
  - `imageBuffer`: Uint8Array - JPEG 图像数据
  - `confThreshold`: number - 置信度阈值（默认 0.1）
  - `iouThreshold`: number - IoU 阈值用于 NMS（默认 0.3）
- **返回值**: Promise<{ sleeves_num, cross_num, excopper_num, exterminal_num }>
- **功能**: 对图像进行目标检测，返回各类别的数量统计

#### 内部流程

1. **图像预处理** (`prepareInput`)
   - 使用 sharp 读取 JPEG 图像
   - Resize 到 640x640 像素
   - 移除 alpha 通道
   - 提取 RGB 通道并归一化到 [0, 1]
   - 转换为 ONNX 张量格式 [1, 3, 640, 640]

2. **模型推理** (`runModel`)
   - 加载 yolo11n.onnx 模型（首次调用时）
   - 运行 ONNX 推理
   - 返回原始输出 [1, 84, 8400]

3. **输出后处理** (`processOutput`)
   - 解析 YOLO11 转置输出格式
   - 提取边界框坐标和类别置信度
   - 应用置信度阈值过滤
   - 执行 NMS（非极大值抑制）去除重复检测
   - 转换坐标到原始图像尺寸

4. **结果统计** (`countDetections`)
   - 统计各类别的检测数量
   - 返回装接评估所需的四个指标

### 2. routes/cv.ts - CV 上传路由修改

#### POST /api/cv/upload_wiring 更新

**支持两种请求格式**:

1. **JSON 格式**:
```json
{
  "image": "data:image/jpeg;base64,...",
  "result": {
    "sleeves_num": 10,
    "cross_num": 2,
    "excopper_num": 1,
    "exterminal_num": 0
  }
}
```

2. **二进制 JPEG 格式**:
```
Content-Type: image/jpeg
Body: [binary JPEG data]
```

**处理逻辑**:

1. 根据 Content-Type 判断请求格式
   - `application/json`: 解析 JSON body
   - 其他: 作为二进制 JPEG 读取

2. 检查是否有推理结果 (`result` 字段)
   - 有 result: 直接使用
   - 无 result: 调用服务端 YOLO 推理

3. 服务端推理流程:
   - 确定图像数据源（二进制请求体 / latest_frame）
   - 如果是 base64 字符串，解码为 Uint8Array
   - 调用 `detectObjects()` 进行推理
   - 使用推理结果创建拍摄记录

4. 图像格式转换:
   - 统一转换为 base64 字符串存储
   - 支持 Uint8Array → base64 转换

## 技术细节

### YOLO11 输出格式

YOLO11 使用转置输出格式（与 YOLOv8 相同）:
- 输出形状: [1, 84, 8400]
- 84 = 4 (bbox) + 80 (classes)
- 8400 = 80×80 + 40×40 + 20×20 检测点

数据组织:
```
output[0:8400]           - X 中心坐标
output[8400:16800]       - Y 中心坐标
output[16800:25200]      - 宽度
output[25200:33600]      - 高度
output[33600:42000]      - 类别 0 置信度
...
output[705600:714000]    - 类别 79 置信度
```

### NMS 算法

1. 按置信度降序排序所有检测框
2. 选择置信度最高的框加入结果
3. 移除与该框 IoU > threshold 的所有框
4. 重复步骤 2-3 直到所有框处理完

### 类别映射

当前假设训练模型的类别 ID:
- 0: sleeve (号码管)
- 1: cross (交叉)
- 2: excopper (露铜)
- 3: exterminal (露端子)

**注意**: 需要根据实际训练的模型调整类别 ID 映射。

## 依赖包

### npm 包（通过 Deno npm: 前缀）

- `onnxruntime-node@1.19.2`: ONNX Runtime Node.js 绑定
- `sharp@0.33.5`: 高性能图像处理库

### 配置要求

```json
{
  "nodeModulesDir": "auto"  // 必须启用以支持 npm 包构建脚本
}
```

安装命令:
```bash
deno install --allow-scripts=npm:sharp,npm:onnxruntime-node
```

## 模型文件

### 下载 YOLO11n 模型

```bash
cd server
wget -O yolo11n.onnx "https://huggingface.co/webnn/yolo11n/resolve/main/onnx/yolo11n.onnx"
```

模型大小: ~10.7 MB

**注意**: 模型文件已添加到 .gitignore，不会提交到版本库。

## 测试

### 1. 模型推理测试

```bash
cd server
deno run -A test_model.ts
```

测试内容:
- 创建纯色测试图像
- 运行 YOLO 推理
- 验证推理流程正常

### 2. CV 端点测试

```bash
# 终端 1: 启动服务器
deno run -A main.ts

# 终端 2: 运行测试
deno run -A test_cv_endpoint.ts
```

测试内容:
- 二进制 JPEG 上传
- JSON 格式上传（无 result）
- 验证请求处理逻辑

## 性能优化

### 模型缓存

- 模型在首次调用时加载到内存
- 后续推理直接使用缓存的模型
- 避免重复加载开销

### 推理性能

- YOLO11n (nano) 模型：轻量级，适合 CPU 推理
- Sharp 图像处理：原生 C++ 实现，高性能
- 预期单次推理时间：< 500ms（CPU）

## 使用示例

### 1. 客户端发送带推理结果

```javascript
fetch('/api/cv/upload_wiring', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image: 'data:image/jpeg;base64,...',
    result: {
      sleeves_num: 10,
      cross_num: 2,
      excopper_num: 1,
      exterminal_num: 0
    }
  })
});
```

### 2. 客户端发送纯图像（触发服务端推理）

```javascript
// 方式 1: JSON 格式，无 result
fetch('/api/cv/upload_wiring', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image: 'data:image/jpeg;base64,...'
  })
});

// 方式 2: 二进制 JPEG
fetch('/api/cv/upload_wiring', {
  method: 'POST',
  headers: { 'Content-Type': 'image/jpeg' },
  body: jpegImageBuffer
});
```

## 故障排查

### 问题 1: 模型加载失败

**症状**: `Error: File not found: ./yolo11n.onnx`

**解决方案**:
```bash
wget -O yolo11n.onnx "https://huggingface.co/webnn/yolo11n/resolve/main/onnx/yolo11n.onnx"
```

### 问题 2: Sharp 安装失败

**症状**: `Build scripts failed for npm:sharp`

**解决方案**:
```bash
deno install --allow-scripts=npm:sharp,npm:onnxruntime-node
```

### 问题 3: 推理结果全为 0

**原因**: 
- 测试图像没有目标对象
- 类别 ID 映射不正确
- 模型未针对特定任务训练

**解决方案**:
- 使用包含实际对象的图像
- 检查并调整 `countDetections()` 中的类别 ID

## 后续改进建议

1. **模型优化**:
   - 使用针对装接评估任务训练的专用模型
   - 考虑量化模型以提升推理速度

2. **并发处理**:
   - 实现推理队列避免并发冲突
   - 添加推理超时保护

3. **结果可视化**:
   - 返回检测框坐标用于前端显示
   - 生成标注后的图像

4. **性能监控**:
   - 记录推理耗时
   - 统计推理成功率

5. **配置化**:
   - 将模型路径、阈值等参数提取到配置文件
   - 支持动态调整参数

## 参考资料

- [YOLOv8 ONNX Node.js 实现](https://github.com/AndreyGermanov/yolov8_onnx_nodejs)
- [ONNX Runtime 文档](https://onnxruntime.ai/)
- [YOLO11 GitHub 讨论](https://github.com/microsoft/onnxruntime/discussions/22298)
- [Sharp 文档](https://sharp.pixelplumbing.com/)
