export const STORAGE_KEY = 'cowrywise-budget-presentation-v1'
export const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'CAD', 'GHS', 'KES', 'ZAR']
export const PERIODS = ['2026-Q3', '2026-Q4', '2027-Q1', '2027-Q2']

export function freshDemo() {
  return {
    version: 1,
    teams: [
      { id: 1, name: 'Engineering', color: '#2764e7', initials: 'EN' },
      { id: 2, name: 'Finance', color: '#8b5cf6', initials: 'FI' },
      { id: 3, name: 'Marketing', color: '#e78a32', initials: 'MA' },
      { id: 4, name: 'Customer Experience', color: '#0d9876', initials: 'CX' },
      { id: 5, name: 'Operations', color: '#64748b', initials: 'OP' },
    ],
    users: [
      { id: 1, name: 'Finance Admin', email: 'demo.finance@cowrywise.com', role: 'admin', team_id: 2 },
      { id: 2, name: 'Engineering Teammate', email: 'demo.engineering@cowrywise.com', role: 'employee', team_id: 1 },
      { id: 3, name: 'Marketing Teammate', email: 'demo.marketing@cowrywise.com', role: 'employee', team_id: 3 },
      { id: 4, name: 'Customer Experience Teammate', email: 'demo.cx@cowrywise.com', role: 'employee', team_id: 4 },
      { id: 5, name: 'New Teammate', email: 'demo.new@cowrywise.com', role: 'employee', team_id: null },
    ],
    budgets: [
      { id: 1, team_id: 1, period: '2026-Q4' },
      { id: 2, team_id: 2, period: '2026-Q4' },
      { id: 3, team_id: 3, period: '2026-Q4' },
      { id: 4, team_id: 4, period: '2026-Q4' },
      { id: 5, team_id: 1, period: '2026-Q3' },
      { id: 6, team_id: 2, period: '2026-Q3' },
    ],
    items: [
      { id: 1, budget_id: 1, code: 'CW10001', description: 'Cloud infrastructure', purpose: 'Production hosting and database services', amount: '4500000.00', currency: 'NGN', source: 'manual' },
      { id: 2, budget_id: 1, code: 'CW10002', description: 'Developer tools', purpose: 'Annual engineering software licences', amount: '3500.00', currency: 'USD', source: 'manual' },
      { id: 3, budget_id: 1, code: 'CW10003', description: 'Team development', purpose: 'Technical training and certifications', amount: '1800000.00', currency: 'NGN', source: 'manual' },
      { id: 4, budget_id: 1, code: 'CW10004', description: 'Monitoring & observability', purpose: 'Application reliability and incident response', amount: '1200.00', currency: 'USD', source: 'manual' },
      { id: 5, budget_id: 2, code: 'CW20001', description: 'Audit preparation', purpose: 'External reporting and compliance support', amount: '2400000.00', currency: 'NGN', source: 'manual' },
      { id: 6, budget_id: 2, code: 'CW20002', description: 'Finance software', purpose: 'Financial planning and reconciliation tools', amount: '900.00', currency: 'USD', source: 'manual' },
      { id: 7, budget_id: 3, code: 'CW30001', description: 'Brand campaigns', purpose: 'Quarterly customer education campaigns', amount: '3200000.00', currency: 'NGN', source: 'manual' },
      { id: 8, budget_id: 3, code: 'CW30002', description: 'Community events', purpose: 'Financial literacy workshops and meetups', amount: '1500000.00', currency: 'NGN', source: 'manual' },
      { id: 9, budget_id: 3, code: 'CW30003', description: 'Creative software', purpose: 'Design and content production tools', amount: '600.00', currency: 'USD', source: 'manual' },
      { id: 10, budget_id: 4, code: 'CW40001', description: 'Support enablement', purpose: 'Customer support training and knowledge base', amount: '1200000.00', currency: 'NGN', source: 'manual' },
      { id: 11, budget_id: 4, code: 'CW40002', description: 'Helpdesk platform', purpose: 'Customer conversation and ticket management', amount: '1400.00', currency: 'USD', source: 'manual' },
      { id: 12, budget_id: 5, code: 'CW10001', description: 'Cloud infrastructure', purpose: 'Previous quarter hosting allocation', amount: '3800000.00', currency: 'NGN', source: 'manual' },
      { id: 13, budget_id: 6, code: 'CW20001', description: 'Audit preparation', purpose: 'Previous quarter audit allocation', amount: '1800000.00', currency: 'NGN', source: 'manual' },
    ],
  }
}

