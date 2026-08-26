<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UserRound, Contact, IdCard } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import DatePickerField from '@/components/DatePickerField.vue'
import SearchSelect from '@/components/SearchSelect.vue'
import { updateIndividual, type IndividualDetail } from '@/lib/individuals-api'
import { OKSM_COUNTRIES } from '@/lib/citizenship-list'
import { blockNonDigitKeys, formatSnils, formatSubdivisionCode, parseApiError } from '@/lib/utils'

// "Критическая правка" — пишет напрямую в синхронные таблицы физлица (ContactInfo/
// Passport/Citizenship), не только в manual-поля Individual (см. backend/src/
// individuals/individual-edit.ts). Ближайший ночной синхрон синхронизируемых физлиц
// перезапишет эти значения обратно из 1С — предупреждение об этом в самом диалоге,
// не только в комментариях, чтобы сотрудник не удивился на следующий день.

const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
const MASK_INPUT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50'

const { t } = useI18n()

const isDialogOpen = ref(false)
const isSaving = ref(false)
const dialogError = ref('')
const submitAttempted = ref(false)
const serverFieldErrors = ref<Set<string>>(new Set())

const uid = ref('')
const surname = ref('')
const name = ref('')
const otchestvo = ref('')
const birthDate = ref('')
const gender = ref<'Мужской' | 'Женский' | ''>('')
// Закрытый список (ОКСМ, см. lib/citizenship-list.ts) — значение из 1С (detail.citizenships)
// может не совпасть буквально ни с одним пунктом списка (другой регистр/формулировка) —
// тогда SearchSelect просто не покажет выбор как "применённый", сотруднику придётся
// выбрать страну заново, прежде чем сохранить любую другую правку. Ожидаемое следствие
// решения "гражданство — закрытый список", не баг.
const citizenship = ref('')
const citizenshipQuery = ref('')
const citizenshipResults = ref<string[]>([])
const birthPlace = ref('')

const phone = ref('')
const email = ref('')
const registrationAddress = ref('')
const residenceAddress = ref('')

const snils = ref('')
const inn = ref('')
const passportSeries = ref('')
const passportNumber = ref('')
const passportIssuedBy = ref('')
const passportIssuedCode = ref('')
const passportIssuedAt = ref('')

function computedInvalid(check: () => boolean) {
  return computed(() => submitAttempted.value && check())
}
const surnameInvalid = computedInvalid(() => !surname.value.trim())
const nameInvalid = computedInvalid(() => !name.value.trim())
const birthDateInvalid = computedInvalid(() => !birthDate.value)
const genderInvalid = computedInvalid(() => !gender.value)
const citizenshipInvalid = computedInvalid(() => !citizenship.value.trim())
// Email необязателен и без проверки формата (по прямой просьбе 2026-08-23) — только
// серверные ошибки поля (если когда-нибудь появятся по другой причине) подсвечивают рамку.
const emailInvalid = computedInvalid(() => serverFieldErrors.value.has('email'))

function onSnilsInput(event: Event) {
  const input = event.target as HTMLInputElement
  const formatted = formatSnils(input.value)
  input.value = formatted
  snils.value = formatted
}
function onPassportIssuedCodeInput(event: Event) {
  const input = event.target as HTMLInputElement
  const formatted = formatSubdivisionCode(input.value)
  input.value = formatted
  passportIssuedCode.value = formatted
}

function onCitizenshipSearch(q: string) {
  citizenship.value = ''
  const query = q.trim().toUpperCase()
  citizenshipResults.value = query ? OKSM_COUNTRIES.filter((c) => c.includes(query)).slice(0, 30) : []
}
function pickCitizenship(country: string) {
  citizenship.value = country
  citizenshipQuery.value = country
  citizenshipResults.value = []
}

