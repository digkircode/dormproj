import { ref } from 'vue'
import type { Router, RouteLocationNormalized } from 'vue-router'

export interface BreadcrumbCrumb {
  name: string
  title: string
  path: string
}

export const breadcrumbTrail = ref<BreadcrumbCrumb[]>([])
export const breadcrumbOverride = ref<string | null>(null)

function buildCrumb(to: RouteLocationNormalized): BreadcrumbCrumb {
  return { name: to.name as string, title: (to.meta.title as string) ?? '', path: to.fullPath }
}

function buildStaticTrail(router: Router, to: RouteLocationNormalized): BreadcrumbCrumb[] {
  const trail: BreadcrumbCrumb[] = []
  let current = router.getRoutes().find((r) => r.name === to.name)
  while (current) {
    if (current.meta.title) {
      trail.unshift({
        name: current.name as string,
        title: current.meta.title as string,
        path: current.name === to.name ? to.fullPath : current.path,
      })
    }
    const parentName = current.meta.parent as string | undefined
    current = parentName ? router.getRoutes().find((r) => r.name === parentName) : undefined
  }
  if (to.name !== 'home') trail.unshift({ name: 'home', title: 'nav.home', path: '/' })
  return trail
}

export function trackBreadcrumbs(router: Router) {
  router.afterEach((to) => {
    if (!to.name) return
    breadcrumbOverride.value = null

    const existingIndex = breadcrumbTrail.value.findIndex((c) => c.name === to.name)
    if (existingIndex !== -1) {
      breadcrumbTrail.value = breadcrumbTrail.value.slice(0, existingIndex + 1)
      breadcrumbTrail.value[existingIndex] = buildCrumb(to)
      return
    }

    if (!to.meta.parent || breadcrumbTrail.value.length === 0) {
      breadcrumbTrail.value = buildStaticTrail(router, to)
      return
    }

    breadcrumbTrail.value = [...breadcrumbTrail.value, buildCrumb(to)]
  })
}
