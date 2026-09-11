<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { updateContractAccounting1cMapping } from '@/lib/contracts-api'
import { updateIndividualAccounting1cMapping } from '@/lib/individuals-api'

type MappingTarget =
  | { kind: 'contract'; id: number; label: string; contractUid: string | null; contractorUid: string | null }
  | { kind: 'individual'; id: string; label: string; contractorUid: string | null }

const emit = defineEmits<{ saved: [] }>()
const { t } = useI18n()

const isOpen = ref(false)
const isSaving = ref(false)
const error = ref('')
const target = ref<MappingTarget | null>(null)
const contractUid = ref('')
const contractorUid = ref('')

function open(value: MappingTarget) {
  target.value = value
  contractUid.value = value.kind === 'contract' ? value.contractUid ?? '' : ''
  contractorUid.value = value.contractorUid ?? ''
  error.value = ''
  isOpen.value = true
}

async function save() {
  if (!target.value || isSaving.value) return
  isSaving.value = true
  error.value = ''
  try {
    if (target.value.kind === 'contract') {
      await updateContractAccounting1cMapping(target.value.id, {
        contractUid: contractUid.value.trim() || null,
        contractorUid: contractorUid.value.trim() || null,
      })
    } else {
      await updateIndividualAccounting1cMapping(target.value.id, contractorUid.value.trim() || null)
    }
    isOpen.value = false
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    isSaving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <Dialog :open="isOpen" @update:open="(value) => (isOpen = value)">
    <DialogScrollContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('payment.accounting1c.mappingTitle') }}</DialogTitle>
        <DialogDescription>{{ target?.label }}</DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <div v-if="target?.kind === 'contract'" class="flex flex-col gap-2">
          <Label>{{ t('payment.accounting1c.contractUid') }}</Label>
          <Input v-model="contractUid" :placeholder="t('payment.accounting1c.emptyUid')" />
        </div>
        <div class="flex flex-col gap-2">
          <Label>{{ t('payment.accounting1c.contractorUid') }}</Label>
          <Input v-model="contractorUid" :placeholder="t('payment.accounting1c.emptyUid')" />
        </div>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="isOpen = false">{{ t('payment.accounting1c.cancel') }}</Button>
        <Button :loading="isSaving" @click="save">{{ t('payment.accounting1c.save') }}</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
