<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, toRef } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { Layout, ConfigProvider, Select, Button, Switch } from 'ant-design-vue'
import TroubleManagement from './components/TroubleManagement.vue'
import TestManagement from './components/TestManagement.vue'
import ClientMonitoring from './components/ClientMonitoring.vue'
import AIAnalysisModal from './components/AIAnalysisModal.vue'
import { useMockDataService } from '././useMockData.ts'
import { useTheme } from './useTheme'
import { efficiencyTheme, techTheme } from './theme'
import type { Client } from './types'

const { Header, Content, Sider } = Layout

// 主题管理
const themeState = useTheme()
const themeMode = toRef(themeState, 'themeMode')
const { toggleTheme } = themeState
const currentTheme = computed(() => themeMode.value === 'tech' ? techTheme : efficiencyTheme)

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
  if (value && typeof value === 'string') {
    selectedClientId.value = value
  } else if (value && typeof value === 'number') {
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

// 计算属性用于 Switch 的 v-model
const techMode = computed({
  get: () => themeMode.value === 'tech',
  set: () => {
    // Switch 改变时会被调用，但实际切换由 toggleTheme 处理
  }
})

// 动态样式
const headerStyle = computed(() => ({
  background: themeMode.value === 'tech' ? '#0a1e3e' : '#fff',
  padding: '0 20px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  borderBottom: themeMode.value === 'tech' ? '2px solid #00d4ff' : '1px solid #f0f0f0',
}))

const titleStyle = computed(() => ({
  margin: 0,
  color: themeMode.value === 'tech' ? '#00d4ff' : '#001529',
  textShadow: themeMode.value === 'tech' ? '0 0 10px #00d4ff' : 'none',
}))

const siderStyle = computed(() => ({
  background: themeMode.value === 'tech' ? '#0a1e3e' : '#fff',
  borderRight: themeMode.value === 'tech' ? '1px solid #1f4173' : '1px solid #f0f0f0',
}))

const contentStyle = computed(() => ({
  margin: '20px',
  background: themeMode.value === 'tech' ? '#0f2847' : '#fff',
  padding: '20px',
  borderRadius: '4px',
  border: themeMode.value === 'tech' ? '1px solid #1f4173' : 'none',
}))

const aiAnalysisBoxStyle = computed(() => ({
  background: themeMode.value === 'tech' ? '#1a3659' : '#f5f5f5',
  border: themeMode.value === 'tech' ? '1px solid #1f4173' : 'none',
}))

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
  <ConfigProvider :locale="zhCN" :theme="currentTheme">
    <div :class="['app-wrapper', themeMode]">
      <!-- 科技风格装饰边框 -->
      <dv-border-box-8 v-if="themeMode === 'tech'" class="tech-border">
        <Layout style="min-height: 100vh;">
          <Header :style="headerStyle">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <h1 :style="titleStyle">电力拖动教学培训 物联网云平台</h1>
              <div style="display: flex; align-items: center; gap: 12px;">
                <span :style="{ color: themeMode === 'tech' ? '#00d4ff' : '#666' }">
                  {{ themeMode === 'tech' ? '科技风格' : '效率风格' }}
                </span>
                <Switch 
                  v-model:checked="techMode" 
                  @change="toggleTheme"
                  checked-children="科技"
                  un-checked-children="效率"
                  :style="{ backgroundColor: techMode ? '#00d4ff' : undefined }"
                />
              </div>
            </div>
          </Header>

          <Layout>
            <Sider width="130" :style="siderStyle">
              <div style="padding: 20px 0;">
                <div v-for="item in menuItems" :key="item.key" 
                  :class="['menu-item', { active: activeTab === item.key }, themeMode]"
                  @click="handleMenuClick(item.key as TabKey)">
                  {{ item.label }}
                </div>
              </div>
            </Sider>

            <Content :style="contentStyle">
              <TroubleManagement v-if="activeTab === 'troubles'" />
              <TestManagement v-if="activeTab === 'tests'" />
              <ClientMonitoring v-if="activeTab === 'clients'" />

              <!-- AI 分析页面 -->
              <div v-if="activeTab === 'ai-analysis'" style="min-height: 600px;">
                <h2>AI 大模型分析</h2>
                <div style="margin-bottom: 20px; padding: 20px; border-radius: 8px;"
                  :style="aiAnalysisBoxStyle">
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

          <div v-if="useMockDataService">.</div>
        </Layout>
      </dv-border-box-8>

      <!-- 效率风格（无装饰边框） -->
      <Layout v-else style="min-height: 100vh;">
        <Header :style="headerStyle">
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <h1 :style="titleStyle">电力拖动教学培训 物联网云平台</h1>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span :style="{ color: themeMode === 'tech' ? '#00d4ff' : '#666' }">
                {{ themeMode === 'tech' ? '科技风格' : '效率风格' }}
              </span>
              <Switch 
                v-model:checked="techMode" 
                @change="toggleTheme"
                checked-children="科技"
                un-checked-children="效率"
              />
            </div>
          </div>
        </Header>

        <Layout>
          <Sider width="130" :style="siderStyle">
            <div style="padding: 20px 0;">
              <div v-for="item in menuItems" :key="item.key" 
                :class="['menu-item', { active: activeTab === item.key }, themeMode]"
                @click="handleMenuClick(item.key as TabKey)">
                {{ item.label }}
              </div>
            </div>
          </Sider>

          <Content :style="contentStyle">
            <TroubleManagement v-if="activeTab === 'troubles'" />
            <TestManagement v-if="activeTab === 'tests'" />
            <ClientMonitoring v-if="activeTab === 'clients'" />

            <!-- AI 分析页面 -->
            <div v-if="activeTab === 'ai-analysis'" style="min-height: 600px;">
              <h2>AI 大模型分析</h2>
              <div style="margin-bottom: 20px; padding: 20px; border-radius: 8px;"
                :style="aiAnalysisBoxStyle">
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

        <div v-if="useMockDataService">.</div>
      </Layout>
    </div>
  </ConfigProvider>

  <!-- AI 分析模态框 -->
  <AIAnalysisModal v-model:open="aiAnalysisModalOpen" :client-id="selectedClientId" />
</template>

<style scoped>
.app-wrapper {
  min-height: 100vh;
  transition: background-color 0.3s ease;
}

.app-wrapper.tech {
  background: linear-gradient(135deg, #050f1f 0%, #0a1e3e 100%);
}

.tech-border {
  width: 100%;
  height: 100vh;
}

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

/* 科技风格菜单项 */
.menu-item.tech {
  color: #ffffff;
}

.menu-item.tech:hover {
  background: #1a3659;
}

.menu-item.tech.active {
  background: linear-gradient(90deg, #1f4173 0%, transparent 100%);
  border-left-color: #00d4ff;
  color: #00d4ff;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
}
</style>