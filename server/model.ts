/**
 * YOLO11 推理模块
 * 使用 ONNX Runtime 在服务端进行目标检测推理
 */

import * as ort from "npm:onnxruntime-node@1.19.2";
import sharp from "npm:sharp@0.33.5";
import { Buffer } from "node:buffer";

// YOLO11 类别标签（用于装接评估）
// 这里使用自定义类别：0: sleeve (号码管), 1: cross (交叉), 2: excopper (露铜), 3: exterminal (露端子)
const YOLO_CLASSES = ["sleeve", "cross", "excopper", "exterminal"];

// 推理配置
const MODEL_PATH = "./yolo11n.onnx";
const INPUT_SIZE = 640;

// 全局模型实例（延迟加载）
let modelSession: ort.InferenceSession | null = null;

/**
 * 加载 ONNX 模型
 */
async function loadModel(): Promise<ort.InferenceSession> {
  if (!modelSession) {
    console.log("[YOLO] 正在加载模型:", MODEL_PATH);
    modelSession = await ort.InferenceSession.create(MODEL_PATH);
    console.log("[YOLO] 模型加载完成");
  }
  return modelSession;
}

/**
 * 准备输入张量
 * 将 JPEG 图像转换为 YOLO 要求的格式：[1, 3, 640, 640]
 * @param imageBuffer JPEG 图像数据
 * @returns [input_tensor, original_width, original_height]
 */
async function prepareInput(
  imageBuffer: Uint8Array,
): Promise<[ort.Tensor, number, number]> {
  // 使用 sharp 处理图像
  const img = sharp(imageBuffer);
  const metadata = await img.metadata();
  const imgWidth = metadata.width || INPUT_SIZE;
  const imgHeight = metadata.height || INPUT_SIZE;

  // 调整图像大小并移除 alpha 通道
  const pixels = await img
    .removeAlpha()
    .resize({ width: INPUT_SIZE, height: INPUT_SIZE, fit: "fill" })
    .raw()
    .toBuffer();

  // 将像素数据转换为 float32 数组，并归一化到 [0, 1]
  // 格式：[R, R, R, ..., G, G, G, ..., B, B, B, ...]
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];

  for (let i = 0; i < pixels.length; i += 3) {
    red.push(pixels[i] / 255.0);
    green.push(pixels[i + 1] / 255.0);
    blue.push(pixels[i + 2] / 255.0);
  }

  // 合并为单个数组
  const inputData = [...red, ...green, ...blue];

  // 创建 ONNX 张量
  const tensor = new ort.Tensor(
    "float32",
    Float32Array.from(inputData),
    [1, 3, INPUT_SIZE, INPUT_SIZE],
  );

  return [tensor, imgWidth, imgHeight];
}

/**
 * 运行模型推理
 * @param input 输入张量
 * @returns 原始输出数据
 */
async function runModel(input: ort.Tensor): Promise<Float32Array> {
  const model = await loadModel();
  const outputs = await model.run({ images: input });
  return outputs["output0"].data as Float32Array;
}

/**
 * 计算两个框的交并比 (IoU)
 */
