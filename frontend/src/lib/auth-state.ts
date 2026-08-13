import { ref } from 'vue'
import { fetchCurrentUser, type SessionUser } from './auth-api'

// Модульный singleton вместо стора — состояние одно на всё приложение,
// а полноценный Pinia под единственный кусок state было бы избыточно.
export const currentUser = ref<SessionUser | null>(null)
export const isAuthLoading = ref(true)

export async function loadCurrentUser(): Promise<void> {
  isAuthLoading.value = true
  try {
    currentUser.value = await fetchCurrentUser()
  } finally {
    isAuthLoading.value = false
  }
}
