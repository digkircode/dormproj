import { ref } from 'vue'
import { fetchCurrentUser, type SessionUser } from './auth-api'

export const currentUser = ref<SessionUser | null>(null)
export const isAuthLoading = ref(true)
export const authLoadError = ref(false)

let loadPromise: Promise<void> | null = null

export function ensureUserLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      isAuthLoading.value = true
      authLoadError.value = false
      try {
        currentUser.value = await fetchCurrentUser()
      } catch (error) {
        console.error('Не удалось проверить сессию', error)
        authLoadError.value = true
      } finally {
        isAuthLoading.value = false
      }
    })()
  }
  return loadPromise
}

export async function loadCurrentUser(): Promise<void> {
  loadPromise = null
  await ensureUserLoaded()
}
