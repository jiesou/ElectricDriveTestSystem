<script setup lang="ts">
import { computed, h } from 'vue'
import { Card, Tag, Empty, Button, Divider, message } from 'ant-design-vue'
import type { Client, CvClient } from '../types'
import { CloseOutlined } from '@ant-design/icons-vue'
import { apiJson } from '../api-client'
import { useMockDataService } from '../useMockData'

const props = defineProps<{ clients: Client[] }>()
const displayCvClients = computed(() => props.clients.filter(c => c.cvClient))

async function clearSession(cvClient: CvClient) {
  if (!cvClient) return
  try {
    await apiJson(`/api/cv/clear_session/${cvClient.ip}`, { method: 'POST' })
    message.success('已清除会话')
  } catch (error) {
    console.error('[CvClientMonitor] 清除会话请求失败:', error)
  }
}
</script>

<template>
  <Card title="实时视觉客户端" style="display: block">
    <div v-if="displayCvClients.length === 0">
      <Empty description="暂无视觉客户端连接" />
    </div>
    <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;">
      <Card v-for="client in displayCvClients" :key="client.id" size="small" :title="`${client.name} - 视觉客户端`" style="width: 880px;">
        <template #extra>
          <div style="display: flex; align-items: center; gap: 8px;">
            <Tag v-if="client.cvClient?.session?.type == 'evaluate_wiring'" color="blue">
              装接评估
            </Tag>
            <Tag v-else-if="client.cvClient?.session?.type == 'face_signin'" color="green">
              人脸签到
            </Tag>
            <Tag v-else-if="client.cvClient?.session?.type == 'desk_clean'" color="orange">
              工位清洁
            </Tag>
            <Tag v-else color="gray">
              空闲
            </Tag>
            <!-- 如果存在会话，显示叉叉按钮用于删除会话 -->
            <Button v-if="client.cvClient?.session" danger shape="circle" @click="clearSession(client.cvClient)"
              :icon="h(CloseOutlined)">
            </Button>
          </div>
        </template>

        <strong>IP:</strong> {{ client.cvClient?.ip }} <br />
        <strong>关联客户机IP:</strong> {{ client.ip }}
        <!-- 图像显示区域 -->
        <div v-if="!useMockDataService"
          style="position: relative; width: 100%; background: #ffffff; border-radius: 4px; overflow: hidden; min-height: 60px; margin-bottom: 0px;">
          <!-- MJPEG 流会自动处理，加载第一帧后就会触发 load 事件 -->
          <img v-if="client.cvClient" :src="`/api/cv/stream/${client.cvClient.ip}`"
            style="width: 100%; height: 100%; object-fit: cover;" />
          <div style="display: flex;
    justify-content: space-around;
    align-items: center;
    height: 40px;
    border-radius: 8px;
    background: #f0f0f0;
    margin: 10px;">摄像头图传</div>
        </div>
        <!--会话信息-->
        <div v-if="client.cvClient?.session?.type == 'evaluate_wiring'" style="font-size:16px">
          <strong >已经拍摄{{ client.cvClient?.session?.shots?.length || 0 }}张照片</strong>
          <div v-for="(shot, idx) in client.cvClient?.session?.shots" :key="idx">
            <strong style="color: blue"># 照片{{ idx + 1 }}</strong><br />
            <img :src="shot.image"
              style="width: 400px; height: auto; margin-right: 8px; border-radius: 8px; margin-bottom: 8px;" /><br />
            号码管：{{ shot.result.sleeves_num }} 个<br />
            线路交叉：{{ shot.result.cross_num }} 个<br />
            露铜：{{ shot.result.excopper_num }} 个<br />
            露端子：{{ shot.result.exterminal_num }} 个<br />
            <Divider />
          </div>

          <Card v-if="client.cvClient?.session?.finalResult" style="margin-top: 10px; font-size: 16px">
            <h3>✅ 最终评估结果已经确认：</h3><br />
            <strong style="color: green;">得分：{{ client.cvClient?.session?.finalResult.scores }}</strong><br />
            <strong>未套号码管：</strong>{{ client.cvClient?.session?.finalResult.no_sleeves_num }}<br />
            <strong>线路交叉：</strong>{{ client.cvClient?.session?.finalResult.cross_num }}<br />
            <strong>露铜：</strong>{{ client.cvClient?.session?.finalResult.excopper_num }}<br />
            <strong>露端子：</strong>{{ client.cvClient?.session?.finalResult.exterminal_num }}<br />
          </Card>

        </div>


        <div v-if="client.cvClient?.session" style="margin-top: 8px;">
          <!-- 装接评估会话详情 -->
          <div v-if="client.cvClient.session.type === 'evaluate_wiring'">
            <div v-if="!client.cvClient.session.finalResult" style="font-size: 12px; color: #1890ff;">
              拍摄采集中... (已拍摄 {{ client.cvClient.session.shots?.length || 0 }} 张)
            </div>

            <!-- 显示拍摄的图像 -->
            <div v-if="client.cvClient.session.shots && client.cvClient.session.shots.length > 0"
              style="margin-top: 8px;">
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                <strong>拍摄记录:</strong>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, 600px); gap: 8px;">
                <div v-for="(shot, idx) in client.cvClient.session.shots" :key="idx"
                  style="border: 1px solid #d9d9d9; border-radius: 4px; overflow: hidden;">
                  <img v-if="shot.image" :src="shot.image" :alt="`拍摄 ${idx + 1}`"
                    style="width: 100%; object-fit: contain; background: #000; display: block;" />
                  <div style="padding: 4px; font-size: 11px; background: #fafafa;">
                    <div>标记号码管: {{ shot.result.sleeves_num }}</div>
                    <div>交叉: {{ shot.result.cross_num }}</div>
                    <div>露铜: {{ shot.result.excopper_num }}</div>
                    <div>露端子: {{ shot.result.exterminal_num }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- finalResult 不要忘记 -->
            <div v-if="client.cvClient.session.finalResult" style="font-size: 12px; margin-top: 8px;">
              <div style="color: #52c41a; margin-bottom: 4px;"><strong>✅ 评估完成</strong></div>
              <div style="color: #666; margin-top: 4px;">
                <strong>得分:</strong> {{ client.cvClient.session.finalResult.scores }} 分
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>未标号码管:</strong> {{ client.cvClient.session.finalResult.no_sleeves_num }} 个
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>交叉接线:</strong> {{ client.cvClient.session.finalResult.cross_num }} 处
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>露铜:</strong> {{ client.cvClient.session.finalResult.excopper_num }} 处
              </div>
              <div style="color: #666; margin-top: 4px;">
                <strong>露端子:</strong> {{ client.cvClient.session.finalResult.exterminal_num }} 处
              </div>
            </div>
          </div>

          <!-- 人脸签到会话详情 -->
          <div v-else-if="client.cvClient.session.type === 'face_signin'">
            <div v-if="client.cvClient.session.finalResult">
              <div style="color: #52c41a; font-size: 12px; margin-bottom: 6px;">
                <strong>✅ 人脸签到完成</strong>
              </div>
                <img :src="client.cvClient.session.finalResult.image" alt="人脸截图"
                  style="width: 640px; height: auto; object-fit: cover; background: #000; border-radius: 4px;" />
                <div style="font-size: 13px; color: #555;">
                  <div><strong>识别到:</strong> {{ client.cvClient.session.finalResult.who || '未知' }}</div>
                  <div style="font-size: 12px; color: #999;">时间戳: {{ new Date(client.cvClient.session.startTime).toLocaleString() }}</div>
                </div>
            </div>
          </div>
          <!-- 工位清洁会话详情 -->
          <div v-else-if="client.cvClient.session.type === 'desk_clean'">
            <div v-if="client.cvClient.session.finalResult">
              <div style="color: #fa8c16; font-size: 12px; margin-bottom: 6px;">
                <strong>✅ 工位清洁已提交</strong>
              </div>
              <img :src="client.cvClient.session.finalResult.image" alt="工位清洁截图"
                style="width: 640px; height: auto; object-fit: cover; background: #000; border-radius: 4px;" />
              <div style="font-size: 13px; color: #555; margin-top: 6px;">
                <div><strong>号码管:</strong> {{ client.cvClient.session.finalResult.sleeves_num }} 个</div>
                <div><strong>螺丝刀:</strong> {{ client.cvClient.session.finalResult.screwdriver_ready ? '归位' : '未归位' }}</div>
                <div><strong>剥线钳:</strong> {{ client.cvClient.session.finalResult.wire_stripper_ready ? '归位' : '未归位' }}</div>
                <div><strong>万用表:</strong> {{ client.cvClient.session.finalResult.multimeter_ready ? '归位' : '未归位' }}</div>
                <div><strong>斜口钳:</strong> {{ client.cvClient.session.finalResult.crimping_ready ? '归位' : '未归位' }}</div>
                <div><strong>清洁进度:</strong> {{ (client.cvClient.session.finalResult.clean_progress * 100).toFixed(0) }}%</div>
                <div style="font-size: 12px; color: #999;">时间戳: {{ new Date(client.cvClient.session.startTime).toLocaleString() }}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </Card>
</template>
