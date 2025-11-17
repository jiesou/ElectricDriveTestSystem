<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { Layout, ConfigProvider } from 'ant-design-vue'
import TroubleManagement from './components/TroubleManagement.vue'
import TestManagement from './components/TestManagement.vue'
import ClientMonitoring from './components/ClientMonitoring.vue'
import { useFakeDataMode } from './useFakeData'

const { Header, Content, Sider } = Layout

type TabKey = 'troubles' | 'tests' | 'clients'
const activeTab = ref<TabKey>('troubles')

const menuItems = [
  { key: 'troubles', label: '题库管理', path: '#/troubles' },
  { key: 'tests', label: '测验管理', path: '#/tests' },
  { key: 'clients', label: '客户机监控', path: '#/clients' }
]

function updateActiveTab() {
  const hash = window.location.hash
  if (hash === '#/troubles') {
    activeTab.value = 'troubles'
  } else if (hash === '#/tests') {
    activeTab.value = 'tests'
  } else if (hash === '#/clients') {
    activeTab.value = 'clients'
  } else {
    activeTab.value = 'troubles'
    window.location.hash = '#/troubles'
  }
}

function handleMenuClick(key: TabKey) {
  activeTab.value = key
  window.location.hash = `#/${key}`
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
      <h1 style="margin: 0; color: #001529;">电力拖动物联网云平台</h1>
    </Header>
    
    <Layout>
      <Sider width="200" style="background: #fff;">
        <div style="padding: 20px 0;">
          <div 
            v-for="item in menuItems" 
            :key="item.key"
            :class="['menu-item', { active: activeTab === item.key }]"
            @click="handleMenuClick(item.key as TabKey)"
          >
            {{ item.label }}
          </div>
        </div>
      </Sider>
      
      <Content style="margin: 20px; background: #fff; padding: 20px;">
        <TroubleManagement v-if="activeTab === 'troubles'" />
        <TestManagement v-if="activeTab === 'tests'" />
        <ClientMonitoring v-if="activeTab === 'clients'" />
      </Content>
    </Layout>
  </Layout>
  </ConfigProvider>
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
