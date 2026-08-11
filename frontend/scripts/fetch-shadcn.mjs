import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const style = 'default'
const root = join(import.meta.dirname, '..', 'src', 'components')
const seen = new Set()
const npmDeps = new Set()

const queue = process.argv.slice(2)

async function fetchComponent(name) {
  if (seen.has(name)) return
  seen.add(name)

  const res = await fetch(`https://shadcn-vue.com/r/styles/${style}/${name}.json`)
  if (!res.ok) {
    console.error(`FAILED ${name}: ${res.status}`)
    return
  }
  const data = await res.json()

  for (const dep of data.dependencies ?? []) npmDeps.add(dep)
  for (const dep of data.registryDependencies ?? []) queue.push(dep)

  for (const file of data.files ?? []) {
    const target = join(root, file.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.content, 'utf-8')
    console.log(`wrote ${file.path}`)
  }
}

while (queue.length) {
  const name = queue.shift()
  await fetchComponent(name)
}

console.log('\nnpm dependencies needed:')
console.log([...npmDeps].join(' '))
