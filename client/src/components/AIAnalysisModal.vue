<script setup lang="ts">
import { ref, watch } from 'vue'
import { Modal } from 'ant-design-vue'
import AIAnalysis from './AIAnalysis.vue'

interface Props {
    open: boolean
    clientId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'update:open', value: boolean): void
}>()

const aiAnalysisRef = ref<InstanceType<typeof AIAnalysis>>()

// Modal 关闭时重置
watch(() => props.open, (newVal) => {
    if (!newVal && aiAnalysisRef.value) {
        aiAnalysisRef.value.reset()
    }
})

function handleClose() {
    emit('update:open', false)
}
</script>

<template>
    <Modal :open="open" title="大模型汇总分析" width="800px" :footer="null" @cancel="handleClose">
        <AIAnalysis ref="aiAnalysisRef" :client-id="clientId" />
    </Modal>
</template>
