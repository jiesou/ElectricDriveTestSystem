import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import DataVVue3 from '@kjgl77/datav-vue3'
import App from './App.vue'

const app = createApp(App)
app.use(Antd)
app.use(DataVVue3)
app.mount('#app')
