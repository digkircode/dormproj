import { parse } from 'devalue'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const blockName = process.argv[2]
const projectRoot = join(import.meta.dirname, '..')

const res = await fetch(`https://shadcn-vue.com/view/${blockName}/_payload.json`)
const text = await res.text()
const identity = (v) => v
const payload = parse(text, {
  ShallowReactive: identity,
  Reactive: identity,
  Ref: identity,
  ShallowRef: identity,
  EmptyRef: identity,
  EmptyShallowRef: identity,
})

const dataRoot = payload.data
const wrapper = Object.values(dataRoot).find((v) => v && typeof v === 'object' && 'item' in v)
const item = wrapper.item
console.log('name:', item.name)
console.log('description:', item.description)
console.log('registryDependencies:', item.registryDependencies)
console.log('categories:', item.categories)
console.log()

for (const file of item.files) {
  console.log(`--- ${file.path} (target: ${file.target || '(default)'})`)
}

for (const file of item.files) {
  const full = join(projectRoot, 'block-output', file.path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, file.content, 'utf-8')
}
console.log('\nWrote files to frontend/block-output/')
