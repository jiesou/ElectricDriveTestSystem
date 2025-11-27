<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { Layout, ConfigProvider, Select, Button, Card } from 'ant-design-vue'
import TroubleManagement from './components/TroubleManagement.vue'
import TestManagement from './components/TestManagement.vue'
import ClientMonitoring from './components/ClientMonitoring.vue'
import AIAnalysisModal from './components/AIAnalysisModal.vue'
import { useFakeDataMode } from './useFakeData'
import type { Client } from './types'

const { Header, Content, Sider } = Layout

type TabKey = 'troubles' | 'tests' | 'clients' | 'ai-analysis'
const activeTab = ref<TabKey>('troubles')

const menuItems = [
  { key: 'troubles', label: '题库管理', path: '#/troubles' },
  { key: 'tests', label: '测验管理', path: '#/tests' },
  { key: 'clients', label: '客户机监控', path: '#/clients' },
  { key: 'ai-analysis', label: 'AI分析', path: '#/ai-analysis' }
]

const clients = ref<Client[]>([])
const selectedClientId = ref<string | undefined>(undefined)
const aiAnalysisModalOpen = ref(false)
const loadingClients = ref(false)

function updateActiveTab() {
  const hash = window.location.hash
  if (hash === '#/troubles') {
    activeTab.value = 'troubles'
  } else if (hash === '#/tests') {
    activeTab.value = 'tests'
  } else if (hash === '#/clients') {
    activeTab.value = 'clients'
  } else if (hash === '#/ai-analysis') {
    activeTab.value = 'ai-analysis'
  } else {
    activeTab.value = 'troubles'
    window.location.hash = '#/troubles'
  }
}

function handleMenuClick(key: TabKey) {
  activeTab.value = key
  window.location.hash = `#/${key}`
}

async function fetchClients() {
  try {
    loadingClients.value = true
    const response = await fetch('/api/clients')
    const result = await response.json()

    if (result.success) {
      clients.value = result.data
      // 如果有客户端，默认选择第一个
      if (clients.value.length > 0 && !selectedClientId.value) {
        selectedClientId.value = clients.value[0]?.id
      }
    }
  } catch (error) {
    console.error('Failed to fetch clients:', error)
  } finally {
    loadingClients.value = false
  }
}

function handleClientSelect(value: string | number | undefined) {
  if (value) {
    selectedClientId.value = value.toString()
  }
}

function handleAIAnalysis() {
  if (selectedClientId.value) {
    aiAnalysisModalOpen.value = true
  }
}

// 按 Home 键切换假数据模式
function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Home') {
    useFakeDataMode.value = !useFakeDataMode.value
    console.log('假数据模式:', useFakeDataMode.value ? '开启' : '关闭')
  }
}

onMounted(() => {
  updateActiveTab()
  fetchClients()
  window.addEventListener('hashchange', updateActiveTab)
  window.addEventListener('keydown', handleKeyPress)
})

onUnmounted(() => {
  window.removeEventListener('hashchange', updateActiveTab)
  window.removeEventListener('keydown', handleKeyPress)
})
</script>

<template>
  <ConfigProvider :locale="zhCN">
    <Layout style="min-height: 100vh;">
      <Header style="background: #fff; padding: 0 20px; display: flex; justify-content: center; align-items: center;">
        <h1 style="margin: 0; color: #001529;">电力拖动教学物联网云平台</h1>
      </Header>

      <Layout>
        <Sider width="200" style="background: #fff;">
          <div style="padding: 20px 0;">
            <div v-for="item in menuItems" :key="item.key" :class="['menu-item', { active: activeTab === item.key }]"
              @click="handleMenuClick(item.key as TabKey)">
              {{ item.label }}
            </div>
          </div>
        </Sider>

        <Content style="margin: 20px; background: #fff; padding: 20px;">
          <TroubleManagement v-if="activeTab === 'troubles'" />
          <TestManagement v-if="activeTab === 'tests'" />
          <ClientMonitoring v-if="activeTab === 'clients'" />

          <!-- AI 分析页面 -->
          <div v-if="activeTab === 'ai-analysis'" style="min-height: 600px;">
            <h2>AI 大模型分析</h2>
            <div style="margin-bottom: 20px; padding: 20px; background: #f5f5f5; border-radius: 8px;">
              <h3>选择要分析的客户机</h3>
              <div style="display: flex; gap: 12px; align-items: center; margin-top: 16px;">
                <Select v-model:value="selectedClientId" style="width: 300px" placeholder="请选择客户机"
                  :loading="loadingClients" @change="handleClientSelect">
                  <Select.Option v-for="client in clients" :key="client.id" :value="client.id">
                    {{ client.name }} ({{ client.ip }})
                    <span v-if="client.testSession?.finishedScore !== undefined">
                      - 分数: {{ client.testSession.finishedScore }}
                    </span>
                    <span v-else-if="client.testSession">
                      - 测验中
                    </span>
                  </Select.Option>
                </Select>
                <Button type="primary" @click="handleAIAnalysis" :disabled="!selectedClientId">
                  开始分析
                </Button>
              </div>
            </div>
          </div>
        </Content>
      </Layout>

      <div v-if="useFakeDataMode">.</div>
    </Layout>
  </ConfigProvider>

  <!-- AI 分析模态框 -->
  <AIAnalysisModal v-model:open="aiAnalysisModalOpen" :client-id="selectedClientId" />
</template>

<style scoped>
.menu-item {
  padding: 12px 20px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}

.menu-item:hover {
  background: #f0f0f0;
}

.menu-item.active {
  background: #e6f7ff;
  border-left-color: #1890ff;
  color: #1890ff;
}
</style>