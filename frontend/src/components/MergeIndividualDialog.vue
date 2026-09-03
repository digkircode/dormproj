<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UserCheck } from 'lucide-vue-next'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import SearchSelect from '@/components/SearchSelect.vue'
import {
  fetchIndividuals,
  fetchIndividualMergeCandidates,
  mergeIndividual,
  type Individual,
  type IndividualMergeCandidate,
} from '@/lib/individuals-api'
import { dateLocaleTag } from '@/lib/format-locale'

const emit = defineEmits<{ merged: [targetUid: string] }>()
const { t } = useI18n()

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const isOpen = ref(false)
const sourceUid = ref('')

// Подсказка кандидатов (СНИЛС/паспорт/ФИО, см. backend#mergeCandidates) — только
// предложение, ничего не выбирает сама, сотрудник кликает нужную строку.
const candidates = ref<IndividualMergeCandidate[]>([])
const isLoadingCandidates = ref(false)

const selectedTargetUid = ref<string | null>(null)
const selectedTargetLabel = ref<string | null>(null)

// Ручной поиск (SearchSelect) — на случай, если среди подсказок нет нужного человека,
// или подсказок не нашлось вовсе. Только синхронные физлица (не ручные, не сам источник).
const searchQuery = ref('')
const searchResults = ref<Individual[]>([])
const isSearching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | undefined

const isMerging = ref(false)
const mergeError = ref('')

async function open(uid: string) {
  isOpen.value = true
  sourceUid.value = uid
  candidates.value = []
  selectedTargetUid.value = null
  selectedTargetLabel.value = null
  searchQuery.value = ''
  searchResults.value = []
  mergeError.value = ''
  isLoadingCandidates.value = true
  try {
    candidates.value = await fetchIndividualMergeCandidates(uid)
  } catch {
    // Тихо — это только подсказка, ручной поиск ниже работает независимо от неё.
  } finally {
    isLoadingCandidates.value = false
  }
}
defineExpose({ open })

function pickCandidate(c: IndividualMergeCandidate) {
  selectedTargetUid.value = c.fizicheskoyeLitsoUid
  selectedTargetLabel.value = c.fullName
}

function onSearch(q: string) {
  clearTimeout(searchTimeout)
  if (!q.trim()) {
    searchResults.value = []
    isSearching.value = false
    return
  }
  isSearching.value = true
  searchTimeout = setTimeout(async () => {
    const page = await fetchIndividuals({ page: 1, pageSize: 10, search: q, sortBy: 'fullName', sortDir: 'asc', filters: {} })
    searchResults.value = page.data.filter((i) => !i.isManual && i.fizicheskoyeLitsoUid !== sourceUid.value)
    isSearching.value = false
  }, 250)
}
function pickSearchResult(i: Individual) {
  selectedTargetUid.value = i.fizicheskoyeLitsoUid
  selectedTargetLabel.value = i.fullName
  searchQuery.value = i.fullName
  searchResults.value = []
}

async function submit() {
  if (!selectedTargetUid.value) return
  isMerging.value = true
  mergeError.value = ''
  try {
    await mergeIndividual(sourceUid.value, selectedTargetUid.value)
    isOpen.value = false
    emit('merged', selectedTargetUid.value)
  } catch (error) {
    mergeError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isMerging.value = false
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(dateLocaleTag())
}
</script>

<template>
  <Dialog :open="isOpen" @update:open="(open) => (isOpen = open)">
    <!-- min-h — без кандидатов (частый случай) диалог короткий, и выпадающий список
         SearchSelect (до 256px, см. SearchSelect.vue) при открытии перекрывал футер с
         кнопками — снизу просто не было места. Явный минимум держит зазор всегда,
         независимо от того, сколько подсказок пришло. -->
    <DialogScrollContent :class="['flex min-h-[420px] flex-col gap-4', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>{{ t('individuals.merge.title') }}</DialogTitle>
        <DialogDescription>{{ t('individuals.merge.description') }}</DialogDescription>
      </DialogHeader>

      <div v-if="isLoadingCandidates" class="text-sm text-muted-foreground">{{ t('individuals.merge.loadingCandidates') }}</div>

      <div v-else-if="candidates.length > 0" class="flex flex-col gap-2">
        <Label>{{ t('individuals.merge.candidatesLabel') }}</Label>
        <button
          v-for="c in candidates"
          :key="c.fizicheskoyeLitsoUid"
          type="button"
          class="flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
          :class="selectedTargetUid === c.fizicheskoyeLitsoUid ? 'border-primary bg-accent' : 'border-input'"
          @click="pickCandidate(c)"
        >
          <span class="flex items-center gap-1.5 font-medium">
            <UserCheck v-if="selectedTargetUid === c.fizicheskoyeLitsoUid" class="size-4 shrink-0 text-primary" />
            {{ c.fullName }}
          </span>
          <span class="text-xs text-muted-foreground">
            {{ t('individuals.merge.candidateMeta', { birthDate: formatDate(c.birthDate), snils: c.snils ?? '—' }) }}
          </span>
        </button>
      </div>

      <!-- flex-1 — растягивает этот блок на всё оставшееся место внутри min-h контейнера
           (особенно заметно без кандидатов, см. комментарий у DialogScrollContent выше),
           отодвигая футер вниз, а не оставляя его впритык под полем поиска. -->
      <div class="flex flex-1 flex-col gap-2">
        <Label>{{ candidates.length > 0 ? t('individuals.merge.searchOtherLabel') : t('individuals.merge.searchLabel') }}</Label>
        <SearchSelect
          v-model="searchQuery"
          :items="searchResults"
          :item-key="(i: Individual) => i.fizicheskoyeLitsoUid"
          :item-label="(i: Individual) => i.fullName"
          :item-sub-label="(i: Individual) => (i.birthDate ? formatDate(i.birthDate) : '')"
          :placeholder="t('individuals.merge.searchPlaceholder')"
          :loading="isSearching"
          @search="onSearch"
          @select="pickSearchResult"
        />
      </div>

      <p v-if="selectedTargetLabel" class="text-sm text-muted-foreground">
        {{ t('individuals.merge.selectedHint', { name: selectedTargetLabel }) }}
      </p>
      <p v-if="mergeError" class="text-sm text-red-500">{{ mergeError }}</p>

      <DialogFooter>
        <Button variant="outline" @click="isOpen = false">{{ t('individuals.merge.cancel') }}</Button>
        <Button :disabled="!selectedTargetUid" :loading="isMerging" @click="submit">
          {{ t('individuals.merge.confirm') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
