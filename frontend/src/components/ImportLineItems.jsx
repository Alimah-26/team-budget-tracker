import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, CheckCircle, Upload } from 'lucide-react'
import { getBudgetSummary, importLineItems } from '../api.js'
import { apiError, canConfirmImport, importBudgets } from '../adminData.js'
import { csvPreview } from '../csvPreview.js'
import './Admin.css'

const periods = [2025, 2026, 2027].flatMap((year) => [1, 2, 3, 4].map((quarter) => `${year}-Q${quarter}`))

export default function ImportLineItems({ user, onBusyChange, onViewBudget }) {
  const [period, setPeriod] = useState('2026-Q4')
  const [budgets, setBudgets] = useState([])
  const [budgetId, setBudgetId] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const requestPending = useRef(false)
  const fileInput = useRef(null)
  const active = useRef(false)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    if (user.role !== 'admin') return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const response = await getBudgetSummary(period)
        if (!cancelled) setBudgets(importBudgets(response.summaries))
      } catch (failure) {
        if (!cancelled) { setError(apiError(failure)); setBudgets([]) }
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [period, attempt, user.role])

  if (user.role !== 'admin') return null
  const selected = budgets.find((budget) => String(budget.id) === budgetId)
  const canImport = canConfirmImport(preview, file, budgetId)

  function resetReport() { setPreview(null); setNotice(''); setError('') }

  async function submit(dryRun) {
    if (requestPending.current || !file || !selected || (!dryRun && !canImport)) return
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Choose a CSV file.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Choose a CSV file smaller than 2 MB.'); return }
    const uploadedFile = file
    const targetId = budgetId
    requestPending.current = true
    setBusy(dryRun ? 'preview' : 'import')
    onBusyChange(true)
    setError(''); setNotice(''); setPreview(null)
    try {
      const report = await importLineItems(Number(targetId), uploadedFile, dryRun)
      if (!active.current) return
      if (dryRun || !report.success) {
        let table = null
        try { table = csvPreview(await uploadedFile.text()) } catch { /* Server report remains authoritative. */ }
        if (active.current) setPreview({ file: uploadedFile, budgetId: targetId, report, table })
      } else {
        setNotice(`${report.imported_count} line item(s) imported into ${selected.teamName} · ${period}.`)
        setFile(null)
        if (fileInput.current) fileInput.current.value = ''
      }
    } catch (failure) { if (active.current) setError(apiError(failure)) }
    finally {
      requestPending.current = false
      if (active.current) setBusy(null)
      onBusyChange(false)
    }
  }

  return <main className="admin-page" aria-busy={loading || Boolean(busy)}>
    <header className="admin-heading"><div><h1>Import CSV</h1></div>
      <a className="admin-button" href="/csv/budget-template.csv" download><ArrowDownToLine size={16} /> Download template</a>
    </header>
    <ol className="import-steps" aria-label="Import steps"><li className="active"><span>1</span> Select file</li><li className={preview ? 'active' : ''}><span>2</span> Review</li><li><span>3</span> Import</li></ol>
    <div className="admin-panel admin-form-grid">
      <label>Period<select disabled={Boolean(busy)} value={period} onChange={(event) => { setPeriod(event.target.value); setBudgetId(''); setLoading(true); resetReport() }}>
        {periods.map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Team budget<select required disabled={loading || Boolean(busy)} value={budgetId} onChange={(event) => { setBudgetId(event.target.value); resetReport() }}>
        <option value="">{loading ? 'Loading budgets…' : 'Choose a budget'}</option>
        {budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.teamName} · {period}</option>)}
      </select></label>
      <label className="admin-full">CSV file (up to 2 MB)<input ref={fileInput} type="file" accept=".csv,text/csv" disabled={Boolean(busy)} onChange={(event) => { setFile(event.target.files?.[0] || null); resetReport() }} /></label>
      <div className="admin-full admin-actions"><a href="/csv/budget-sample.csv" download>Download sample CSV</a></div>
      {!loading && !budgets.length && !error && <div className="admin-full"><p>No budgets exist for this period. Create a budget first.</p><button onClick={() => onViewBudget(period, null)}>Open Budgets</button></div>}
      <div className="admin-full admin-actions"><button className="admin-primary" disabled={loading || Boolean(busy) || !file || !selected} onClick={() => submit(true)}><Upload size={16} />{busy === 'preview' ? 'Validating…' : 'Validate & preview'}</button>
        <button disabled={loading || Boolean(busy)} onClick={() => { setLoading(true); setAttempt((value) => value + 1); resetReport() }}>Refresh budgets</button>
      </div>
    </div>
    {busy && <p role="status">{busy === 'preview' ? 'Validating CSV…' : 'Importing line items…'}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <div className="admin-notice" role="status"><CheckCircle size={18} /><span>{notice}</span><button onClick={() => onViewBudget(period, selected?.teamId)}>View budget</button></div>}
    {preview && <section className="admin-panel" aria-labelledby="import-report-heading">
      <h2 id="import-report-heading">{preview.report.success ? 'Validation passed' : 'Correct these rows before importing'}</h2>
      <p>{preview.report.total_rows} rows · {preview.report.errors.length ? `${preview.report.errors.length} errors` : 'Ready to import'}</p>
      {preview.report.errors.length > 0 && <div className="admin-table-scroll"><table><thead><tr><th scope="col">CSV row</th><th scope="col">Error</th></tr></thead><tbody>
        {preview.report.errors.map((row, index) => <tr key={`${row.row}:${index}`}><td>{row.row}</td><td>{row.error}</td></tr>)}
      </tbody></table></div>}
      {preview.table && <div className="admin-table-scroll"><table aria-label="CSV file preview"><thead><tr><th scope="col">Row</th>{preview.table.headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>
        {preview.table.rows.map((row, index) => <tr key={index}><td>{index + 2}</td>{preview.table.headers.map((header, column) => <td key={column}>{row[column] || '—'}</td>)}</tr>)}
      </tbody></table>{preview.table.total > 100 && <p className="admin-hint">Showing the first 100 rows. All {preview.report.total_rows} rows were validated.</p>}</div>}
      <p className="admin-hint">If any row is invalid, none of the file is imported. </p>
      <div className="admin-actions"><button className="admin-primary" disabled={Boolean(busy) || !canImport} onClick={() => submit(false)}>{busy === 'import' ? 'Importing…' : `Confirm import of ${preview.report.total_rows} row(s)`}</button></div>
    </section>}
  </main>
}