function open(detail: IndividualDetail) {
  dialogError.value = ''
  submitAttempted.value = false
  serverFieldErrors.value = new Set()

  uid.value = detail.fizicheskoyeLitsoUid
  surname.value = detail.surname ?? ''
  name.value = detail.name ?? ''
  otchestvo.value = detail.otchestvo ?? ''
  birthDate.value = detail.birthDate ?? ''
  gender.value = (detail.gender as 'Мужской' | 'Женский' | null) ?? ''
  // Значение из 1С может не совпасть буквально ни с одним пунктом закрытого списка ОКСМ
  // (другой регистр/формулировка) — тогда только показываем его в поле поиска для
  // контекста, а не как применённый выбор (см. citizenship выше), сотруднику нужно
  // подтвердить страну заново.
  {
    const syncedCitizenship = detail.citizenships[0]?.country ?? detail.citizenship ?? ''
    const matched = OKSM_COUNTRIES.find((c) => c === syncedCitizenship.trim().toUpperCase())
    citizenship.value = matched ?? ''
    citizenshipQuery.value = matched ?? syncedCitizenship
    citizenshipResults.value = []
  }
  birthPlace.value = detail.contactInfos.find((c) => c.type === 'Место рождения')?.predstavleniye ?? ''

  phone.value = detail.contactInfos.find((c) => c.type === 'Телефон мобильный')?.predstavleniye ?? detail.phone ?? ''
  email.value = detail.contactInfos.find((c) => c.type === 'Email')?.predstavleniye ?? detail.email ?? ''
  registrationAddress.value = detail.contactInfos.find((c) => c.type === 'Адрес по прописке')?.predstavleniye ?? detail.address ?? ''
  residenceAddress.value = detail.contactInfos.find((c) => c.type === 'Адрес места проживания')?.predstavleniye ?? ''

  snils.value = detail.snils ?? ''
  inn.value = detail.inn ?? ''
  const passport = detail.passports[0]
  passportSeries.value = passport?.series ?? detail.passportSeries ?? ''
  passportNumber.value = passport?.number ?? detail.passportNumber ?? ''
  passportIssuedBy.value = passport?.unit ?? detail.passportIssuedBy ?? ''
  passportIssuedCode.value = passport?.codeUnit ?? detail.passportIssuedCode ?? ''
  passportIssuedAt.value = passport?.dateStart ?? detail.passportIssuedAt ?? ''

  isDialogOpen.value = true
}

const emit = defineEmits<{ saved: [] }>()

defineExpose({ open })

