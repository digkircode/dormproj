import {
  createTableHook,
  tableFeatures,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  createPaginatedRowModel,
  createSortedRowModel,
} from '@tanstack/vue-table'

const features = tableFeatures({
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

export type AppFeatures = typeof features

const hook = createTableHook({ features })
export const useAppTable = hook.useAppTable
export const createAppColumnHelper = hook.createAppColumnHelper
