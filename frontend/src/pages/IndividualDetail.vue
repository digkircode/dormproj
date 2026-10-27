<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Check,
  X,
  Copy,
  RefreshCw,
  FileSignature,
  Home,
  Phone,
  Mail,
  MapPin,
  Pencil,
  History,
  Combine,
  TriangleAlert,
} from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import TableSkeleton from '@/components/TableSkeleton.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import Accounting1cLinkedBadge from '@/components/Accounting1cLinkedBadge.vue'
import Accounting1cMappingDialog from '@/components/Accounting1cMappingDialog.vue'
import PassportTable from '@/components/PassportTable.vue'
import StudentFields from '@/components/StudentFields.vue'
import CreateContractDialog from '@/components/CreateContractDialog.vue'
import EditIndividualDialog from '@/components/EditIndividualDialog.vue'
import IndividualHistoryDialog from '@/components/IndividualHistoryDialog.vue'
import MergeIndividualDialog from '@/components/MergeIndividualDialog.vue'
import {
  fetchIndividualDetail,
  fetchIndividualMergeCandidates,
  syncIndividual,
  unmergeIndividual,
  type IndividualDetail,
  type IndividualMergeCandidate,
  type IndividualPassport,
} from '@/lib/individuals-api'
import { copyToClipboard, goBack } from '@/lib/utils'
import { breadcrumbOverride } from '@/lib/breadcrumb-state'
import { currentUser } from '@/lib/auth-state'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const isAdmin = computed(() => currentUser.value?.roles?.includes('ADMIN') ?? false)
const uid = computed(() => String(route.params.uid))

const detail = ref<IndividualDetail | null>(null)
const isLoading = ref(true)
const notFound = ref(false)
const copiedField = ref<'uid' | 'code' | null>(null)
const mappingDialogRef = ref<InstanceType<typeof Accounting1cMappingDialog> | null>(null)
let copyResetTimeout: ReturnType<typeof setTimeout> | undefined

const genderDisplay = computed(() => {
  if (detail.value?.gender === 'Мужской') return t('contracts.gender.male')
  if (detail.value?.gender === 'Женский') return t('contracts.gender.female')
  return detail.value?.gender ?? null
})

