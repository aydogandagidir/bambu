import { Button } from '@ui/components/Button'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { ZapSolidIcon } from 'pixel-art-icons/icons/zap-solid'
import { useAdminNavigate } from '@admin/lib/useAdminNavigate'
import { queuePendingAction } from '@admin/spotlight/pendingAction'

export function DashboardHeaderActions() {
  const navigate = useAdminNavigate()

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => {
        queuePendingAction('site.importUrl')
        navigate('/admin/site')
      }}>
        Import URL
      </Button>
      <Button variant="ghost" size="sm">
        <ZapSolidIcon size={11} aria-hidden="true" /> Publish all
      </Button>
      <Button variant="primary" onClick={() => navigate('/admin/site')}>
        <PlusIcon size={12} aria-hidden="true" /> New page
      </Button>
    </>
  )
}
