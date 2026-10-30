// Display-only parser. The backend remains responsible for validating the import.
export function csvPreview(text) {
  const records = []
  let row = [], field = '', quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++ }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"' && !field) quoted = true
    else if (char === ',' || char === '\r' || char === '\n') {
      row.push(field); field = ''
      if (char !== ',') {
        if (row.some((cell) => cell.trim())) records.push(row)
        row = []
        if (char === '\r' && source[index + 1] === '\n') index++
      }
    } else field += char
  }
  if (quoted) throw new Error('Missing closing CSV quote')
  row.push(field)
  if (row.some((cell) => cell.trim())) records.push(row)
  const [headers = [], ...rows] = records
  return { headers, rows: rows.slice(0, 100), total: rows.length }
}
