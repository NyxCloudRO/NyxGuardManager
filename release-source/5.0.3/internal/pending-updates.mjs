// Count NyxGuard components from the updater's reconciled discovery response.
// The current Update Manager discovers Manager only; OS packages are unrelated.
export function pendingNyxguardUpdates(status) {
  const version=/^\d+\.\d+\.\d+(?:-dev)?$/;
  if(!status || !version.test(status.current||'') || !version.test(status.latestPublished||'') ||
    !Number.isFinite(Date.parse(status.lastCheckAt||'')) || status.lastCheckError ||
    status.recoveryRequired || ['checking','recovery_required'].includes(status.stage) ||
    typeof status.updateAvailable!=='boolean')return null;
  if(status.updateAvailable && (!version.test(status.latest||'') || status.latest!==status.latestPublished))return null;
  return Number(status.updateAvailable);
}
