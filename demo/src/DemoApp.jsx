import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BarChart3, Building2, Check,
  CheckCircle2, ChevronRight, CircleHelp, FileSpreadsheet, FolderOpen, LayoutDashboard,
  LockKeyhole, Pencil, Play, Plus, RotateCcw, Search, ShieldCheck, Trash2,
  Upload, Users, Wallet, X,
} from 'lucide-react'
import {
  CURRENCIES, INVALID_CSV, PERIODS, SAMPLE_CSV, STORAGE_KEY, TEMPLATE,
  cents, freshDemo, loadDemo, money, nextId, previewImport, total, validateItem,
} from './model.js'
import './demo.css'

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'budget', label: 'Budget workspace', icon: Wallet },
  { id: 'import', label: 'Import line items', icon: Upload },
  { id: 'people', label: 'Teams & people', icon: Users },
]
const titles = { overview: 'A clear view of every team.', budget: 'Good plans start with the details.', import: 'Your spreadsheet. A better workflow.', people: 'The right people. The right access.' }
const walkthrough = [
  ['One place for team budgets', 'Start on Overview. Explain that these are planned allocations, not actual expenses. NGN and USD stay separate, and teams without budgets are highlighted.', 'overview'],
  ['From a number to a clear purpose', 'Open Budget workspace. Select Engineering, search for cloud, then clear search. Add a line item and edit its amount to show the running totals.', 'budget'],
  ['A safer way to import spreadsheets', 'Open Import line items. Try “Load error example”, then “Load sample CSV”. Explain the row errors and all-or-nothing import before confirming.', 'import'],
  ['Access follows the team', 'Open Teams & people. Assign New Teammate to Operations. Use “Present as” to show the employee view. Employees have a read-only view of their assigned team.', 'people'],
  ['What this prototype proves', 'This is a local, sample-data prototype. The next milestone is connecting these workflows to the FastAPI backend, enforcing company Google SSO and permissions, and completing database-backed tests.', 'overview'],
]

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = name
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className={`mvp-dialog ${wide ? 'mvp-dialog-wide' : ''}`}
    aria-labelledby="mvp-dialog-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="mvp-dialog-heading"><h2 id="mvp-dialog-title">{title}</h2>
      <button type="button" className="mvp-icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
    </div>
    {children}
  </dialog>
}

