<script setup lang="ts">
import { ref } from 'vue'
import { Select, Button, Dropdown, Menu, MenuItem } from 'ant-design-vue'
import { DownOutlined } from '@ant-design/icons-vue'
import AIAnalysis from './AIAnalysis.vue'
import type { Client } from '../types'

interface Props {
  clients: Client[]
  loadingClients?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loadingClients: false
})

const selectedClientId = ref<string>()
const selectedModel = ref('deepseek-r1-llama-8b')
const aiAnalysisRef = ref<InstanceType<typeof AIAnalysis>>()

const modelOptions: { key: string; label: string }[] = [
  { key: 'deepseek-r1-llama-8b', label: 'DeepSeek R1 蒸馏 Llama 8B' },
  { key: 'glm-5.0', label: 'GLM-5.0' },
  { key: 'kimi-k2.5', label: 'Kimi-K2.5' },
  { key: 'minimax-m2.5', label: 'Minimax M2.5' },
]

const selectedModelLabel = ref(modelOptions[0]?.label)

function handleModelClick(info: { key: string | number }) {
  const key = typeof info.key === 'string' ? info.key : String(info.key)
  selectedModel.value = key
  selectedModelLabel.value = modelOptions.find(m => m.key === key)?.label || key
}

function handleAIAnalysis() {
  if (selectedClientId.value && aiAnalysisRef.value) {
    aiAnalysisRef.value.startAnalysis(selectedClientId.value)
  }
}
</script>

<template>
  <div style="min-height:480px;display:flex;flex-direction:column;gap:12px;">
    <h2>AI 大模型分析</h2>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <Select
        v-model:value="selectedClientId"
        style="width:300px"
        placeholder="请选择客户机"
        :loading="props.loadingClients"
      >
        <Select.Option v-for="client in props.clients" :key="client.id" :value="client.id">
          {{ client.name }} ({{ client.ip }})
          <span v-if="client.testSession?.finishedScore !== undefined"> - 分数: {{ client.testSession.finishedScore }}</span>
          <span v-else-if="client.testSession"> - 测验中</span>
        </Select.Option>
      </Select>

      <Dropdown>
        <Button style="display: flex; align-items: center; gap: 4px;">
          {{ selectedModelLabel }}
          <DownOutlined />
        </Button>
        <template #overlay>
          <Menu @click="handleModelClick" :selected-keys="[selectedModel]">
            <MenuItem v-for="model in modelOptions" :key="model.key">
              {{ model.label }}
            </MenuItem>
          </Menu>
        </template>
      </Dropdown>

      <Button type="primary" :disabled="!selectedClientId" @click="handleAIAnalysis">开始分析</Button>
    </div>

    <!-- AI 分析结果直接显示 -->
    <div style="margin-top: 16px; border: 1px solid #f0f0f0; border-radius: 6px; padding: 16px;">
      <AIAnalysis ref="aiAnalysisRef" :auto-start="false" />
    </div>
  </div>
</template>
