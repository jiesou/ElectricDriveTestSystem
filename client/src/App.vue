<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { Layout, ConfigProvider } from 'ant-design-vue'

const TroubleManagement = defineAsyncComponent(() => import('./components/TroubleManagement.vue'))
const TestManagement = defineAsyncComponent(() => import('./components/TestManagement.vue'))
const ClientMonitoring = defineAsyncComponent(() => import('./components/ClientMonitoring.vue'))
const AIAnalysisPage = defineAsyncComponent(() => import('./components/AIAnalysisPage.vue'))
const Statistics = defineAsyncComponent(() => import('./components/Statistics.vue'))
import { useMockDataService, generateMockData } from './useMockData'
import type { Client } from './types'
import { apiJson } from './api-client'

const { Header, Content, Sider } = Layout

type TabKey = 'troubles' | 'tests' | 'clients' | 'ai-analysis' | 'statistics'
const activeTab = ref<TabKey>('troubles')

const menuItems = [
  { key: 'troubles', label: '题库管理', path: '#/troubles' },
  { key: 'tests', label: '排故测验', path: '#/tests' },
  { key: 'clients', label: '客户机监控', path: '#/clients' },
  { key: 'statistics', label: '统计数据', path: '#/statistics' },
  { key: 'ai-analysis', label: 'AI 分析', path: '#/ai-analysis' }
]

const clients = ref<Client[]>([])
const loadingClients = ref(false)
let refreshTimer: number | undefined

function updateActiveTab() {
  const hash = window.location.hash
  if (hash === '#/tests') activeTab.value = 'tests'
  else if (hash === '#/clients') activeTab.value = 'clients'
  else if (hash === '#/ai-analysis') activeTab.value = 'ai-analysis'
  else if (hash === '#/statistics') activeTab.value = 'statistics'
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
  } finally {
    loadingClients.value = false
  }
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
        <h1 style="margin:0;color:#001529;">低压电气装调教学培训 物联网云平台</h1>
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
          <Statistics v-else-if="activeTab === 'statistics'" />
          <AIAnalysisPage v-else :clients="clients" :loading-clients="loadingClients" />
        </Content>
      </Layout>
    </Layout>
  </ConfigProvider>
</template>
