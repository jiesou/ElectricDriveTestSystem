<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue'
import { Table, Button, Modal, Form, Select, message, Space, Tag } from 'ant-design-vue'
import type { Trouble, Question } from '../types'
import { apiJson } from '../api-client'

const troubles = ref<Trouble[]>([])
const questions = ref<Question[]>([])
const loading = ref(false)

// Modal state
const modalVisible = ref(false)
const editingQuestion = ref<Question | null>(null)

const formState = reactive({
    troubles: [] as number[]
})

const questionColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    {
        title: '包含故障',
        dataIndex: 'troubles',
        key: 'troubles',
        customRender: ({ record }: { record: Question }) => {
            return h('div', record.troubles.map((trouble: Trouble) =>
                h(Tag, { key: trouble.id }, `${trouble.id}: ${trouble.description}`)
            ))
        }
    },
    {
        title: '操作',
        key: 'action',
        customRender: ({ record }: { record: Question }) => ({
            record
        })
    }
]

async function fetchTroubles() {
    try {
        troubles.value = await apiJson<Trouble[]>('/api/troubles')
    } catch (error) {
        console.error('Failed to fetch troubles:', error)
        message.error('获取故障列表失败')
    }
}

async function fetchQuestions() {
    try {
        loading.value = true
        questions.value = await apiJson<Question[]>('/api/questions')
    } catch (error) {
        console.error('Failed to fetch questions:', error)
        message.error('获取题目列表失败')
    } finally {
        loading.value = false
    }
}

function openAddModal() {
    editingQuestion.value = null
    formState.troubles = []
    modalVisible.value = true
}

function openEditModal(question: Question) {
    editingQuestion.value = question
    formState.troubles = question.troubles.map(t => t.id)
    modalVisible.value = true
}

async function handleSubmit() {
    if (formState.troubles.length === 0) {
        message.error('请至少选择一个故障')
        return
    }

    try {
        const isEdit = !!editingQuestion.value
        const url = isEdit ? `/api/questions/${editingQuestion.value!.id}` : '/api/questions'
        const method = isEdit ? 'PUT' : 'POST'

        // Convert trouble IDs to trouble objects
        const troubleObjects = formState.troubles.map(troubleId => {
            return troubles.value.find(t => t.id === troubleId)!
        })

        await apiJson(url, {
            method,
            body: JSON.stringify({ troubles: troubleObjects })
        })
        message.success(isEdit ? '题目更新成功' : '题目创建成功')
        modalVisible.value = false
        await fetchQuestions()
    } catch (error) {
        console.error('Failed to save question:', error)
        message.error('保存失败')
    }
}

async function handleDelete(id: number) {
    try {
        await apiJson(`/api/questions/${id}`, { method: 'DELETE' })
        message.success('题目删除成功')
        await fetchQuestions()
    } catch (error) {
        console.error('Failed to delete question:', error)
        message.error('删除失败')
    }
}

async function createRandom3Questions() {
    for (let i = 0; i < 3; i++) {
        const availableTroubles = troubles.value;
        if (availableTroubles.length === 0) break;
        const randomIndex = Math.floor(Math.random() * availableTroubles.length);
        const selectedTrouble = availableTroubles[randomIndex];
        if (!selectedTrouble) continue;

        await apiJson('/api/questions', {
            method: 'POST',
            body: JSON.stringify({ troubles: [selectedTrouble] })
        })
        message.success('题目创建成功')
        modalVisible.value = false
        await fetchQuestions()
    }
}

async function createFilledQuestions() {
    troubles.value.forEach(async trouble => {
        await apiJson('/api/questions', {
            method: 'POST',
            body: JSON.stringify({ troubles: [trouble] })
        })
        message.success('题库填充成功')
        await fetchQuestions()
    });
}

onMounted(async () => {
    await fetchTroubles()
    await fetchQuestions()
})

// Expose refresh function to parent
defineExpose({
    fetchQuestions
})
</script>

<template>
    <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0;">题目列表</h3>
            <div style="display: flex; gap: 8px;">
                <Button @click="createRandom3Questions">
                    ✨ 随机 3 个题目
                </Button>
                <Button @click="createFilledQuestions">
                    ✨ 填充题库
                </Button>
                <Button type="primary" @click="openAddModal">
                    + 添加题目
                </Button>
            </div>
        </div>

        <Table :dataSource="questions" :columns="questionColumns" :loading="loading" rowKey="id" size="small">
            <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'action'">
                    <Space>
                        <Button type="link" size="small" @click="openEditModal(record as Question)">
                            编辑
                        </Button>
                        <Button type="link" size="small" danger @click="handleDelete(record.id)">
                            删除
                        </Button>
                    </Space>
                </template>
            </template>
        </Table>

        <Modal v-model:open="modalVisible" :title="editingQuestion ? '编辑题目' : '添加题目'" @ok="handleSubmit">
            <Form layout="vertical">
                <Form.Item label="选择故障" required>
                    <Select v-model:value="formState.troubles" mode="multiple" placeholder="请选择包含的故障"
                        style="width: 100%">
                        <Select.Option v-for="trouble in troubles" :key="trouble.id" :value="trouble.id">
                            {{ trouble.id }}: {{ trouble.description }}
                        </Select.Option>
                    </Select>
                </Form.Item>
            </Form>
        </Modal>
    </div>
</template>
