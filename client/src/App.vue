<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { Layout, ConfigProvider, Select, Button } from 'ant-design-vue'
import TroubleManagement from './components/TroubleManagement.vue'
import TestManagement from './components/TestManagement.vue'
import ClientMonitoring from './components/ClientMonitoring.vue'
import AIAnalysisModal from './components/AIAnalysisModal.vue'
import { useMockDataService, generateMockData } from './useMockData'
import type { Client } from './types'
import { apiJson } from './api-client'

const { Header, Content, Sider } = Layout

type TabKey = 'troubles' | 'tests' | 'clients' | 'ai-analysis'
const activeTab = ref<TabKey>('troubles')

const menuItems = [
  { key: 'troubles', label: '题库管理', path: '#/troubles' },
  { key: 'tests', label: '排故测验', path: '#/tests' },
  { key: 'clients', label: '客户机监控', path: '#/clients' },
  { key: 'ai-analysis', label: 'AI 分析', path: '#/ai-analysis' }
]

const clients = ref<Client[]>([])
const selectedClientId = ref<string>()
const aiAnalysisModalOpen = ref(false)
const loadingClients = ref(false)
let refreshTimer: number | undefined

function updateActiveTab() {
  const hash = window.location.hash
  if (hash === '#/tests') activeTab.value = 'tests'
  else if (hash === '#/clients') activeTab.value = 'clients'
  else if (hash === '#/ai-analysis') activeTab.value = 'ai-analysis'
  else {
    activeTab.value = 'troubles'
    window.location.hash = '#/troubles'
  }
}

function handleMenuClick(key: TabKey) {
  activeTab.value = key
  window.location.hash = `#/${key}`
}

async function fetchClients() {
  if (useMockDataService.value) {
    clients.value = generateMockData()
    return
  }
  loadingClients.value = true
  try {
    const data = await apiJson<Client[]>('/api/clients')
    clients.value = data
    if (clients.value.length > 0 && !selectedClientId.value) {
      selectedClientId.value = clients.value[0]?.id
    }
  } finally {
    loadingClients.value = false
  }
}

function handleClientSelect(value: unknown) {
  if (value) selectedClientId.value = value.toString()
}

function handleAIAnalysis() {
  if (selectedClientId.value) aiAnalysisModalOpen.value = true
}

function startRefresh() {
  stopRefresh()
  refreshTimer = window.setInterval(() => {
    if (!useMockDataService.value) fetchClients()
  }, 3000)
}

function stopRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = undefined
  }
}

function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Home') {
    useMockDataService.value = !useMockDataService.value
    if (useMockDataService.value) {
      stopRefresh()
      clients.value = generateMockData()
    } else {
      fetchClients()
      startRefresh()
    }
  }
}

watch(useMockDataService, (enabled) => {
  if (enabled) {
    stopRefresh()
    clients.value = generateMockData()
  } else {
    fetchClients()
    startRefresh()
  }
})

onMounted(() => {
  updateActiveTab()
  fetchClients()
  startRefresh()
  window.addEventListener('hashchange', updateActiveTab)
  window.addEventListener('keydown', handleKeyPress)
})

onUnmounted(() => {
  stopRefresh()
  window.removeEventListener('hashchange', updateActiveTab)
  window.removeEventListener('keydown', handleKeyPress)
})
</script>

<template>
  <ConfigProvider :locale="zhCN">
    <Layout style="min-height: 100vh;">
      <Header style="background:#fff;padding:0 20px;display:flex;justify-content:center;align-items:center;">
        <h1 style="margin:0;color:#001529;">电力拖动教学培训 物联网云平台</h1>
      </Header>

      <Layout>
        <Sider width="150" style="background:#fff;">
          <div style="padding:20px 0;display:flex;flex-direction:column;gap:4px;">
            <div
              v-for="item in menuItems"
              :key="item.key"
              @click="handleMenuClick(item.key as TabKey)"
              :style="{
                padding:'12px 20px',
                cursor:'pointer',
                borderLeft:'3px solid ' + (activeTab === item.key ? '#1890ff' : 'transparent'),
                background: activeTab === item.key ? '#e6f7ff' : 'transparent',
                color: activeTab === item.key ? '#1890ff' : '#000'
              }"
            >
              {{ item.label }}
            </div>
          </div>
        </Sider>

        <Content style="margin:20px;background:#fff;padding:20px;">
          <TroubleManagement v-if="activeTab === 'troubles'" />
          <TestManagement v-else-if="activeTab === 'tests'" :clients="clients" />
          <ClientMonitoring v-else-if="activeTab === 'clients'" :clients="clients" @refresh="fetchClients" />

          <div v-else style="min-height:480px;display:flex;flex-direction:column;gap:12px;">
            <h2>AI 大模型分析</h2>
            <div style="display:flex;gap:12px;align-items:center;">
              <Select
                v-model:value="selectedClientId"
                style="width:300px"
                placeholder="请选择客户机"
                :loading="loadingClients"
                @change="handleClientSelect"
              >
                <Select.Option v-for="client in clients" :key="client.id" :value="client.id">
                  {{ client.name }} ({{ client.ip }})
                  <span v-if="client.testSession?.finishedScore !== undefined"> - 分数: {{ client.testSession.finishedScore }}</span>
                  <span v-else-if="client.testSession"> - 测验中</span>
                </Select.Option>
              </Select>
              <Button type="primary" :disabled="!selectedClientId" @click="handleAIAnalysis">开始分析</Button>
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  </ConfigProvider>

  <AIAnalysisModal v-model:open="aiAnalysisModalOpen" :client-id="selectedClientId" />
</template>
