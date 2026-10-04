<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createAnnouncement, updateAnnouncement, type StaffAnnouncement } from '@/lib/announcements-api'
import { parseApiError } from '@/lib/utils'

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()

const isDialogOpen = ref(false)
const isSaving = ref(false)
const dialogError = ref('')

const editingId = ref<number | null>(null)
const title = ref('')
const body = ref('')
const titleError = ref('')
const bodyError = ref('')

const dialogTitle = computed(() => (editingId.value === null ? t('announcements.dialog.createTitle') : t('announcements.dialog.editTitle')))
const submitLabel = computed(() => (editingId.value === null ? t('announcements.dialog.create') : t('announcements.dialog.save')))

// existing не передан — создание нового; передан — редактирование (одна модалка с
// переключением режима, не два отдельных диалога — тот же принцип, что и у остальных
// форм в проекте, см. ловушку про Dialog-в-Dialog в промпте).
function open(existing?: StaffAnnouncement) {
  dialogError.value = ''
  titleError.value = ''
  bodyError.value = ''
  editingId.value = existing?.id ?? null
  title.value = existing?.title ?? ''
  body.value = existing?.body ?? ''
  isDialogOpen.value = true
}

defineExpose({ open })

async function submit() {
  if (isSaving.value) return
  dialogError.value = ''
  titleError.value = title.value.trim() ? '' : t('announcements.dialog.titleRequired')
  bodyError.value = body.value.trim() ? '' : t('announcements.dialog.bodyRequired')
  if (titleError.value || bodyError.value) {
    document.getElementById(titleError.value ? 'announcement-title' : 'announcement-body')?.focus()
    return
  }

  isSaving.value = true
  try {
    const input = { title: title.value.trim(), body: body.value.trim() }
    if (editingId.value === null) {
      await createAnnouncement(input)
    } else {
      await updateAnnouncement(editingId.value, input)
    }
    isDialogOpen.value = false
    emit('saved')
  } catch (error) {
    dialogError.value = parseApiError(error).message
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog :open="isDialogOpen" @update:open="(v) => (isDialogOpen = v)">
    <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-lg', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <Label for="announcement-title">{{ t('announcements.dialog.titleLabel') }}</Label>
          <Input
            id="announcement-title"
            v-model="title"
            :placeholder="t('announcements.dialog.titlePlaceholder')"
            :aria-invalid="!!titleError"
            :aria-describedby="titleError ? 'announcement-title-error' : undefined"
            :class="titleError ? 'border-destructive' : ''"
            maxlength="200"
            @input="titleError = ''"
          />
          <p v-if="titleError" id="announcement-title-error" class="text-xs text-destructive">{{ titleError }}</p>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="announcement-body">{{ t('announcements.dialog.bodyLabel') }}</Label>
          <textarea
            id="announcement-body"
            v-model="body"
            rows="5"
            maxlength="4000"
            :placeholder="t('announcements.dialog.bodyPlaceholder')"
            :aria-invalid="!!bodyError"
            :aria-describedby="bodyError ? 'announcement-body-error' : undefined"
            :class="['flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm', bodyError ? 'border-destructive' : '']"
            @input="bodyError = ''"
          />
          <p v-if="bodyError" id="announcement-body-error" class="text-xs text-destructive">{{ bodyError }}</p>
        </div>
      </div>

      <DialogFooter>
        <p v-if="dialogError" class="mr-auto self-center text-sm text-red-500">{{ dialogError }}</p>
        <Button :loading="isSaving" @click="submit">{{ submitLabel }}</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