async function submitUpdate() {
  dialogError.value = ''
  serverFieldErrors.value = new Set()
  submitAttempted.value = true
  if (!surname.value.trim() || !name.value.trim() || !birthDate.value || !gender.value || !citizenship.value.trim()) {
    dialogError.value = t('individuals.editDialog.requiredFieldsError')
    return
  }

  isSaving.value = true
  try {
    await updateIndividual(uid.value, {
      surname: surname.value.trim(),
      name: name.value.trim(),
      otchestvo: otchestvo.value.trim() || null,
      birthDate: birthDate.value,
      gender: gender.value,
      citizenship: citizenship.value.trim(),
      birthPlace: birthPlace.value.trim() || null,
      phone: phone.value.trim() || null,
      email: email.value.trim() || null,
      registrationAddress: registrationAddress.value.trim() || null,
      residenceAddress: residenceAddress.value.trim() || null,
      snils: snils.value.trim() || null,
      inn: inn.value.trim() || null,
      passportSeries: passportSeries.value.trim() || null,
      passportNumber: passportNumber.value.trim() || null,
      passportIssuedBy: passportIssuedBy.value.trim() || null,
      passportIssuedCode: passportIssuedCode.value.trim() || null,
      passportIssuedAt: passportIssuedAt.value || null,
    })
    isDialogOpen.value = false
    emit('saved')
  } catch (error) {
    const parsed = parseApiError(error)
    dialogError.value = parsed.message
    serverFieldErrors.value = parsed.fields
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog :open="isDialogOpen" @update:open="(open) => (isDialogOpen = open)">
    <DialogScrollContent :class="['flex flex-col gap-4 sm:max-w-2xl', DIALOG_ANIMATE_CLASS]">
      <DialogHeader>
        <DialogTitle>{{ t('individuals.editDialog.title') }}</DialogTitle>
      </DialogHeader>

      <p class="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {{ t('individuals.editDialog.warning') }}
      </p>

      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-3">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <UserRound class="size-4 text-primary" />
            {{ t('individuals.editDialog.sectionPersonal') }}
          </p>
          <div class="flex flex-col gap-4 rounded-md border p-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.surname') }}</Label>
                <Input v-model="surname" :class="surnameInvalid ? 'border-red-500' : ''" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.name') }}</Label>
                <Input v-model="name" :class="nameInvalid ? 'border-red-500' : ''" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.otchestvo') }}</Label>
                <Input v-model="otchestvo" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.birthDate') }}</Label>
                <DatePickerField v-model="birthDate" :invalid="birthDateInvalid" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.gender') }}</Label>
                <Select :model-value="gender || undefined" @update:model-value="(v) => (gender = v as 'Мужской' | 'Женский')">
                  <SelectTrigger :class="genderInvalid ? 'border-red-500' : ''">
                    <SelectValue :placeholder="t('individuals.editDialog.genderPlaceholder')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Мужской">{{ t('contracts.gender.male') }}</SelectItem>
                    <SelectItem value="Женский">{{ t('contracts.gender.female') }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.citizenship') }}</Label>
                <SearchSelect
                  v-model="citizenshipQuery"
                  :items="citizenshipResults"
                  :item-key="(c: string) => c"
                  :item-label="(c: string) => c"
                  :placeholder="t('individuals.editDialog.citizenshipPlaceholder')"
                  :invalid="citizenshipInvalid"
                  @search="onCitizenshipSearch"
                  @select="pickCitizenship"
                />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.birthPlace') }}</Label>
                <Input v-model="birthPlace" />
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <Contact class="size-4 text-primary" />
            {{ t('individuals.editDialog.sectionContact') }}
          </p>
          <div class="flex flex-col gap-4 rounded-md border p-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.phone') }}</Label>
                <Input v-model="phone" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.email') }}</Label>
                <Input v-model="email" type="email" :class="emailInvalid ? 'border-red-500' : ''" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.registrationAddress') }}</Label>
                <Input v-model="registrationAddress" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.residenceAddress') }}</Label>
                <Input v-model="residenceAddress" />
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <IdCard class="size-4 text-primary" />
            {{ t('individuals.editDialog.sectionDocuments') }}
          </p>
          <div class="flex flex-col gap-4 rounded-md border p-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.snils') }}</Label>
                <input :value="snils" :class="MASK_INPUT_CLASS" placeholder="000-000-000 00" @input="onSnilsInput" @keydown="blockNonDigitKeys" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.inn') }}</Label>
                <Input v-model="inn" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.passportSeries') }}</Label>
                <Input v-model="passportSeries" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.passportNumber') }}</Label>
                <Input v-model="passportNumber" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.passportIssuedCode') }}</Label>
                <input
                  :value="passportIssuedCode"
                  :class="MASK_INPUT_CLASS"
                  placeholder="000-000"
                  @input="onPassportIssuedCodeInput"
                  @keydown="blockNonDigitKeys"
                />
              </div>
              <div class="flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.passportIssuedAt') }}</Label>
                <DatePickerField v-model="passportIssuedAt" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>{{ t('individuals.editDialog.passportIssuedBy') }}</Label>
                <Input v-model="passportIssuedBy" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <p v-if="dialogError" class="mr-auto self-center text-sm text-red-500">{{ dialogError }}</p>
        <Button variant="outline" @click="isDialogOpen = false">{{ t('individuals.editDialog.cancel') }}</Button>
        <Button :loading="isSaving" @click="submitUpdate">{{ t('individuals.editDialog.save') }}</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
