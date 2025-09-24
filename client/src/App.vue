<template>
  <div id="app">
    <a-layout style="min-height: 100vh">
      <a-layout-header>
        <div class="logo">
          <h2 style="color: white; margin: 0;">电力拖动测试系统</h2>
        </div>
      </a-layout-header>
      
      <a-layout-content style="padding: 20px;">
        <a-tabs v-model:activeKey="activeTab" type="card">
          <a-tab-pane key="questions" tab="出题管理">
            <QuestionManager />
          </a-tab-pane>
          
          <a-tab-pane key="clients" tab="客户端管理">
            <ClientManager />
          </a-tab-pane>
          
          <a-tab-pane key="test" tab="测试管理">
            <TestManager />
          </a-tab-pane>
        </a-tabs>
      </a-layout-content>
    </a-layout>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import QuestionManager from './components/QuestionManager.vue'
import ClientManager from './components/ClientManager.vue'
import TestManager from './components/TestManager.vue'

const activeTab = ref('questions')
</script>

<style>
#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.logo {
  display: flex;
  align-items: center;
  height: 64px;
}
</style>