export function cents(value) {
  const text = String(value).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Use an amount with up to 2 decimal places.')
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function decimal(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}

export function total(items, currency) {
  return decimal(items.filter((item) => item.currency === currency).reduce((sum, item) => sum + cents(item.amount), 0n))
}

export function money(value, currency = 'NGN') {
  const amount = cents(value)
  const parts = new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 2 }).formatToParts(amount / 100n)
  return parts.map((part) => part.type === 'fraction' ? String(amount % 100n).padStart(2, '0') : part.value).join('')
}

export function validateItem(input, existing, ignoredId = null) {
  const item = {
    ...input,
    code: String(input.code || '').trim(),
    description: String(input.description || '').trim(),
    purpose: String(input.purpose || '').trim(),
    currency: String(input.currency || '').trim().toUpperCase(),
  }
  if (!item.code || !item.description || !item.purpose) throw new Error('Code, description, and purpose are required.')
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(String(item.amount).trim())) throw new Error('Use a positive amount with up to 12 digits and 2 decimal places.')
  const amount = cents(item.amount)
  if (amount <= 0n) throw new Error('Amount must be greater than zero.')
  item.amount = decimal(amount)
  if (!CURRENCIES.includes(item.currency)) throw new Error('Choose a supported currency from the list.')
  if (existing.some((row) => row.id !== ignoredId && row.budget_id === item.budget_id && row.code.toLowerCase() === item.code.toLowerCase())) {
    throw new Error(`Code ${item.code} already exists in this budget.`)
  }
  return item
}

// Supports quoted commas, escaped quotes, CRLF, BOM, and quoted multiline fields.
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false, closed = false
  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index++ }
      else if (char === '"') { quoted = false; closed = true }
      else field += char
    } else if (char === '"') {
      if (field || closed) throw new Error('Unexpected quote in CSV. Quote the entire field.')
      quoted = true
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false
      if (char !== ',') {
        if (row.some((cell) => cell.trim())) rows.push(row)
        row = []
        if (char === '\r' && source[index + 1] === '\n') index++
      }
    } else {
      if (closed && char.trim()) throw new Error('Unexpected text after a closing quote.')
      if (!closed) field += char
    }
  }
  if (quoted) throw new Error('A quoted CSV field is missing its closing quote.')
  row.push(field)
  if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

export function previewImport(text, budgetId, existing) {
  const [headers = [], ...rows] = parseCsv(text)
  const required = ['code', 'amount', 'currency', 'description', 'purpose']
  const keys = headers.map((header) => header.trim().toLowerCase())
  if (required.some((key) => !keys.includes(key)) || new Set(keys).size !== keys.length) {
    throw new Error('CSV needs unique headers: code,amount,currency,description,purpose.')
  }
  if (!rows.length) throw new Error('This CSV has no line items. Add a row and try again.')
  const accepted = []
  return rows.map((cells, index) => {
    const record = Object.fromEntries(keys.map((key, position) => [key, cells[position] || '']))
    try {
      if (cells.length !== keys.length) throw new Error('Column count does not match the header.')
      const item = validateItem({ ...record, budget_id: budgetId, source: 'import' }, [...existing, ...accepted])
      accepted.push(item)
      return { row: index + 2, item, error: null }
    } catch (error) {
      return { row: index + 2, item: record, error: error.message }
    }
  })
}

export function loadDemo() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (value?.version !== 1 || !['teams', 'users', 'budgets', 'items'].every((key) => Array.isArray(value[key]))) return freshDemo()
    if (!value.users.some((user) => user.id === 1 && user.role === 'admin')) return freshDemo()
    value.items.forEach((item) => validateItem(item, [], item.id))
    return value
  } catch { return freshDemo() }
}

export function nextId(rows) {
  return Math.max(0, ...rows.map((row) => row.id)) + 1
}

export const TEMPLATE = 'code,amount,currency,description,purpose\n'
export const SAMPLE_CSV = `${TEMPLATE}CW50001,850000.00,NGN,Workspace equipment,Equipment for new team members\nCW50002,450.00,USD,Planning software,Quarterly planning tools\n`
export const INVALID_CSV = `${TEMPLATE}CW50001,-50,NGN,Workspace equipment,Equipment for new team members\nCW50002,450,NOTREAL,Planning software,Quarterly planning tools\n`
