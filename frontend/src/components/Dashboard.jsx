import { useEffect, useRef, useState } from 'react'
import { Building, DollarSign, Search, Plus, Trash2, Pencil } from 'lucide-react'
import { createBudget, createLineItem, deleteBudget, deleteLineItem, updateLineItem } from '../api.js'
import { lineItemPayload, loadDashboardData } from '../dashboardData.js'
import { formatMoney, moneyToCents } from '../money.js'
import ConfirmationDialog from './ConfirmationDialog.jsx'
import './Dashboard.css'

const emptyLineItem = {
  budget_id: '', code: '', description: '', purpose: '', amount: '', currency: 'NGN',
}
const periods = [2025, 2026, 2027].flatMap((year) =>
  [1, 2, 3, 4].map((quarter) => `${year}-Q${quarter}`),
)

function errorMessage(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('; ')
  return 'Unable to complete the request. Please check your connection and try again.'
}

export default function Dashboard({ user, initialPeriod = '2026-Q4', initialTeamId = null, onBusyChange = () => {} }) {
  const isAdmin = user.role === 'admin'
  const teamScope = isAdmin ? null : String(user.team_id)
  const [period, setPeriod] = useState(initialPeriod)
  const [selectedTeam, setSelectedTeam] = useState(isAdmin && initialTeamId != null ? String(initialTeamId) : teamScope)
  const [search, setSearch] = useState('')
  const [teams, setTeams] = useState([])
  const [currencies, setCurrencies] = useState(['NGN', 'USD'])
  const [summaries, setSummaries] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [activeCount, setActiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetTeam, setBudgetTeam] = useState('')
  const [budgetError, setBudgetError] = useState('')
  const [initialItems, setInitialItems] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const rowId = useRef(0)
  const [draft, setDraft] = useState(emptyLineItem)
  const [formError, setFormError] = useState('')
  const [mutation, setMutation] = useState(null)
  const mutationPending = useRef(false)
  const columns = isAdmin ? 7 : 6

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const result = await loadDashboardData({ user, period, selectedTeam, search })
        if (cancelled) return
        setTeams(result.teams)
        setSummaries(result.summaries)
        setLineItems(result.items)
        setActiveCount(result.count)
        setCurrencies(result.currencies)
      } catch (err) {
        if (cancelled) return
        setError(errorMessage(err))
        setSummaries([])
        setLineItems([])
        setActiveCount(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    // Cleanup ignores stale responses when a filter changes during a request.
    const timer = setTimeout(load, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [period, selectedTeam, search, refresh, user])

  const budgets = [...new Map(summaries.filter((summary) => summary.budget_id != null)
    .map((summary) => [String(summary.budget_id), summary])).values()]
  const totals = summaries.reduce((result, summary) => {
    if (!summary.currency) return result
    result[summary.currency] = (result[summary.currency] || 0n) + moneyToCents(summary.total_amount)
    return result
  }, {})

  function changeFilter(setter, value) {
    setLoading(true)
    setShowForm(false)
    setShowBudgetForm(false)
    setter(value)
  }

  function openForm(item = null) {
    if (!isAdmin) return
    setEditingId(item?.id ?? null)
    setDraft(item ? { ...item, budget_id: String(item.budget_id) } : { ...emptyLineItem, budget_id: budgets.length === 1 ? String(budgets[0].budget_id) : '' })
    setFormError('')
    setShowForm(true)
    setShowBudgetForm(false)
  }

  async function addItem(event) {
    event.preventDefault()
    if (!isAdmin || mutationPending.current) return
    setFormError('')
    if (!budgets.some((budget) => String(budget.budget_id) === draft.budget_id)) {
      setFormError('Select a budget for this period.')
      return
    }
    if (!draft.code.trim() || !draft.description.trim() || !draft.purpose.trim()) {
      setFormError('Enter a code, description, and purpose.')
      return
    }
    mutationPending.current = true
    onBusyChange(true)
    setMutation('create')
    try {
      const payload = lineItemPayload(draft, editingId !== null)
      if (editingId !== null) {
        await updateLineItem(editingId, payload)
      } else await createLineItem(payload)
      setShowForm(false)
      setLoading(true)
      setRefresh((value) => value + 1)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      mutationPending.current = false
      onBusyChange(false)
      setMutation(null)
    }
  }

  async function addBudget(event) {
    event.preventDefault()
    if (!isAdmin || mutationPending.current) return
    setBudgetError('')
    if (!teams.some((team) => String(team.id) === budgetTeam)) {
      setBudgetError('Choose a team.')
      return
    }
    mutationPending.current = true
    onBusyChange(true)
    setMutation('budget')
    try {
      await createBudget(Number(budgetTeam), period, initialItems.map((item) => lineItemPayload(item, true)))
      setShowBudgetForm(false)
      setLoading(true)
      setRefresh((value) => value + 1)
    } catch (err) { setBudgetError(errorMessage(err)) }
    finally { mutationPending.current = false; setMutation(null); onBusyChange(false) }
  }

  async function removeRecord() {
    if (!isAdmin || mutationPending.current) return
    const { id, kind } = deleteTarget
    mutationPending.current = true
    onBusyChange(true)
    setMutation(id)
    setError('')
    try {
      if (kind === 'budget') await deleteBudget(id)
      else await deleteLineItem(id)
      setDeleteTarget(null)
      setLoading(true)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      mutationPending.current = false
      onBusyChange(false)
      setMutation(null)
    }
  }

  function updateDraft(event) {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  return (
    <main className="dashboard" aria-busy={loading || mutation !== null}>
      <header className="dashboard-header">
        <div>
          <h1>{isAdmin ? 'Budget overview' : 'My team’s budget'}</h1>
        </div>
        <div className="dashboard-filters">
          <label>Period
            <select value={period} disabled={mutation !== null}
              onChange={(event) => changeFilter(setPeriod, event.target.value)}>
              {periods.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          {isAdmin && <label>Team
            <select value={selectedTeam ?? ''} disabled={mutation !== null}
              onChange={(event) => changeFilter(setSelectedTeam, event.target.value || null)}>
              <option value="">All teams</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>}
        </div>
      </header>

      {error && <div className="dashboard-error" role="alert">
        <span>{error}</span>
        <button type="button" disabled={loading || mutation !== null}
          onClick={() => { setLoading(true); setRefresh((value) => value + 1) }}>Retry</button>
      </div>}

      <section className="dashboard-stats" aria-label="Budget summary" aria-busy={loading}>
        <article className="dashboard-stat">
          <DollarSign aria-hidden="true" />
          <div><p>Total planned budget</p>
            {loading ? <strong>…</strong> : Object.keys(totals).length
              ? Object.entries(totals).map(([currency, amount]) =>
                <strong key={currency}>{formatMoney(amount, currency)}</strong>)
              : <strong>—</strong>}
          </div>
        </article>
        <article className="dashboard-stat">
          <Building aria-hidden="true" />
          <div><p>Budget line items</p><strong>{loading ? '…' : activeCount}</strong>
          </div>
        </article>
      </section>

      {isAdmin && <section className="dashboard-panel dashboard-team-summary" aria-labelledby="team-summary-heading">
        <div className="dashboard-toolbar"><h2 id="team-summary-heading">Team totals</h2></div>
        <div className="dashboard-table-wrap">
          <table>
            <thead><tr><th scope="col">Team</th><th scope="col">Currency</th><th scope="col">Planned budget</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} role="status">Loading totals…</td></tr>
                : summaries.length ? summaries.map((summary, index) => (
                  <tr key={`${summary.team_id}:${summary.currency}`} className={summary.budget_id == null ? 'dashboard-no-budget' : ''}>
                    <td>{summary.team_name}</td>
                    <td>{summary.currency || '—'}</td>
                    <td>{summary.budget_id == null ? 'No budget for this period' : summary.currency ? formatMoney(summary.total_amount, summary.currency) : 'No line items yet'}</td>
                    <td>{summary.budget_id != null && summaries.findIndex((row) => row.budget_id === summary.budget_id) === index && <button className="dashboard-icon-button" disabled={mutation !== null} aria-label={`Delete ${summary.team_name} budget`} onClick={() => { setError(''); setDeleteTarget({ kind: 'budget', id: summary.budget_id, label: summary.team_name }) }}><Trash2 size={16} /></button>}</td>
                  </tr>
                )) : <tr><td colSpan={4}>{error ? 'Totals could not be loaded.' : 'No teams to display.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>}

      <section className="dashboard-panel" aria-labelledby="line-items-heading">
        <div className="dashboard-toolbar">
          <h2 id="line-items-heading">Line items</h2>
          <div className="dashboard-actions">
            <label className="dashboard-search">
              <Search size={18} aria-hidden="true" />
              <input type="search" aria-label="Search line items" placeholder="Search code, description, purpose"
                value={search} disabled={mutation !== null}
                onChange={(event) => { setLoading(true); setSearch(event.target.value) }} />
            </label>
            {isAdmin && <button type="button" disabled={loading || mutation !== null} onClick={() => { setShowBudgetForm((value) => !value); setShowForm(false); setInitialItems([]); setBudgetTeam(selectedTeam || ''); setBudgetError('') }}>
              <Plus size={18} aria-hidden="true" /> Create budget
            </button>}
            {isAdmin && <button className="dashboard-primary" type="button" onClick={() => openForm()}
              disabled={loading || mutation !== null || !budgets.length || showForm}>
              <Plus size={18} aria-hidden="true" /> Add line item
            </button>}
          </div>
        </div>

        {isAdmin && showBudgetForm && <form className="dashboard-line-item-form" onSubmit={addBudget}>
          <h3>Create budget · {period}</h3>
          <label>Team<select value={budgetTeam} onChange={(event) => setBudgetTeam(event.target.value)} disabled={mutation !== null} required>
            <option value="">Choose a team</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select></label>
          <div className="budget-initial-items">
            {initialItems.map((item, index) => <fieldset key={item.key} disabled={mutation !== null} className="budget-initial-row"><legend>Line item {index + 1}</legend>
              {['code', 'description', 'purpose', 'amount'].map((field) => <label key={field}>{field[0].toUpperCase() + field.slice(1)}<input required type={field === 'amount' ? 'number' : 'text'} {...(field === 'amount' ? { min: '0.01', max: '999999999999.99', step: '0.01' } : {})} value={item[field]} onChange={(event) => setInitialItems((rows) => rows.map((row) => row.key === item.key ? { ...row, [field]: event.target.value } : row))} /></label>)}
              <label>Currency<select value={item.currency} onChange={(event) => setInitialItems((rows) => rows.map((row) => row.key === item.key ? { ...row, currency: event.target.value } : row))}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
              <button type="button" onClick={() => setInitialItems((rows) => rows.filter((row) => row.key !== item.key))}>Remove</button>
            </fieldset>)}
            <button type="button" disabled={mutation !== null} onClick={() => { const key = ++rowId.current; setInitialItems((rows) => [...rows, { ...emptyLineItem, key }]) }}><Plus size={16} /> Add initial line item</button>
          </div>
          {budgetError && <p className="dashboard-error" role="alert">{budgetError}</p>}
          <div className="dashboard-form-actions">
            <button type="button" disabled={mutation !== null} onClick={() => setShowBudgetForm(false)}>Cancel</button>
            <button className="dashboard-primary" disabled={mutation !== null} type="submit">{mutation === 'budget' ? 'Creating…' : 'Create budget'}</button>
          </div>
        </form>}

        {isAdmin && showForm && <form className="dashboard-line-item-form" onSubmit={addItem}>
          <h3>{editingId === null ? 'Add line item' : 'Edit line item'}</h3>
          <fieldset disabled={mutation !== null || loading}>
            <label>Budget
              <select name="budget_id" value={draft.budget_id} onChange={updateDraft} required disabled={editingId !== null}>
                <option value="">Select a budget</option>
                {budgets.map((budget) => <option key={budget.budget_id} value={budget.budget_id}>
                  {budget.team_name} · {period} · #{budget.budget_id}
                </option>)}
              </select>
            </label>
            <label>Code<input name="code" value={draft.code} onChange={updateDraft} required /></label>
            <label>Description<input name="description" value={draft.description} onChange={updateDraft} required /></label>
            <label>Purpose<input name="purpose" value={draft.purpose} onChange={updateDraft} required /></label>
            <label>Amount<input name="amount" type="number" min="0.01" max="999999999999.99" step="0.01"
              value={draft.amount} onChange={updateDraft} required /></label>
            <label>Currency<select name="currency" value={draft.currency} onChange={updateDraft} required>
              {currencies.map((currency) => <option key={currency}>{currency}</option>)}
            </select></label>
          </fieldset>
          {formError && <p className="dashboard-error" role="alert">{formError}</p>}
          <div className="dashboard-form-actions">
            <button type="button" disabled={mutation !== null} onClick={() => setShowForm(false)}>Cancel</button>
            <button className="dashboard-primary" type="submit" disabled={mutation !== null || loading}>
              {mutation === 'create' ? 'Saving…' : 'Save line item'}
            </button>
          </div>
        </form>}

        <div className="dashboard-table-wrap" aria-busy={loading}>
          <table>
            <caption className="dashboard-sr-only">Budget line items for {period}, filtered by team and search</caption>
            <thead><tr>{['Team', 'Code', 'Description', 'Purpose', 'Amount', 'Currency', ...(isAdmin ? ['Actions'] : [])].map((field) =>
              <th key={field} scope="col">{field}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={columns} role="status">Loading line items…</td></tr>
                : lineItems.length ? lineItems.map((item) => <tr key={item.id}>
                  <td>{summaries.find((summary) => summary.budget_id === item.budget_id)?.team_name || '—'}</td>
                  <td>{item.code}</td><td>{item.description}</td><td>{item.purpose}</td>
                  <td className="dashboard-amount">{formatMoney(item.amount, item.currency)}</td>
                  <td>{item.currency}</td>
                  {isAdmin && <td><button type="button" disabled={mutation !== null} aria-label={`Edit ${item.code}`} onClick={() => openForm(item)}><Pencil size={17} aria-hidden="true" /> Edit</button> <button type="button" className="dashboard-delete" disabled={mutation !== null}
                    aria-label={`Delete ${item.code}: ${item.description}`} onClick={() => { setError(''); setDeleteTarget({ kind: 'item', id: item.id, label: item.code }) }}>
                    <Trash2 size={17} aria-hidden="true" />{mutation === item.id ? 'Deleting…' : 'Delete'}
                  </button></td>}
                </tr>) : <tr><td colSpan={columns}>
                  {error ? 'Line items could not be loaded.' : !budgets.length
                    ? isAdmin ? 'No budgets yet. Create a budget to get started.' : 'No budget has been published for this period.'
                    : search.trim() ? 'No line items match your search.' : isAdmin ? 'No line items yet. Add your first line item above.' : 'Finance has not added any budget line items yet.'}
                </td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {deleteTarget && <ConfirmationDialog title={deleteTarget.kind === 'budget' ? `Delete ${deleteTarget.label} budget?` : `Delete ${deleteTarget.label}?`} description={deleteTarget.kind === 'budget' ? 'The budget and all its line items will be permanently deleted.' : 'This line item will be permanently deleted.'} busy={mutation !== null} error={error} onConfirm={removeRecord} onClose={() => setDeleteTarget(null)} confirmLabel={deleteTarget.kind === 'budget' ? 'Delete budget' : 'Delete line item'} />}
    </main>
  )
}
