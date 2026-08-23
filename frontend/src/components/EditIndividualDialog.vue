<script setup lang="ts">
import { computed, ref } from 'vue'
import { UserRound, Contact, IdCard } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import DatePickerField from '@/components/DatePickerField.vue'
import { updateIndividual, type IndividualDetail } from '@/lib/individuals-api'
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
const citizenship = ref('')
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
  citizenship.value = detail.citizenships[0]?.country ?? detail.citizenship ?? ''
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
  if (!surname.value.trim() || !name.value.trim() || !birthDate.value) {
    dialogError.value = 'Заполните обязательные поля'
    return
  }

  isSaving.value = true
  try {
    await updateIndividual(uid.value, {
      surname: surname.value.trim(),
      name: name.value.trim(),
      otchestvo: otchestvo.value.trim() || null,
      birthDate: birthDate.value,
      gender: gender.value || null,
      citizenship: citizenship.value.trim() || null,
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
        <DialogTitle>Редактирование физического лица</DialogTitle>
      </DialogHeader>

      <p class="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Правки пишутся напрямую в данные физлица. Для синхронизируемых из 1С физлиц ближайший ночной синхрон может
        перезаписать их обратно — используйте это только для критических ситуаций.
      </p>

      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-3">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <UserRound class="size-4 text-primary" />
            Личная информация
          </p>
          <div class="flex flex-col gap-4 rounded-md border p-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <Label>Фамилия</Label>
                <Input v-model="surname" :class="surnameInvalid ? 'border-red-500' : ''" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Имя</Label>
                <Input v-model="name" :class="nameInvalid ? 'border-red-500' : ''" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Отчество</Label>
                <Input v-model="otchestvo" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Дата рождения</Label>
                <DatePickerField v-model="birthDate" :invalid="birthDateInvalid" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Пол</Label>
                <Select :model-value="gender || undefined" @update:model-value="(v) => (gender = v as 'Мужской' | 'Женский')">
                  <SelectTrigger>
                    <SelectValue placeholder="Не указан" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Мужской">Мужской</SelectItem>
                    <SelectItem value="Женский">Женский</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div class="flex flex-col gap-2">
                <Label>Гражданство</Label>
                <Input v-model="citizenship" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>Место рождения</Label>
                <Input v-model="birthPlace" />
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <Contact class="size-4 text-primary" />
            Контактная информация
          </p>
          <div class="flex flex-col gap-4 rounded-md border p-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <Label>Телефон мобильный</Label>
                <Input v-model="phone" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Email</Label>
                <Input v-model="email" type="email" :class="emailInvalid ? 'border-red-500' : ''" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>Адрес по прописке</Label>
                <Input v-model="registrationAddress" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>Адрес места проживания</Label>
                <Input v-model="residenceAddress" />
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <p class="flex items-center gap-1.5 text-sm font-medium">
            <IdCard class="size-4 text-primary" />
            Документы
          </p>
          <div class="flex flex-col gap-4 rounded-md border p-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <Label>СНИЛС</Label>
                <input :value="snils" :class="MASK_INPUT_CLASS" placeholder="000-000-000 00" @input="onSnilsInput" @keydown="blockNonDigitKeys" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>ИНН</Label>
                <Input v-model="inn" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Паспорт: серия</Label>
                <Input v-model="passportSeries" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Паспорт: номер</Label>
                <Input v-model="passportNumber" />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Код подразделения</Label>
                <input
                  :value="passportIssuedCode"
                  :class="MASK_INPUT_CLASS"
                  placeholder="000-000"
                  @input="onPassportIssuedCodeInput"
                  @keydown="blockNonDigitKeys"
                />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Дата выдачи</Label>
                <DatePickerField v-model="passportIssuedAt" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>Кем выдан</Label>
                <Input v-model="passportIssuedBy" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <p v-if="dialogError" class="mr-auto self-center text-sm text-red-500">{{ dialogError }}</p>
        <Button variant="outline" @click="isDialogOpen = false">Отмена</Button>
        <Button :loading="isSaving" @click="submitUpdate">Сохранить</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
