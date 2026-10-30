import { useEffect, useRef } from 'react'
import './Admin.css'

export default function ConfirmationDialog({ title, description, busy, error, onConfirm, onClose, confirmLabel = 'Delete' }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={ref} className="admin-dialog" aria-labelledby="confirmation-heading" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <h2 id="confirmation-heading">{title}</h2>
    <p>{description}</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="admin-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : confirmLabel}</button></div>
  </dialog>
}