const initials = computed(() =>
  (detail.value?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)

function openAccounting1cMapping() {
  if (!detail.value) return
  mappingDialogRef.value?.open({
    kind: 'individual',
    id: detail.value.fizicheskoyeLitsoUid,
    label: detail.value.fullName,
    contractorUid: detail.value.accounting1cContractorUid,
  })
}

const citizenship = computed(() => detail.value?.citizenships[0] ?? null)
const citizenshipDisplay = computed(() => citizenship.value?.country ?? detail.value?.citizenship ?? null)

const manualPassportRow = computed<IndividualPassport | null>(() => {
  if (!detail.value?.isManual || !detail.value.passportNumber) return null
  return {
    id: -1,
    period: detail.value.passportIssuedAt ?? detail.value.createdAt,
    type: t('individuals.detail.manualPassportType'),
    series: detail.value.passportSeries ?? '',
    number: detail.value.passportNumber,
    dateStart: detail.value.passportIssuedAt ?? '',
    unit: detail.value.passportIssuedBy ?? '',
    codeUnit: detail.value.passportIssuedCode ?? '',
    systemDoc: '',
  }
})
const passportRows = computed<IndividualPassport[]>(() => {
  if (detail.value && detail.value.passports.length > 0) return detail.value.passports
  return manualPassportRow.value ? [manualPassportRow.value] : []
})
const latestPassport = computed(() => passportRows.value[0] ?? null)
const latestPassportRows = computed(() => (latestPassport.value ? [latestPassport.value] : []))

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

function contactTypeIcon(type: string) {
  if (type.includes('Адрес')) return Home
  if (type.includes('Телефон')) return Phone
  if (type.includes('Email')) return Mail
  if (type.includes('рождения')) return MapPin
  return null
}

const CONTACT_TYPE_ORDER = ['Место рождения', 'Адрес по прописке', 'Адрес места проживания', 'Телефон мобильный', 'Email']

interface ContactRow {
  key: string
  type: string
  predstavleniye: string | null
}

const MANUAL_CONTACT_FALLBACK: Partial<Record<string, () => string | null | undefined>> = {
  'Телефон мобильный': () => detail.value?.phone,
  Email: () => detail.value?.email,
  'Адрес по прописке': () => detail.value?.address,
}

const contactRows = computed<ContactRow[]>(() => {
  const byType = new Map((detail.value?.contactInfos ?? []).map((c) => [c.type, c]))
  const extraTypes = [...byType.keys()].filter((type) => !CONTACT_TYPE_ORDER.includes(type)).sort((a, b) => a.localeCompare(b, 'ru'))
  return [...CONTACT_TYPE_ORDER, ...extraTypes].map((type) => ({
    key: type,
    type,
    predstavleniye: byType.get(type)?.predstavleniye ?? MANUAL_CONTACT_FALLBACK[type]?.() ?? null,
  }))
})

const isSyncing = ref(false)
const syncError = ref('')
const syncFeedback = ref<'success' | 'error' | null>(null)
let syncFeedbackTimeout: ReturnType<typeof setTimeout> | undefined
const isSyncIconAnimating = ref(false)

const createDialogRef = ref<InstanceType<typeof CreateContractDialog> | null>(null)
const editDialogRef = ref<InstanceType<typeof EditIndividualDialog> | null>(null)
const historyDialogRef = ref<InstanceType<typeof IndividualHistoryDialog> | null>(null)
const mergeDialogRef = ref<InstanceType<typeof MergeIndividualDialog> | null>(null)

function onMerged(targetUid: string) {
  router.replace(`/individuals/${targetUid}`)
}

const isUnmerging = ref(false)
const unmergeError = ref('')
const unmergeWarning = ref('')
async function onUnmerge() {
  isUnmerging.value = true
  unmergeError.value = ''
  try {
    const result = await unmergeIndividual(uid.value)
    unmergeWarning.value = result.accountingMappingNeedsReview ? t('individuals.merge.accountingReviewWarning') : ''
    await loadDetail()
  } catch (error) {
    unmergeError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isUnmerging.value = false
  }
}

async function onIndividualSaved() {
  detail.value = await fetchIndividualDetail(uid.value)
}

async function runSync() {
  if (isSyncing.value) return
  isSyncing.value = true
  syncError.value = ''
  try {
    await syncIndividual(uid.value)
    detail.value = await fetchIndividualDetail(uid.value)
    syncFeedback.value = 'success'
  } catch (error) {
    syncError.value = error instanceof Error ? error.message : String(error)
    syncFeedback.value = 'error'
  } finally {
    isSyncing.value = false
    clearTimeout(syncFeedbackTimeout)
    syncFeedbackTimeout = setTimeout(() => (syncFeedback.value = null), 2000)
  }
}

async function copyValue(field: 'uid' | 'code', value: string | null | undefined) {
  if (!value) return
  await copyToClipboard(value)
  copiedField.value = field
  clearTimeout(copyResetTimeout)
  copyResetTimeout = setTimeout(() => (copiedField.value = null), 1500)
}

const mergeHintCandidates = ref<IndividualMergeCandidate[]>([])

async function loadDetail() {
  isLoading.value = true
  notFound.value = false
  mergeHintCandidates.value = []
  try {
    detail.value = await fetchIndividualDetail(uid.value)
    breadcrumbOverride.value = detail.value.fullName
    if (detail.value.isManual && !detail.value.mergedIntoUid) {
      try {
        mergeHintCandidates.value = await fetchIndividualMergeCandidates(uid.value)
      } catch {
      }
    }
  } catch {
    notFound.value = true
  } finally {
    isLoading.value = false
  }
}
watch(uid, loadDetail, { immediate: true })
onUnmounted(() => {
  breadcrumbOverride.value = null
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" @click="goBack(router, '/individuals')">
        <ArrowLeft class="text-primary" />
        <span class="sr-only">{{ t('individuals.detail.back') }}</span>
      </Button>
      <h1 class="text-lg font-medium">{{ t('individuals.detail.title') }}</h1>
    </div>

    <TableSkeleton v-if="isLoading" :columns="6" :rows="8" class="min-h-[60vh]" />
    <p v-else-if="notFound" class="text-sm text-red-500">{{ t('individuals.detail.notFound') }}</p>

    <template v-else-if="detail">
      <p v-if="unmergeWarning" class="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">{{ unmergeWarning }}</p>
      <div v-if="detail.mergedIntoUid" class="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
        <TriangleAlert class="size-4 shrink-0 text-amber-500" />
        <span>{{ t('individuals.merge.mergedBanner') }}</span>
        <RouterLink :to="`/individuals/${detail.mergedIntoUid}`" class="font-medium text-primary underline underline-offset-2">
          {{ t('individuals.merge.mergedBannerLink') }}
        </RouterLink>
        <Button v-if="isAdmin" variant="outline" size="sm" class="ml-auto" :loading="isUnmerging" @click="onUnmerge">
          {{ t('individuals.merge.undoButton') }}
        </Button>
        <p v-if="unmergeError" class="w-full text-sm text-red-500">{{ unmergeError }}</p>
      </div>

      <div v-else-if="mergeHintCandidates.length > 0" class="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <Combine class="size-4 shrink-0 text-primary" />
        <span>{{ t('individuals.merge.hintBanner', { count: mergeHintCandidates.length }) }}</span>
        <button type="button" class="font-medium text-primary underline underline-offset-2" @click="mergeDialogRef?.open(uid)">
          {{ t('individuals.merge.hintBannerAction') }}
        </button>
      </div>

      <div v-if="detail.mergedFrom.length > 0" class="flex flex-col gap-1.5 rounded-md border px-4 py-3 text-sm">
        <span class="flex items-center gap-2 font-medium text-muted-foreground">
          <Combine class="size-4 shrink-0 text-primary" />
          {{ t('individuals.merge.mergedFromLabel') }}
        </span>
        <RouterLink
          v-for="m in detail.mergedFrom"
          :key="m.fizicheskoyeLitsoUid"
          :to="`/individuals/${m.fizicheskoyeLitsoUid}`"
          class="w-fit text-primary underline underline-offset-2"
        >
          {{ m.fullName }}
        </RouterLink>
      </div>

      <Card class="data-reveal flex flex-col divide-y divide-border p-6 lg:flex-row lg:divide-x lg:divide-y-0">
        <div class="flex flex-col gap-4 pb-4 lg:w-96 lg:shrink-0 lg:pb-0 lg:pr-6">
          <div class="flex gap-4" :class="detail.isManual ? 'items-center' : 'items-start'">
            <Avatar class="size-20">
              <AvatarFallback class="text-xl">{{ initials }}</AvatarFallback>
            </Avatar>
            <div class="flex flex-col gap-1" :class="detail.isManual ? '' : 'pt-1'">
              <div class="flex flex-wrap items-center gap-2">
                <div class="text-xl font-semibold">{{ detail.fullName }}</div>
                <button v-if="!detail.mergedIntoUid" type="button" class="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="openAccounting1cMapping">
                  <Accounting1cLinkedBadge :linked="detail.accounting1cContractorUid !== null" />
                </button>
                <Accounting1cLinkedBadge v-else :linked="detail.accounting1cContractorUid !== null" />
              </div>
              <template v-if="!detail.isManual">
                <button
                  type="button"
                  class="grid w-fit items-center text-xs text-muted-foreground hover:text-foreground"
                  @click="copyValue('uid', detail.fizicheskoyeLitsoUid)"
                >
                  <Transition enter-active-class="animate-in fade-in-0 duration-200" leave-active-class="animate-out fade-out-0 duration-200">
                    <span v-if="copiedField === 'uid'" key="copied" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Check class="size-3.5 shrink-0 text-emerald-500" />
                      <span>{{ t('individuals.detail.copied') }}</span>
                    </span>
                    <span v-else key="value" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Copy class="size-3.5 shrink-0" />
                      <span>{{ detail.fizicheskoyeLitsoUid }}</span>
                    </span>
                  </Transition>
                </button>
                <button
                  type="button"
                  class="grid w-fit items-center text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  :disabled="!detail.code"
                  @click="copyValue('code', detail.code)"
                >
                  <Transition enter-active-class="animate-in fade-in-0 duration-200" leave-active-class="animate-out fade-out-0 duration-200">
                    <span v-if="copiedField === 'code'" key="copied" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Check class="size-3.5 shrink-0 text-emerald-500" />
                      <span>{{ t('individuals.detail.copied') }}</span>
                    </span>
                    <span v-else key="value" class="col-start-1 row-start-1 flex items-center gap-1.5">
                      <Copy class="size-3.5 shrink-0" />
                      <span>{{ detail.code ?? '-' }}</span>
                    </span>
                  </Transition>
                </button>
              </template>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <Button
              v-if="!detail.isManual"
              variant="outline"
              size="sm"
              class="w-full justify-start"
              :disabled="isSyncing || syncFeedback !== null || isSyncIconAnimating"
              @click="runSync"
            >
              <Transition
                enter-active-class="animate-in fade-in-0 duration-200"
                leave-active-class="animate-out fade-out-0 duration-200"
                mode="out-in"
                @before-leave="isSyncIconAnimating = true"
                @after-enter="isSyncIconAnimating = false"
              >
                <Check v-if="syncFeedback === 'success'" key="success" class="text-emerald-500" />
                <X v-else-if="syncFeedback === 'error'" key="error" class="text-red-500" />
                <RefreshCw v-else key="refresh" class="text-primary" :class="{ 'animate-spin': isSyncing }" />
              </Transition>
              {{ t('individuals.detail.sync') }}
            </Button>
            <Button v-if="!detail.mergedIntoUid" size="sm" class="w-full justify-start" @click="detail && createDialogRef?.open(detail)">
              <FileSignature />
              {{ t('individuals.detail.createContract') }}
            </Button>
            <Button v-if="!detail.mergedIntoUid" variant="outline" size="sm" class="w-full justify-start" @click="detail && editDialogRef?.open(detail)">
              <Pencil class="text-primary" />
              {{ t('individuals.detail.edit') }}
            </Button>
            <Button variant="outline" size="sm" class="w-full justify-start" @click="historyDialogRef?.open(uid)">
              <History class="text-primary" />
              {{ t('individuals.detail.history') }}
            </Button>
            <Button
              v-if="detail.isManual && !detail.mergedIntoUid"
              variant="outline"
              size="sm"
              class="w-full justify-start"
              @click="mergeDialogRef?.open(uid)"
            >
              <Combine class="text-primary" />
              {{ t('individuals.merge.button') }}
            </Button>
          </div>
          <p v-if="syncError" class="text-sm text-red-500">{{ syncError }}</p>
        </div>

        <div class="flex flex-col divide-y divide-border py-4 lg:min-w-0 lg:flex-1 lg:py-0 lg:px-6">
          <div
            v-for="contact in contactRows"
            :key="contact.key"
            class="flex items-start gap-2 py-2 text-sm first:pt-0 last:pb-0"
          >
            <span class="flex w-40 shrink-0 items-center gap-1.5 text-muted-foreground">
              <component :is="contactTypeIcon(contact.type)" v-if="contactTypeIcon(contact.type)" class="size-4 shrink-0 text-primary" />
              {{ contact.type }}
            </span>
            <span>{{ contact.predstavleniye || '-' }}</span>
          </div>
        </div>

        <div class="flex flex-col divide-y divide-border pt-4 lg:w-64 lg:shrink-0 lg:pt-0 lg:pl-6">
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">{{ t('individuals.detail.citizenship') }}</span>
            <span>{{ citizenshipDisplay ?? '-' }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">{{ t('individuals.detail.birthDate') }}</span>
            <span>{{ formatDate(detail.birthDate) }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">{{ t('individuals.detail.gender') }}</span>
            <span>{{ genderDisplay ?? '-' }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">{{ t('individuals.detail.snils') }}</span>
            <span>{{ detail.snils ?? '-' }}</span>
          </div>
          <div class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
            <span class="text-muted-foreground">{{ t('individuals.detail.inn') }}</span>
            <span>{{ detail.inn ?? '-' }}</span>
          </div>
        </div>
      </Card>

      <div class="text-lg font-medium">{{ t('individuals.detail.documentsTitle') }}</div>

      <Card class="data-reveal p-6">
        <Tabs default-value="latest">
          <TabsList>
            <TabsTrigger value="latest">{{ t('individuals.detail.tabLatest') }}</TabsTrigger>
            <TabsTrigger value="all" class="gap-1.5">
              {{ t('individuals.detail.tabAll') }}
              <Badge variant="secondary">{{ passportRows.length }}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="latest">
            <PassportTable :passports="latestPassportRows" />
          </TabsContent>

          <TabsContent value="all">
            <PassportTable :passports="passportRows" />
          </TabsContent>
        </Tabs>
      </Card>

      <div class="text-lg font-medium">{{ t('individuals.detail.educationTitle') }}</div>

      <Card class="data-reveal p-6">
        <p v-if="!detail.students.length" class="text-sm text-muted-foreground">{{ t('individuals.detail.noData') }}</p>

        <Tabs v-else :default-value="detail.students[0].zachetnayaKnigaUid">
          <TabsList class="h-auto flex-wrap">
            <TabsTrigger
              v-for="student in detail.students"
              :key="student.zachetnayaKnigaUid"
              :value="student.zachetnayaKnigaUid"
            >
              {{ student.zachetnayaKniga }}
            </TabsTrigger>
          </TabsList>
          <TabsContent v-for="student in detail.students" :key="student.zachetnayaKnigaUid" :value="student.zachetnayaKnigaUid">
            <StudentFields :student="student" />
          </TabsContent>
        </Tabs>
      </Card>
    </template>

    <CreateContractDialog ref="createDialogRef" />
    <EditIndividualDialog ref="editDialogRef" @saved="onIndividualSaved" />
    <IndividualHistoryDialog ref="historyDialogRef" />
    <MergeIndividualDialog ref="mergeDialogRef" @merged="onMerged" />
    <Accounting1cMappingDialog ref="mappingDialogRef" @saved="loadDetail" />
  </div>
</template>