function iou(box1: number[], box2: number[]): number {
  const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
  const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;

  const x1 = Math.max(box1_x1, box2_x1);
  const y1 = Math.max(box1_y1, box2_y1);
  const x2 = Math.min(box1_x2, box2_x2);
  const y2 = Math.min(box1_y2, box2_y2);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const box1_area = (box1_x2 - box1_x1) * (box1_y2 - box1_y1);
  const box2_area = (box2_x2 - box2_x1) * (box2_y2 - box2_y1);
  const union = box1_area + box2_area - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * 处理模型输出，提取检测框
 * YOLO11 输出格式为 [1, 84, 8400] (需要转置)
 * 每个检测框：[x, y, w, h, class_confidence[80]]
 * 
 * @param output 原始输出数据
 * @param imgWidth 原始图像宽度
 * @param imgHeight 原始图像高度
 * @param confThreshold 置信度阈值
 * @param iouThreshold IoU 阈值用于 NMS
 * @returns 检测框列表 [x1, y1, x2, y2, class_id, probability][]
 */
function processOutput(
  output: Float32Array,
  imgWidth: number,
  imgHeight: number,
  confThreshold: number = 0.1,
  iouThreshold: number = 0.3,
): number[][] {
  const boxes: number[][] = [];

  // YOLO11 输出为转置格式：[1, 84, 8400]
  // 84 = 4 (bbox) + 80 (classes)
  // 8400 = 80x80 + 40x40 + 20x20 检测点
  const numClasses = 80;
  const numDetections = 8400;

  // 遍历所有检测
  for (let i = 0; i < numDetections; i++) {
    // 查找最大置信度的类别
    let maxProb = 0;
    let maxClassId = 0;

    for (let c = 0; c < numClasses; c++) {
      const prob = output[numDetections * (c + 4) + i];
      if (prob > maxProb) {
        maxProb = prob;
        maxClassId = c;
      }
    }

    // 过滤低置信度检测
    if (maxProb < confThreshold) {
      continue;
    }

    // 提取边界框坐标 (中心点 + 宽高格式)
    const xc = output[i];
    const yc = output[numDetections + i];
    const w = output[2 * numDetections + i];
    const h = output[3 * numDetections + i];

    // 转换为实际图像坐标 (x1, y1, x2, y2)
    const x1 = ((xc - w / 2) / INPUT_SIZE) * imgWidth;
    const y1 = ((yc - h / 2) / INPUT_SIZE) * imgHeight;
    const x2 = ((xc + w / 2) / INPUT_SIZE) * imgWidth;
    const y2 = ((yc + h / 2) / INPUT_SIZE) * imgHeight;

    boxes.push([x1, y1, x2, y2, maxClassId, maxProb]);
  }

  // 按置信度降序排序
  boxes.sort((a, b) => b[5] - a[5]);

  // 非极大值抑制 (NMS)
  const result: number[][] = [];
  while (boxes.length > 0) {
    result.push(boxes[0]);
    boxes.splice(0, 1);

    // 移除与当前框 IoU 过高的框
    const filtered: number[][] = [];
    for (const box of boxes) {
      if (iou(result[result.length - 1], box) < iouThreshold) {
        filtered.push(box);
      }
    }
    boxes.length = 0;
    boxes.push(...filtered);
  }

  return result;
}

/**
 * 统计检测结果
 * 将检测框按类别分类统计数量
 * @param boxes 检测框列表
 * @returns 各类别的数量统计
 */
function countDetections(boxes: number[][]): {
  sleeves_num: number;
  cross_num: number;
  excopper_num: number;
  exterminal_num: number;
} {
  // 自定义类别 ID 映射
  const SLEEVE_ID = 0; // 假设训练模型时 sleeve 是类别 0
  const CROSS_ID = 1; // cross 是类别 1
  const EXCOPPER_ID = 2; // excopper 是类别 2
  const EXTERMINAL_ID = 3; // exterminal 是类别 3

  let sleeves = 0;
  let cross = 0;
  let excopper = 0;
  let exterminal = 0;

  for (const box of boxes) {
    const classId = box[4];
    if (classId === SLEEVE_ID) sleeves++;
    else if (classId === CROSS_ID) cross++;
    else if (classId === EXCOPPER_ID) excopper++;
    else if (classId === EXTERMINAL_ID) exterminal++;
  }

  return {
    sleeves_num: sleeves,
    cross_num: cross,
    excopper_num: excopper,
    exterminal_num: exterminal,
  };
}

/**
 * 在图像上绘制检测框
 * @param imageBuffer 原始图像数据
 * @param boxes 检测框列表 [x1, y1, x2, y2, class_id, prob]
 * @returns 带标注的图像 JPEG buffer
 */
async function drawBoxes(
  imageBuffer: Uint8Array,
  boxes: number[][],
): Promise<Uint8Array> {
  // 类别颜色映射（RGB）
  const classColors: Record<number, { r: number; g: number; b: number }> = {
    0: { r: 0, g: 255, b: 0 },    // sleeve - 绿色
    1: { r: 255, g: 0, b: 0 },    // cross - 红色
    2: { r: 255, g: 165, b: 0 },  // excopper - 橙色
    3: { r: 255, g: 255, b: 0 },  // exterminal - 黄色
  };

  const classNames = ["sleeve", "cross", "excopper", "exterminal"];

  // 加载原始图像
  let image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 640;
  const height = metadata.height || 640;

  // 创建 SVG 覆盖层
  const svgElements: string[] = [];

  for (const box of boxes) {
    const [x1, y1, x2, y2, classId, prob] = box;
    const color = classColors[classId] || { r: 255, g: 255, b: 255 };
    const className = classNames[classId] || `class${classId}`;
    const label = `${className} ${(prob * 100).toFixed(0)}%`;

    // 绘制矩形框
    svgElements.push(
      `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" ` +
      `fill="none" stroke="rgb(${color.r},${color.g},${color.b})" stroke-width="3"/>`
    );

    // 绘制标签背景
    const labelBg = `<rect x="${x1}" y="${y1 - 20}" width="${label.length * 8}" height="20" ` +
      `fill="rgb(${color.r},${color.g},${color.b})"/>`;
    svgElements.push(labelBg);

    // 绘制标签文本
    const labelText = `<text x="${x1 + 5}" y="${y1 - 5}" ` +
      `font-family="Arial" font-size="14" font-weight="bold" fill="black">${label}</text>`;
    svgElements.push(labelText);
  }

  const svg = `<svg width="${width}" height="${height}">${svgElements.join('')}</svg>`;

  // 合成图像
  const annotatedBuffer = await image
    .composite([{
      input: Buffer.from(svg),
      top: 0,
      left: 0,
    }])
    .jpeg()
    .toBuffer();

  return annotatedBuffer;
}

/**
 * 对图像进行目标检测并绘制检测框
 * @param imageBuffer JPEG 图像数据
 * @param confThreshold 置信度阈值（默认 0.1）
 * @param iouThreshold IoU 阈值（默认 0.3）
 * @returns 检测结果统计和带标注的图像
 */
export async function detectObjects(
  imageBuffer: Uint8Array,
  confThreshold: number = 0.1,
  iouThreshold: number = 0.3,
): Promise<{
  sleeves_num: number;
  cross_num: number;
  excopper_num: number;
  exterminal_num: number;
  annotatedImage: Uint8Array;
}> {
  try {
    // 准备输入
    const [input, imgWidth, imgHeight] = await prepareInput(imageBuffer);

    // 运行推理
    const output = await runModel(input);

    // 处理输出
    const boxes = processOutput(
      output,
      imgWidth,
      imgHeight,
      confThreshold,
      iouThreshold,
    );

    // 统计结果
    const result = countDetections(boxes);

    console.log(
      `[YOLO] 检测完成: ${boxes.length} 个目标, ` +
        `号码管=${result.sleeves_num}, 交叉=${result.cross_num}, ` +
        `露铜=${result.excopper_num}, 露端子=${result.exterminal_num}`,
    );

    // 绘制检测框
    const annotatedImage = await drawBoxes(imageBuffer, boxes);

    return {
      ...result,
      annotatedImage,
    };
  } catch (error) {
    console.error("[YOLO] 推理失败:", error);
    throw error;
  }
}
