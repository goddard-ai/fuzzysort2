import { searchBy, searchFields } from 'fuzzysort2'

const files = [
  { id: 1, name: 'CheatManager.h', path: 'src/ui/CheatManager.h' },
  { id: 2, name: 'Manifest.cpp', path: 'src/app/Manifest.cpp' },
  { id: 3, name: 'Cheat', path: 'src/ui/Manager.h' },
]

const byName = searchBy('man', files, file => file.name)
const byFields = searchFields('c man', files, [
  { key: 'name', extract: file => file.name },
  { key: 'path', extract: file => file.path },
])

console.log(byName.items.map(item => item.value.id))
console.log(byFields.items.map(item => item.value.id))
