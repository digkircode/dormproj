<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Check, Copy } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import PassportTable from '@/components/PassportTable.vue'
import { fetchIndividualDetail, type IndividualDetail } from '@/lib/individuals-api'
import { copyToClipboard } from '@/lib/utils'

const route = useRoute()
const uid = computed(() => String(route.params.uid))

const detail = ref<IndividualDetail | null>(null)
const isLoading = ref(true)
const notFound = ref(false)
const copiedField = ref<'uid' | 'code' | null>(null)
let copyResetTimeout: ReturnType<typeof setTimeout> | undefined

const initials = computed(() =>
  (detail.value?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)

const citizenship = computed(() => detail.value?.citizenships[0] ?? null)
const latestPassport = computed(() => detail.value?.passports[0] ?? null)
const latestPassportRows = computed(() => (latestPassport.value ? [latestPassport.value] : []))

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

async function copyValue(field: 'uid' | 'code', value: string | null | undefined) {
  if (!value) return
  await copyToClipboard(value)
  copiedField.value = field
  clearTimeout(copyResetTimeout)
  copyResetTimeout = setTimeout(() => (copiedField.value = null), 1500)
}

onMounted(async () => {
  try {
    detail.value = await fetchIndividualDetail(uid.value)
  } catch {
    notFound.value = true
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="flex flex-1 flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="size-7" as-child>
        <RouterLink to="/individuals">
          <ArrowLeft />
          <span class="sr-only">К физическим лицам</span>
        </RouterLink>
      </Button>
      <h1 class="text-lg font-medium">{{ detail?.fullName ?? 'Физическое лицо' }}</h1>
    </div>

    <p v-if="isLoading" class="text-sm text-muted-foreground">Загрузка…</p>
    <p v-else-if="notFound" class="text-sm text-red-500">Физлицо не найдено</p>

    <template v-else-if="detail">
      <Card class="gap-4 p-6">
        <div class="flex flex-col divide-y divide-border sm:grid sm:grid-cols-[auto_repeat(5,1fr)] sm:divide-x sm:divide-y-0">
          <div class="flex items-start gap-4 pb-4 sm:pb-0 sm:pr-6">
            <!-- Синхрона фотографий из 1С пока нет — заглушка с инициалами, как в NavUser -->
            <Avatar class="size-20">
              <AvatarFallback class="text-xl">{{ initials }}</AvatarFallback>
            </Avatar>
            <div class="flex flex-col gap-1 pt-1">
              <div class="text-xl font-semibold">{{ detail.fullName }}</div>
              <button
                type="button"
                class="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                @click="copyValue('uid', detail.fizicheskoyeLitsoUid)"
              >
                <component :is="copiedField === 'uid' ? Check : Copy" class="size-3.5 shrink-0" />
                <span>{{ detail.fizicheskoyeLitsoUid }}</span>
              </button>
              <button
                type="button"
                class="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                :disabled="!detail.code"
                @click="copyValue('code', detail.code)"
              >
                <component :is="copiedField === 'code' ? Check : Copy" class="size-3.5 shrink-0" />
                <span>{{ detail.code ?? '—' }}</span>
              </button>
            </div>
          </div>

          <div class="py-4 sm:px-6 sm:py-0">
            <div class="text-xs text-muted-foreground">Гражданство</div>
            <div class="text-sm">{{ citizenship?.country ?? '—' }}</div>
          </div>
          <div class="py-4 sm:px-6 sm:py-0">
            <div class="text-xs text-muted-foreground">Дата рождения</div>
            <div class="text-sm">{{ formatDate(detail.birthDate) }}</div>
          </div>
          <div class="py-4 sm:px-6 sm:py-0">
            <div class="text-xs text-muted-foreground">Пол</div>
            <div class="text-sm">{{ detail.gender ?? '—' }}</div>
          </div>
          <div class="py-4 sm:px-6 sm:py-0">
            <div class="text-xs text-muted-foreground">СНИЛС</div>
            <div class="text-sm">{{ detail.snils ?? '—' }}</div>
          </div>
          <div class="pt-4 sm:py-0 sm:pl-6">
            <div class="text-xs text-muted-foreground">ИНН</div>
            <div class="text-sm">{{ detail.inn ?? '—' }}</div>
          </div>
        </div>
      </Card>

      <!-- Card сам по себе не flex, поэтому gap на нём ничего не делает без явного
           flex flex-col — без этого класса отступ между заголовком и вкладками не растёт. -->
      <Card class="flex flex-col gap-8 p-6">
        <div class="text-sm font-medium">Документы удостоверяющие личность</div>

        <Tabs default-value="latest">
          <TabsList>
            <TabsTrigger value="latest">Актуальный</TabsTrigger>
            <TabsTrigger value="all" class="gap-1.5">
              Все
              <Badge variant="secondary">{{ detail.passports.length }}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="latest">
            <PassportTable :passports="latestPassportRows" />
          </TabsContent>

          <TabsContent value="all">
            <PassportTable :passports="detail.passports" />
          </TabsContent>
        </Tabs>
      </Card>
    </template>
  </div>
</template>