function DemoImport({ budgets, teams, items, onImport, onNewBudget }) {
  const [selected, setSelected] = useState(String(budgets[0]?.id || ''))
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const readVersion = useRef(0)
  useEffect(() => () => { readVersion.current++ }, [])
  const budgetId = Number(selected)

  function validate(content, label) {
    setText(content); setFilename(label); setError(''); setReport(null)
    try {
      if (!budgets.some((budget) => budget.id === budgetId)) throw new Error('Select a budget first.')
      setReport(previewImport(content, budgetId, items))
    } catch (err) { setError(err.message) }
  }

  async function readFile(event) {
    const file = event.target.files?.[0]
    const version = ++readVersion.current
    if (!file) return
    setError(''); setReport(null)
    if (file.size > 2 * 1024 * 1024) { setError('Choose a CSV smaller than 2 MB for this demo.'); return }
    setReading(true)
    try {
      const content = await file.text()
      if (version === readVersion.current) validate(content, file.name)
    } catch { if (version === readVersion.current) setError('This file could not be read. Please try another CSV.') }
    finally { if (version === readVersion.current) setReading(false) }
    event.target.value = ''
  }

  const failures = report?.filter((row) => row.error).length || 0
  return <>
    <div className="mvp-panel mvp-import-intro">
      <div className="mvp-section-heading"><div><h2>Bring your existing budget</h2><p>Preview every row before adding it to a team’s budget.</p></div>
        <button className="mvp-button" onClick={() => download('budget-template.csv', TEMPLATE)}><ArrowDownToLine size={16} /> CSV template</button>
      </div>
      {!budgets.length ? <div className="mvp-empty"><FolderOpen /><h3>Create a budget first</h3><p>A team needs a budget for this period before you can import line items.</p><button className="mvp-button mvp-primary" onClick={onNewBudget}>Create budget</button></div> : <>
        <label className="mvp-field mvp-import-target">Import into
          <select value={selected} disabled={reading} onChange={(event) => { setSelected(event.target.value); setReport(null); setError('') }}>
            {budgets.map((budget) => <option key={budget.id} value={budget.id}>{teams.find((team) => team.id === budget.team_id)?.name} · {budget.period}</option>)}
          </select>
        </label>
        <div className="mvp-dropzone"><span className="mvp-upload-icon"><FileSpreadsheet size={30} /></span>
          <h3>{reading ? 'Reading your CSV…' : 'A spreadsheet is a great starting point.'}</h3>
          <p>Upload a CSV with code, amount, currency, description, and purpose.</p>
          <label className="mvp-button mvp-primary mvp-file-label"><Upload size={16} /> Choose CSV file
            <input type="file" accept=".csv,text/csv" disabled={reading} onChange={readFile} />
          </label><small>CSV files up to 2 MB · preview before saving</small>
        </div>
        <div className="mvp-example-actions"><span>Presenting without a file?</span>
          <button className="mvp-link" disabled={reading} onClick={() => validate(SAMPLE_CSV, 'Sample budget.csv')}>Load sample CSV</button>
          <button className="mvp-link" disabled={reading} onClick={() => validate(INVALID_CSV, 'Validation example.csv')}>Load error example</button>
        </div>
      </>}
    </div>
    {error && <p className="mvp-error" role="alert">{error}</p>}
    {report && <section className="mvp-panel">
      <div className="mvp-section-heading"><div><h2>Import preview <span className="mvp-count">{report.length} rows</span></h2><p>{filename} · {failures ? `${failures} row(s) need attention. Nothing has been saved.` : 'All rows validated. Ready to import.'}</p></div>
        <span className={`mvp-badge ${failures ? 'mvp-badge-amber' : 'mvp-badge-green'}`}>{failures ? 'Changes needed' : 'Ready to import'}</span>
      </div>
      <div className="mvp-table-scroll"><table><thead><tr><th>Row</th><th>Code</th><th>Description</th><th>Amount</th><th>Validation</th></tr></thead><tbody>
        {report.map((row) => <tr key={row.row}><td>{row.row}</td><td className="mvp-code">{row.item.code || '—'}</td><td>{row.item.description || '—'}</td><td>{row.item.currency} {row.item.amount}</td><td>{row.error ? <span className="mvp-row-error">{row.error}</span> : <span className="mvp-success"><Check size={15} /> Valid</span>}</td></tr>)}
      </tbody></table></div>
      <div className="mvp-import-footer"><p><ShieldCheck size={17} /> Every row saves together, or none of them do.</p>
        <button className="mvp-button mvp-primary" disabled={Boolean(failures)} onClick={() => {
          try { onImport(text, budgetId); setReport(null); setText(''); setFilename('') }
          catch (err) { setError(err.message) }
        }}>Import {report.length} line items <ArrowRight size={16} /></button>
      </div>
    </section>}
  </>
}

