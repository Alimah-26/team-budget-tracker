import { useEffect, useState } from 'react'
import { Building2, LayoutDashboard, LogOut, ShieldCheck, Upload, Users } from 'lucide-react'
import api, { getCurrentUser } from './api.js'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import ImportLineItems from './components/ImportLineItems.jsx'
import TeamsPeople from './components/TeamsPeople.jsx'
import './App.css'

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [profile, setProfile] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [section, setSection] = useState('budgets')
  const [adminBusy, setAdminBusy] = useState(false)
  const [dashboardStart, setDashboardStart] = useState({ period: '2026-Q4', teamId: null })
  const user = profile?.token === token ? profile.user : null
  const error = profile?.token === token ? profile.error : ''
  const activeSection = user?.role === 'admin' ? section : 'budgets'

  useEffect(() => {
    if (!token) {
      localStorage.removeItem('token')
      return
    }
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (failure) => {
        if (failure.response?.status === 401 && localStorage.getItem('token') === token) {
          localStorage.removeItem('token')
          setToken(null)
        }
        return Promise.reject(failure)
      },
    )
    return () => api.interceptors.response.eject(interceptor)
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    async function loadProfile() {
      try {
        const account = await getCurrentUser()
        if (!['admin', 'employee'].includes(account.role)) throw new Error('Invalid account response')
        if (!cancelled) setProfile({ token, user: account, error: '' })
      } catch (failure) {
        if (!cancelled) setProfile({
          token, user: null,
          error: failure.response?.status === 403
            ? 'Your account cannot access this application. Contact finance.'
            : 'Unable to load your account. Check that the backend is running and try again.',
        })
      }
    }
    loadProfile()
    // Refresh permissions after returning from another tab or window.
    window.addEventListener('focus', loadProfile)
    return () => { cancelled = true; window.removeEventListener('focus', loadProfile) }
  }, [token, attempt])

  function handleLogout() {
    localStorage.removeItem('token')
    setToken(null)
    setProfile(null)
    setAdminBusy(false)
    setSection('budgets')
  }

  function refreshAccount() {
    setProfile(null)
    setAttempt((value) => value + 1)
  }

  if (!token) return <Login onLoginSuccess={(accessToken) => { setProfile(null); setToken(accessToken) }} />

  return (
    <div className="app-shell">
      <header className="app-navigation">
        <a href="/" className="app-brand"><span className="app-brand-mark"><Building2 size={23} /></span><span className="app-title">Team Budget Tracker</span></a>
        <div className="app-account">
          {user && <><span className="app-avatar" aria-hidden="true">{user.full_name.split(' ').filter(Boolean).slice(0, 2).map((name) => name[0]).join('')}</span><span className="app-account-name">{user.full_name}</span><span className="app-role">{user.role === 'admin' ? 'Admin' : 'Employee'}</span></>}
          <button type="button" onClick={handleLogout}><LogOut size={16} /> Sign out</button>
        </div>
      </header>
      <aside className="app-sidebar">
        <div className="app-organisation"><span>CW</span><strong>Cowrywise</strong></div>
        {user && <nav className="app-tabs" aria-label={user.role === 'admin' ? 'Admin sections' : 'Workspace'}>
          {(user.role === 'admin'
            ? [['budgets', 'Budgets', LayoutDashboard], ['import', 'CSV Import', Upload], ['people', 'Teams & People', Users]]
            : [['budgets', 'My budget', LayoutDashboard]]).map(([id, label, Icon]) => (
              <button key={id} disabled={adminBusy} aria-current={activeSection === id ? 'page' : undefined} onClick={() => setSection(id)}><Icon size={18} />{label}</button>
            ))}
        </nav>}
        <div className="app-sidebar-footer"><ShieldCheck size={15} /> cowrywise.com</div>
      </aside>
      <div className="app-workspace">
      {!user ? (
        <main className="awaiting-access">
          {error ? <><p role="alert">{error}</p><button onClick={refreshAccount}>Retry</button></>
            : <p role="status">Loading your account…</p>}
        </main>
      ) : user.role === 'employee' && user.team_id == null ? (
        <main className="awaiting-access">
          <h1>Awaiting access</h1>
          <p>Ask finance to assign you to a team so you can view its budget.</p>
          <button type="button" onClick={refreshAccount}>Check access again</button>
        </main>
      ) : activeSection === 'import' ? (
        <ImportLineItems user={user} onBusyChange={setAdminBusy} onViewBudget={(period, teamId) => {
          setDashboardStart({ period, teamId: teamId ?? null })
          setSection('budgets')
        }} />
      ) : activeSection === 'people' ? (
        <TeamsPeople user={user} onBusyChange={setAdminBusy} onAccountChanged={refreshAccount} />
      ) : <Dashboard key={`${user.role}:${user.team_id}:${dashboardStart.period}:${dashboardStart.teamId}`} user={user} initialPeriod={dashboardStart.period} initialTeamId={dashboardStart.teamId} onBusyChange={setAdminBusy} />}
      </div>
    </div>
  )
}

export default App
