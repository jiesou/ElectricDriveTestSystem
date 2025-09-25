<script setup lang="ts">
import { ref } from 'vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { Layout, ConfigProvider } from 'ant-design-vue'
import TroubleManagement from './components/TroubleManagement.vue'
import TestManagement from './components/TestManagement.vue'
import ClientMonitoring from './components/ClientMonitoring.vue'

const { Header, Content, Sider } = Layout

type TabKey = 'troubles' | 'tests' | 'clients'
const activeTab = ref<TabKey>('troubles')

const menuItems = [
  { key: 'troubles', label: '题库管理' },
  { key: 'tests', label: '测验管理' },
  { key: 'clients', label: '客户机监控' }
]
</script>

<template>
  <ConfigProvider :locale="zhCN">
  <Layout style="min-height: 100vh;">
    <Header style="background: #fff; padding: 0 20px; display: flex; justify-content: center; align-items: center;">
      <h1 style="margin: 0; color: #001529;">电力拖动测试系统</h1>
    </Header>
    
    <Layout>
      <Sider width="200" style="background: #fff;">
        <div style="padding: 20px 0;">
          <div 
            v-for="item in menuItems" 
            :key="item.key"
            :class="['menu-item', { active: activeTab === item.key }]"
            @click="activeTab = item.key as TabKey"
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