export default function DemoApp() {
  const [data, setData] = useState(loadDemo)
  const [tab, setTab] = useState('overview')
  const [period, setPeriod] = useState('2026-Q4')
  const [teamFilter, setTeamFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [actorId, setActorId] = useState(1)
  const [dialog, setDialog] = useState(null)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [storageIssue, setStorageIssue] = useState(false)
  const [guide, setGuide] = useState(null)
  const user = data.users.find((person) => person.id === actorId) || data.users[0]
  const isAdmin = user.role === 'admin'
  const page = isAdmin ? tab : 'budget'
  const awaiting = !isAdmin && user.team_id == null
  const teams = isAdmin ? data.teams : data.teams.filter((team) => team.id === user.team_id)
  const periodBudgets = data.budgets.filter((budget) => budget.period === period && teams.some((team) => team.id === budget.team_id))
  const visibleBudgets = periodBudgets.filter((budget) => !isAdmin || teamFilter === 'all' || String(budget.team_id) === teamFilter)
  const allItems = data.items.filter((item) => periodBudgets.some((budget) => budget.id === item.budget_id))
  const budgetItems = data.items.filter((item) => visibleBudgets.some((budget) => budget.id === item.budget_id))
  const filteredItems = budgetItems.filter((item) => `${item.code} ${item.description} ${item.purpose}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.code.localeCompare(b.code))
  const usedCurrencies = [...new Set(allItems.map((item) => item.currency))].sort((a, b) => a === 'NGN' ? -1 : b === 'NGN' ? 1 : a.localeCompare(b))

  function commit(next, message) {
    if (!isAdmin) return
    setData(next); setNotice(message)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageIssue(false) }
    catch { setStorageIssue(true) }
  }

  function open(kind, item = null) { setFormError(''); setDialog({ kind, item }) }
  function changePage(next) { setTab(next); setSearch(''); setNotice('') }
  function teamForBudget(id) { return data.teams.find((team) => team.id === data.budgets.find((budget) => budget.id === id)?.team_id) }

  function saveItem(event) {
    event.preventDefault()
    if (!isAdmin) return
    try {
      const input = Object.fromEntries(new FormData(event.currentTarget))
      input.budget_id = Number(input.budget_id)
      if (!periodBudgets.some((budget) => budget.id === input.budget_id)) throw new Error('Select a budget in the current period.')
      const item = validateItem(input, data.items, dialog.item?.id)
      const saved = { ...item, id: dialog.item?.id || nextId(data.items), source: dialog.item?.source || 'manual' }
      commit({ ...data, items: dialog.item ? data.items.map((row) => row.id === saved.id ? saved : row) : [...data.items, saved] }, dialog.item ? 'Line item updated. Budget totals are up to date.' : 'Line item added. Budget totals are up to date.')
      setDialog(null)
    } catch (err) { setFormError(err.message) }
  }

  function saveBudget(event) {
    event.preventDefault()
    if (!isAdmin) return
    const teamId = Number(new FormData(event.currentTarget).get('team_id'))
    if (!data.teams.some((team) => team.id === teamId)) { setFormError('Choose a team.'); return }
    if (periodBudgets.some((budget) => budget.team_id === teamId)) { setFormError('This team already has a budget for this period.'); return }
    commit({ ...data, budgets: [...data.budgets, { id: nextId(data.budgets), team_id: teamId, period }] }, 'Budget created. You can now add or import line items.')
    setTeamFilter(String(teamId)); setTab('budget'); setDialog(null)
  }

  function saveTeam(event) {
    event.preventDefault()
    if (!isAdmin) return
    const name = String(new FormData(event.currentTarget).get('name')).trim()
    if (!name) { setFormError('Enter a team name.'); return }
    if (data.teams.some((team) => team.id !== dialog.item?.id && team.name.toLowerCase() === name.toLowerCase())) { setFormError('A team with this name already exists.'); return }
    const team = { id: nextId(data.teams), color: '#2764e7', initials: name.slice(0, 2).toUpperCase(), ...dialog.item, name }
    commit({ ...data, teams: dialog.item ? data.teams.map((row) => row.id === team.id ? team : row) : [...data.teams, team] }, dialog.item ? 'Team renamed.' : 'Team created.')
    setDialog(null)
  }

  function importItems(text, budgetId) {
    if (!isAdmin) throw new Error('Only the demo admin can import line items.')
    if (!periodBudgets.some((budget) => budget.id === budgetId)) throw new Error('Select an existing budget for this period.')
    const report = previewImport(text, budgetId, data.items)
    if (report.some((row) => row.error)) throw new Error('The budget changed or some rows are invalid. Validate the file again before importing.')
    const start = nextId(data.items)
    commit({ ...data, items: [...data.items, ...report.map((row, index) => ({ ...row.item, id: start + index }))] }, `${report.length} line items imported. Nothing was written to the backend.`)
  }

  function confirmAction() {
    if (!isAdmin) return
    if (dialog.kind === 'delete-item') commit({ ...data, items: data.items.filter((item) => item.id !== dialog.item.id) }, 'Line item deleted. Totals updated.')
    if (dialog.kind === 'delete-team') {
      const budgetIds = data.budgets.filter((budget) => budget.team_id === dialog.item.id).map((budget) => budget.id)
      commit({ ...data, teams: data.teams.filter((team) => team.id !== dialog.item.id), users: data.users.map((person) => person.team_id === dialog.item.id ? { ...person, team_id: null } : person), budgets: data.budgets.filter((budget) => budget.team_id !== dialog.item.id), items: data.items.filter((item) => !budgetIds.includes(item.budget_id)) }, 'Team and its demo budgets deleted. Its employees are now awaiting access.')
      setTeamFilter('all')
    }
    if (dialog.kind === 'reset') { commit(freshDemo(), 'Sample data restored. Ready for another walkthrough.'); setPeriod('2026-Q4'); setTeamFilter('all'); setSearch(''); setTab('overview') }
    setDialog(null)
  }

  function exportItems() {
    const escape = (value) => `"${String(value).replaceAll('"', '""')}"`
    const rows = budgetItems.map((item) => [item.code, item.amount, item.currency, item.description, item.purpose].map(escape).join(','))
    download(`sample-budget-${period}.csv`, `code,amount,currency,description,purpose\n${rows.join('\n')}\n`)
  }

  return <div className="mvp-app">
    <aside className="mvp-sidebar">
      <a href="/" className="mvp-brand"><span className="mvp-brand-mark"><BarChart3 size={24} /></span><span>cowrywise<span className="mvp-brand-sub">BUDGET WORKSPACE</span></span></a>
      <div className="mvp-workspace"><span className="mvp-workspace-avatar">CW</span><div><strong>Department workspace</strong><small>cowrywise.com</small></div><ShieldCheck size={16} /></div>
      <span className="mvp-nav-label">WORKSPACE</span>
      <nav aria-label="Workspace navigation">
        {(isAdmin ? navigation : [{ id: 'budget', label: 'My team’s budget', icon: Wallet }]).map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => changePage(id)}><Icon size={19} />{label}{page === id && <ChevronRight size={15} />}</button>)}
      </nav>
      <div className="mvp-sidebar-bottom">
        <a href={import.meta.env.VITE_APP_URL || 'http://localhost:5173'} className="mvp-back-link"><ArrowUpRight size={16} /> Open connected application</a>
      </div>
    </aside>

    <div className="mvp-main">
      <header className="mvp-topbar"><div className="mvp-breadcrumb">Workspace <ChevronRight size={14} /><strong>{awaiting ? 'Awaiting access' : navigation.find((item) => item.id === page)?.label}</strong></div>
        <div className="mvp-topbar-right"><span className="mvp-demo-pill"><span /> LIVE PROTOTYPE · SAMPLE DATA</span><button className="mvp-icon-button" aria-label="Open presentation guide" onClick={() => setGuide(0)}><CircleHelp size={20} /></button><span className="mvp-profile">{isAdmin ? 'FA' : 'TM'}</span></div>
      </header>
      <div className="mvp-demo-toolbar"><span><ShieldCheck size={16} /> Demo mode · all people and amounts are fictional. Google SSO and server permissions are not exercised here.</span>
        <div><label htmlFor="demo-persona">Present as</label><select id="demo-persona" value={user.id} onChange={(event) => { setActorId(Number(event.target.value)); setDialog(null); setGuide(null); setNotice(''); setSearch(''); setTeamFilter('all') }}>
          {data.users.map((person) => <option key={person.id} value={person.id}>{person.role === 'admin' ? 'Admin' : 'Employee'} · {person.name}</option>)}
        </select></div>
      </div>

      <main className="mvp-content">
        {awaiting ? <section className="mvp-awaiting mvp-panel"><span className="mvp-awaiting-icon"><LockKeyhole size={34} /></span><span className="mvp-eyebrow">YOUR ACCOUNT IS READY</span><h1>A team is all that’s missing.</h1><p>Ask finance to assign you to a team. Once mapped, you’ll be able to view its budget and line items here.</p><span className="mvp-badge mvp-badge-amber">Awaiting team assignment</span><small>Demo tip: switch to Admin, open Teams & people, and assign this teammate.</small></section> : <>
          <div className="mvp-page-heading"><div><span className="mvp-eyebrow">{isAdmin ? 'FINANCE / PLANNING' : 'YOUR TEAM / READ-ONLY'}</span><h1>{titles[page]}</h1><p>{page === 'overview' ? 'One workspace for the numbers, the context, and the people behind them.' : !isAdmin ? 'Your team’s planned allocations. Contact finance to request a change.' : 'Build a budget everyone can understand, one clear line item at a time.'}</p></div>
            <label className="mvp-period"><span>Planning period</span><select value={period} onChange={(event) => { setPeriod(event.target.value); setDialog(null); setNotice(''); setSearch('') }}>{PERIODS.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
          {notice && <div className="mvp-notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
          {storageIssue && <p className="mvp-error" role="alert">Browser storage is unavailable. Changes work for this session but will be lost on refresh.</p>}

          {(page === 'overview' || page === 'budget') && <section className="mvp-stats" aria-label="Planned budget totals">
            {['NGN', 'USD', ...usedCurrencies.filter((currency) => !['NGN', 'USD'].includes(currency))].map((currency) => <article className="mvp-stat" key={currency}><div className="mvp-stat-top"><span>{currency} planned budget</span><span className="mvp-currency-icon">{currency === 'NGN' ? '₦' : currency === 'USD' ? '$' : currency}</span></div><strong>{money(total(page === 'budget' ? budgetItems : allItems, currency), currency)}</strong><small>Planned allocation · {period}</small></article>)}
            <article className="mvp-stat"><div className="mvp-stat-top"><span>{page === 'overview' ? 'Teams with a budget' : 'Budget line items'}</span><Building2 size={21} /></div><strong>{page === 'overview' ? <>{periodBudgets.length}<span className="mvp-stat-denominator"> / {teams.length}</span></> : budgetItems.length}</strong><small>{page === 'overview' ? `${teams.length - periodBudgets.length} team(s) still to plan` : 'Includes items outside your search'}</small></article>
          </section>}

          {page === 'overview' && <>
            <section className="mvp-panel"><div className="mvp-section-heading"><div><h2>Every team, in focus <span className="mvp-count">{teams.length} teams</span></h2><p>Budget totals stay separate for every currency.</p></div><button className="mvp-button mvp-primary" onClick={() => open('budget')}><Plus size={17} /> New budget</button></div>
              <div className="mvp-team-grid">{teams.map((team) => {
                const budget = periodBudgets.find((row) => row.team_id === team.id)
                const items = allItems.filter((item) => item.budget_id === budget?.id)
                const currencies = [...new Set(items.map((item) => item.currency))]
                const share = Number(cents(total(items, 'NGN'))) / Math.max(1, Number(cents(total(allItems, 'NGN')))) * 100
                return <article className={`mvp-team-card ${!budget ? 'mvp-team-missing' : ''}`} key={team.id}><div className="mvp-team-top"><span className="mvp-team-icon" style={{ '--team-color': team.color }}>{team.initials}</span><span className={`mvp-badge ${budget ? 'mvp-badge-green' : 'mvp-badge-amber'}`}>{budget ? 'Budget created' : 'Needs a budget'}</span></div><h3>{team.name}</h3>
                  <div className="mvp-team-amounts">{currencies.length ? currencies.map((currency) => <strong key={currency}>{money(total(items, currency), currency)} <small>{currency}</small></strong>) : <p>{budget ? 'No line items yet' : 'A fresh plan starts here.'}</p>}</div>
                  <div className="mvp-allocation-bar" aria-hidden="true"><span style={{ width: `${share}%`, background: team.color }} /></div><small>{budget ? `${items.length} line items · ${share.toFixed(0)}% of NGN allocation` : `No allocation for ${period}`}</small>
                  <button className="mvp-team-link" onClick={() => { if (!budget) open('budget', team); else { setTeamFilter(String(team.id)); changePage('budget') } }}>{budget ? 'Open budget' : 'Create budget'}<ArrowRight size={16} /></button>
                </article>
              })}</div>
            </section>
            <div className="mvp-principle"><ShieldCheck size={24} /><div><strong>Different currencies. Clearer decisions.</strong><p>NGN and USD are never added together. These figures show planned budgets; actual spend tracking is a future milestone.</p></div><span className="mvp-badge">V1 · Budget planning</span></div>
          </>}

          {page === 'budget' && <section className="mvp-panel"><div className="mvp-section-heading"><div><h2>{isAdmin ? 'Budget line items' : `${teams[0]?.name || 'Your team'} budget`} <span className="mvp-count">{filteredItems.length}</span></h2><p>{isAdmin ? 'A code, an amount, and a reason for every allocation.' : 'Read-only access to your team’s plan.'}</p></div><div className="mvp-actions"><button className="mvp-button" disabled={!budgetItems.length} onClick={exportItems}><ArrowDownToLine size={16} /> Export CSV</button>{isAdmin && <><button className="mvp-button" onClick={() => open('budget')}><Plus size={16} /> New budget</button><button className="mvp-button mvp-primary" disabled={!periodBudgets.length} onClick={() => open('item')}><Plus size={16} /> Add line item</button></>}</div></div>
            <div className="mvp-table-toolbar"><label className="mvp-search"><Search size={18} /><input aria-label="Search budget line items" placeholder="Search code, description, or purpose…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>{isAdmin && <select aria-label="Filter by team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}><option value="all">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>}<span>{isAdmin ? 'Admin editing enabled' : 'Read-only view'}</span></div>
            <div className="mvp-table-scroll"><table><thead><tr><th>Code</th>{isAdmin && <th>Team</th>}<th>Description / purpose</th><th className="mvp-align-right">Planned amount</th><th>Source</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>
              {filteredItems.map((item) => <tr key={item.id}><td className="mvp-code">{item.code}</td>{isAdmin && <td><span className="mvp-table-team">{teamForBudget(item.budget_id)?.name}</span></td>}<td><strong className="mvp-item-description">{item.description}</strong><small className="mvp-item-purpose">{item.purpose}</small></td><td className="mvp-align-right mvp-table-money">{money(item.amount, item.currency)}<small>{item.currency}</small></td><td><span className="mvp-badge">{item.source === 'import' ? 'CSV import' : 'Manual'}</span></td>{isAdmin && <td><div className="mvp-row-actions"><button className="mvp-icon-button" aria-label={`Edit ${item.code}`} onClick={() => open('item', item)}><Pencil size={16} /></button><button className="mvp-icon-button mvp-danger-text" aria-label={`Delete ${item.code}`} onClick={() => open('delete-item', item)}><Trash2 size={16} /></button></div></td>}</tr>)}
              {!filteredItems.length && <tr><td colSpan={isAdmin ? 6 : 4}><div className="mvp-empty"><FolderOpen size={28} /><h3>{search ? 'No matching line items' : 'A blank page for a thoughtful plan.'}</h3><p>{search ? 'Try a different code or description.' : isAdmin ? 'Create a budget, then add a line item or import a CSV.' : 'Finance has not added a budget for your team in this period yet.'}</p></div></td></tr>}
            </tbody>{budgetItems.length > 0 && <tfoot>{[...new Set(budgetItems.map((item) => item.currency))].sort().map((currency) => <tr key={currency}><th colSpan={isAdmin ? 3 : 2}>Full budget subtotal · {currency}{search && ' (before search)'}</th><td className="mvp-align-right">{money(total(budgetItems, currency), currency)}</td><td colSpan={isAdmin ? 2 : 1} /></tr>)}</tfoot>}</table></div>
          </section>}

          {page === 'import' && isAdmin && <DemoImport key={period} budgets={periodBudgets} teams={teams} items={data.items} onImport={importItems} onNewBudget={() => open('budget')} />}

          {page === 'people' && isAdmin && <>
            <section className="mvp-panel"><div className="mvp-section-heading"><div><h2>Teams <span className="mvp-count">{data.teams.length}</span></h2><p>Organise budgets around the teams that own them.</p></div><button className="mvp-button mvp-primary" onClick={() => open('team')}><Plus size={16} /> Add team</button></div><div className="mvp-team-list">{data.teams.map((team) => <div key={team.id}><span className="mvp-team-icon" style={{ '--team-color': team.color }}>{team.initials}</span><strong>{team.name}<small>{data.users.filter((person) => person.team_id === team.id).length} demo members</small></strong><button className="mvp-icon-button" aria-label={`Rename ${team.name}`} onClick={() => open('team', team)}><Pencil size={16} /></button><button className="mvp-icon-button mvp-danger-text" aria-label={`Delete team ${team.name}`} onClick={() => open('delete-team', team)}><Trash2 size={16} /></button></div>)}</div></section>
            <section className="mvp-panel mvp-people-panel"><div className="mvp-section-heading"><div><h2>People & access</h2><p>Each employee belongs to one team. Unmapped teammates appear first.</p></div><span className="mvp-badge mvp-badge-blue">Company domain · cowrywise.com</span></div><div className="mvp-table-scroll"><table><thead><tr><th>Teammate</th><th>Role</th><th>Team</th><th>Access</th></tr></thead><tbody>
              {[...data.users].sort((a, b) => Number(b.team_id == null) - Number(a.team_id == null)).map((person) => <tr key={person.id}><td><strong className="mvp-item-description">{person.name}</strong><small className="mvp-item-purpose">{person.email}</small></td><td><span className={`mvp-badge ${person.role === 'admin' ? 'mvp-badge-blue' : ''}`}>{person.role === 'admin' ? 'Admin' : 'Employee'}</span></td><td><select aria-label={`Team for ${person.name}`} value={person.team_id || ''} onChange={(event) => { const teamId = Number(event.target.value) || null; commit({ ...data, users: data.users.map((row) => row.id === person.id ? { ...row, team_id: teamId } : row) }, `${person.name}’s team assignment updated.`) }}><option value="">Not assigned</option>{data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></td><td><span className={`mvp-badge ${person.role === 'admin' || person.team_id ? 'mvp-badge-green' : 'mvp-badge-amber'}`}>{person.role === 'admin' ? 'All teams · edit' : person.team_id ? 'Own team · read only' : 'Awaiting access'}</span></td></tr>)}
            </tbody></table></div></section>
          </>}
        </>}
        <footer className="mvp-footer"><span><span className="mvp-status-dot" /> {storageIssue ? 'Session only' : 'Changes save in this browser'} · demo data only</span><div><button className="mvp-link" onClick={() => setGuide(0)}><Play size={14} /> Presentation guide</button>{isAdmin && <button className="mvp-link" onClick={() => open('reset')}><RotateCcw size={14} /> Reset sample data</button>}</div></footer>
      </main>
    </div>

    {dialog && isAdmin && <Dialog title={dialog.kind === 'item' ? dialog.item ? 'Edit line item' : 'Add a budget line item' : dialog.kind === 'budget' ? 'Start a team budget' : dialog.kind === 'team' ? dialog.item ? 'Rename team' : 'Create a team' : dialog.kind === 'reset' ? 'Reset the presentation?' : dialog.kind === 'delete-team' ? `Delete ${dialog.item.name}?` : `Delete ${dialog.item.code}?`} onClose={() => setDialog(null)}>
      {['item', 'budget', 'team'].includes(dialog.kind) ? <form onSubmit={dialog.kind === 'item' ? saveItem : dialog.kind === 'budget' ? saveBudget : saveTeam}>
        <p className="mvp-form-intro">{dialog.kind === 'item' ? 'Give every planned allocation a clear code and purpose.' : dialog.kind === 'budget' ? `One budget per team for ${period}. Add line items after creating it.` : 'Keep team names clear and recognisable.'}</p>
        {dialog.kind === 'item' && <div className="mvp-form-grid"><label className="mvp-field mvp-full">Budget<select name="budget_id" required defaultValue={dialog.item?.budget_id || visibleBudgets[0]?.id || periodBudgets[0]?.id}>{periodBudgets.map((budget) => <option key={budget.id} value={budget.id}>{data.teams.find((team) => team.id === budget.team_id)?.name} · {period}</option>)}</select></label><label className="mvp-field mvp-full">Code<input name="code" required maxLength={40} placeholder="e.g. CW10005" defaultValue={dialog.item?.code || ''} /></label><label className="mvp-field mvp-full">Description<input name="description" required maxLength={160} placeholder="What are we budgeting for?" defaultValue={dialog.item?.description || ''} /></label><label className="mvp-field mvp-full">Purpose<textarea name="purpose" required maxLength={500} placeholder="Why does the team need this allocation?" defaultValue={dialog.item?.purpose || ''} /></label><label className="mvp-field">Amount<input name="amount" type="number" required step="0.01" min="0.01" max="999999999999.99" placeholder="0.00" defaultValue={dialog.item?.amount || ''} /></label><label className="mvp-field">Currency<select name="currency" defaultValue={dialog.item?.currency || 'NGN'}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label></div>}
        {dialog.kind === 'budget' && <label className="mvp-field">Team<select name="team_id" required defaultValue={dialog.item?.id || ''}><option value="">Choose a team</option>{data.teams.map((team) => <option key={team.id} value={team.id} disabled={periodBudgets.some((budget) => budget.team_id === team.id)}>{team.name}{periodBudgets.some((budget) => budget.team_id === team.id) ? ' · budget exists' : ''}</option>)}</select></label>}
        {dialog.kind === 'team' && <label className="mvp-field">Team name<input name="name" required maxLength={80} defaultValue={dialog.item?.name || ''} placeholder="e.g. Product" /></label>}
        {formError && <p className="mvp-error" role="alert">{formError}</p>}
        <div className="mvp-dialog-actions"><button type="button" className="mvp-button" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="mvp-button mvp-primary">{dialog.kind === 'budget' ? 'Create budget' : 'Save changes'}<Check size={16} /></button></div>
      </form> : <><p className="mvp-form-intro">{dialog.kind === 'reset' ? 'This restores the original fictional teams, budgets, people, and line items. Your real database and login are not affected.' : dialog.kind === 'delete-team' ? 'This removes the team and all its demo budgets and line items. Its employees will return to awaiting access.' : 'This removes the line item from this demo budget and recalculates its totals.'}</p><div className="mvp-dialog-actions"><button className="mvp-button" onClick={() => setDialog(null)}>Cancel</button><button className="mvp-button mvp-danger" onClick={confirmAction}>{dialog.kind === 'reset' ? 'Restore sample data' : 'Confirm delete'}</button></div></>}
    </Dialog>}
    {guide !== null && <Dialog title="Your five-minute walkthrough" wide onClose={() => setGuide(null)}><div className="mvp-guide"><span className="mvp-eyebrow">STEP {guide + 1} OF {walkthrough.length}</span><h3>{walkthrough[guide][0]}</h3><p>{walkthrough[guide][1]}</p><div className="mvp-guide-dots">{walkthrough.map((step, index) => <button key={step[0]} aria-label={`Go to step ${index + 1}`} aria-current={guide === index ? 'step' : undefined} className={guide === index ? 'active' : ''} onClick={() => setGuide(index)} />)}</div></div><div className="mvp-dialog-actions"><button className="mvp-button" onClick={() => { setActorId(1); setTab(walkthrough[guide][2]); setGuide(null) }}>Show this screen</button><button className="mvp-button mvp-primary" onClick={() => guide === walkthrough.length - 1 ? setGuide(null) : setGuide(guide + 1)}>{guide === walkthrough.length - 1 ? 'Ready to present' : 'Next talking point'}<ArrowRight size={16} /></button></div></Dialog>}
  </div>
}
