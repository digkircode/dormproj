<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { UserRound, Contact, IdCard } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogScrollContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import DatePickerField from '@/components/DatePickerField.vue'
import PhoneInput from '@/components/PhoneInput.vue'
import { createIndividual } from '@/lib/individuals-api'
import { blockNonDigitKeys, formatSnils, formatSubdivisionCode, isValidEmailFormat, parseApiError } from '@/lib/utils'

const router = useRouter()

// Тот же fade-переход открытия/закрытия, что у остальных диалогов (CreateContractDialog.vue).
const DIALOG_ANIMATE_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
// Те же классы, что и у components/ui/input/Input.vue — для голых <input> с собственной
// маской (СНИЛС/код подразделения), см. комментарий у соответствующих полей ниже.
const MASK_INPUT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground transition-shadow focus-visible:outline-none focus-visible:border-ring/50 focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:shadow-sm disabled:cursor-not-allowed disabled:opacity-50'

const isDialogOpen = ref(false)
const isSaving = ref(false)
const dialogError = ref('')
const submitAttempted = ref(false)
const serverFieldErrors = ref<Set<string>>(new Set())

const surname = ref('')
const name = ref('')
const otchestvo = ref('')
const birthDate = ref('')
const gender = ref<'Мужской' | 'Женский' | ''>('')
const citizenship = ref('')

const phone = ref('')
const email = ref('')
const address = ref('')

const snils = ref('')
const inn = ref('')
const passportSeries = ref('')
const passportNumber = ref('')
const passportIssuedBy = ref('')
const passportIssuedCode = ref('')
const passportIssuedAt = ref('')

const phoneInputRef = ref<InstanceType<typeof PhoneInput> | null>(null)

// Тот же паттерн submitAttempted-гейта, что и в CreateContractDialog.vue.
function computedInvalid(check: () => boolean) {
  return computed(() => submitAttempted.value && check())
}

const surnameInvalid = computedInvalid(() => !surname.value.trim())
const nameInvalid = computedInvalid(() => !name.value.trim())
const birthDateInvalid = computedInvalid(() => !birthDate.value)
const addressInvalid = computedInvalid(() => !address.value.trim())
const passportNumberInvalid = computedInvalid(() => !passportNumber.value.trim())
const passportIssuedAtInvalid = computedInvalid(() => !passportIssuedAt.value)
const emailInvalid = computedInvalid(
  () => serverFieldErrors.value.has('email') || (!!email.value.trim() && !isValidEmailFormat(email.value.trim())),
)

// СНИЛС/код подразделения — цифровая маска с разделителями (formatSnils/
// formatSubdivisionCode, см. lib/utils.ts), тот же приём, что и в CreateContractDialog.vue
// для полей родителя.
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

async function open() {
  dialogError.value = ''
  submitAttempted.value = false
  serverFieldErrors.value = new Set()
  surname.value = ''
  name.value = ''
  otchestvo.value = ''
  birthDate.value = ''
  gender.value = ''
  citizenship.value = ''
  phone.value = ''
  email.value = ''
  address.value = ''
  snils.value = ''
  inn.value = ''
  passportSeries.value = ''
  passportNumber.value = ''
  passportIssuedBy.value = ''
  passportIssuedCode.value = ''
  passportIssuedAt.value = ''
  isDialogOpen.value = true
}

defineExpose({ open })

async function submitCreate() {
  dialogError.value = ''
  serverFieldErrors.value = new Set()
  submitAttempted.value = true
  const phoneValid = phoneInputRef.value?.validate() ?? true
  if (
    !surname.value.trim() ||
    !name.value.trim() ||
    !birthDate.value ||
    !phoneValid ||
    !address.value.trim() ||
    !passportNumber.value.trim() ||
    !passportIssuedAt.value ||
    (!!email.value.trim() && !isValidEmailFormat(email.value.trim()))
  ) {
    dialogError.value = 'Заполните обязательные поля'
    return
  }

  isSaving.value = true
  try {
    const created = await createIndividual({
      surname: surname.value.trim(),
      name: name.value.trim(),
      otchestvo: otchestvo.value.trim() || null,
      birthDate: birthDate.value,
      gender: gender.value || null,
      citizenship: citizenship.value.trim() || null,
      phone: phone.value,
      email: email.value.trim() || null,
      address: address.value.trim(),
      snils: snils.value.trim() || null,
      inn: inn.value.trim() || null,
      passportSeries: passportSeries.value.trim() || null,
      passportNumber: passportNumber.value.trim(),
      passportIssuedBy: passportIssuedBy.value.trim() || null,
      passportIssuedCode: passportIssuedCode.value.trim() || null,
      passportIssuedAt: passportIssuedAt.value,
    })
    isDialogOpen.value = false
    await router.push(`/individuals/${encodeURIComponent(created.fizicheskoyeLitsoUid)}`)
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
        <DialogTitle>Новое физическое лицо</DialogTitle>
      </DialogHeader>

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
                <Label>Телефон</Label>
                <PhoneInput ref="phoneInputRef" v-model="phone" required />
              </div>
              <div class="flex flex-col gap-2">
                <Label>Email</Label>
                <Input v-model="email" type="email" :class="emailInvalid ? 'border-red-500' : ''" />
              </div>
              <div class="col-span-2 flex flex-col gap-2">
                <Label>Адрес регистрации</Label>
                <Input v-model="address" :class="addressInvalid ? 'border-red-500' : ''" />
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
                <!-- Голый <input>, не обёртка Input.vue — та держит свой внутренний v-model
                     на том же нативном 'input'-событии, что и наш @input-хендлер маски —
                     гонка (см. известную ловушку в промпте проекта, тот же приём, что и в
                     DatePickerField.vue). -->
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
                <Input v-model="passportNumber" :class="passportNumberInvalid ? 'border-red-500' : ''" />
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
                <DatePickerField v-model="passportIssuedAt" :invalid="passportIssuedAtInvalid" />
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
        <Button :loading="isSaving" @click="submitCreate">Создать</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
