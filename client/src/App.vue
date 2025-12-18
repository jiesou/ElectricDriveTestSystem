<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { Layout, ConfigProvider, Select, Button, Switch } from 'ant-design-vue'
import TroubleManagement from './components/TroubleManagement.vue'
import TestManagement from './components/TestManagement.vue'
import ClientMonitoring from './components/ClientMonitoring.vue'
import AIAnalysisModal from './components/AIAnalysisModal.vue'
import { useMockDataService } from '././useMockData.ts'
import { useTheme } from './useTheme'
import type { Client } from './types'

const { Header, Content, Sider } = Layout
const { isTechTheme, toggleTheme, antdThemeConfig } = useTheme()

type TabKey = 'troubles' | 'tests' | 'clients' | 'ai-analysis'
const activeTab = ref<TabKey>('troubles')

const menuItems = [
  { key: 'troubles', label: '题库管理', path: '#/troubles' },
  { key: 'tests', label: '排故测验', path: '#/tests' },
  { key: 'clients', label: '客户机监控', path: '#/clients' },
  { key: 'ai-analysis', label: 'AI 分析', path: '#/ai-analysis' }
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

function handleClientSelect(value: unknown) {
  if (value) {
    selectedClientId.value = value.toString()
  }
}

function handleAIAnalysis() {
  if (selectedClientId.value) {
    aiAnalysisModalOpen.value = true
  }
}

// 按 Home 键切换模拟数据模式
function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Home') {
    useMockDataService.value = !useMockDataService.value
    console.log('模拟数据服务:', useMockDataService.value ? '开启' : '关闭')
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
  <ConfigProvider :locale="zhCN" :theme="antdThemeConfig">
    <Layout :style="{ minHeight: '100vh', background: isTechTheme ? '#000c17' : '#f0f2f5' }">
      <!-- 顶部标题区域 -->
      <Header :style="{ 
        background: isTechTheme ? '#001529' : '#fff', 
        padding: '0 20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: isTechTheme ? '2px solid #177ddc' : 'none'
      }">
        <!-- 标题区域 - 科技风格下居中并加装饰 -->
        <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
          <dv-decoration-5 v-if="isTechTheme" style="width: 250px; height: 40px;" />
          <h1 :style="{ 
            margin: '0 20px', 
            color: isTechTheme ? '#00b4d8' : '#001529',
            fontSize: '24px',
            fontWeight: 'bold',
            textShadow: isTechTheme ? '0 0 10px rgba(0, 180, 216, 0.8)' : 'none'
          }">
            电力拖动教学培训 物联网云平台
          </h1>
          <dv-decoration-5 v-if="isTechTheme" style="width: 250px; height: 40px;" />
        </div>
        
        <!-- 主题切换开关 -->
        <div style="display: flex; align-items: center; gap: 12px;">
          <span :style="{ color: isTechTheme ? '#fff' : '#000' }">
            {{ isTechTheme ? '科技' : '效率' }}
          </span>
          <Switch 
            :checked="isTechTheme" 
            @change="toggleTheme"
            checked-children="科技"
            un-checked-children="效率"
          />
            un-checked-children="效率"
          />
        </div>
      </Header>

      <Layout>
        <Sider width="130" :style="{ background: isTechTheme ? '#001529' : '#fff' }">
          <div style="padding: 20px 0;">
            <div v-for="item in menuItems" :key="item.key" :class="['menu-item', { active: activeTab === item.key }]"
              :style="{ color: isTechTheme ? '#fff' : '#000' }"
              @click="handleMenuClick(item.key as TabKey)">
              {{ item.label }}
            </div>
          </div>
        </Sider>

        <Content :style="{ 
          margin: '20px', 
          background: isTechTheme ? '#000c17' : '#fff', 
          padding: '20px',
          color: isTechTheme ? '#fff' : '#000'
        }">
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

      <!-- 底部装饰 - 科技风格 -->
      <div v-if="isTechTheme" style="position: relative; height: 80px; background: #000c17; display: flex; align-items: center; justify-content: space-between; padding: 0 20px;">
        <dv-decoration-8 style="width: 200px; height: 60px;" />
        <dv-decoration-6 style="width: 100%; height: 30px;" />
        <dv-decoration-8 :reverse="true" style="width: 200px; height: 60px;" />
      </div>

      <div v-if="useMockDataService">.</div>
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
  background: rgba(240, 240, 240, 0.1);
}

.menu-item.active {
  background: rgba(0, 180, 216, 0.15);
  border-left-color: #00b4d8;
  color: #00b4d8;
}

/* 科技风格下的样式覆盖 */
:deep(.ant-layout) {
  transition: background 0.3s;
}

:deep(.ant-card) {
  transition: all 0.3s;
}
</style>