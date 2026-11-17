export function normalizeGameName(name?: string): string {
  return name?.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') || ''
}

/** Aliases point to groups so later merges cannot leave stale duplicate objects behind. */
export function deduplicateByAliases<T>(
  records: readonly T[],
  aliasesOf: (record: T) => string[],
  merge: (existing: T, incoming: T) => T,
): T[] {
  type Group = { value: T; parent?: Group }
  const groups: Group[] = []
  const aliases = new Map<string, Group>()
  const rootOf = (group: Group): Group => {
    if (group.parent) group.parent = rootOf(group.parent)
    return group.parent || group
  }

  for (const record of records) {
    const keys = aliasesOf(record).filter(Boolean)
    const matches = [...new Set(keys.map(key => aliases.get(key)).filter((group): group is Group => !!group).map(rootOf))]
    let group = matches[0]
    if (!group) {
      group = { value: record }
      groups.push(group)
    } else {
      for (const other of matches.slice(1)) {
        group.value = merge(group.value, other.value)
        other.parent = group
      }
      group.value = merge(group.value, record)
    }
    for (const key of keys) aliases.set(key, group)
  }
  return groups.filter(group => !group.parent).map(group => group.value)
}
