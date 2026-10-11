// Provider output can contain credential material. Only fixed, actionable text
// crosses the API/logging boundary; never retain the original error as a cause.
export function certificateFailure(error, context = {}) {
 const detail=String(error?.message||'').slice(0,65536);
 let code='CERTIFICATE_OPERATION_FAILED';
 let message='Certificate operation failed. Open Diagnostics & Support with the diagnostic reference to investigate the cause.';
 if(/ModuleNotFoundError|No module named|command not found|ENOENT|cannot import/i.test(detail)) {
  code='CERTIFICATE_RUNTIME_UNAVAILABLE';message='Certificate tooling is unavailable. Verify the Manager image Certbot runtime before retrying.';
 } else if(/EACCES|EPERM|permission denied|read.only file system|ENOSPC|no space left/i.test(detail)) {
  code='CERTIFICATE_STORAGE_FAILED';message='Certificate storage is unavailable or not writable. Check storage permissions and free space before retrying.';
 } else if(context.phase==='plugin') {
  code='CERTIFICATE_PLUGIN_FAILED';message='DNS challenge plugin initialization failed. Check the configured provider and Manager Certbot plugin runtime.';
 } else if(/invalid.*(?:credential|token|api.?key)|(?:credential|token|api.?key).*invalid|authentication error|invalid request headers|(?:cloudflare|dns provider).*(?:403|unauthorized|authentication)/i.test(detail)) {
  code='CERTIFICATE_DNS_CREDENTIALS';message='DNS provider authentication failed. Check the credential permissions and DNS zone scope, then retry.';
 } else if(/rate.?limit|too many requests|too many certificates/i.test(detail)) {
  code='CERTIFICATE_RATE_LIMIT';message='Certificate authority rate limit reached. Wait for the retry window or use the staging authority for testing.';
 } else if(/NXDOMAIN|SERVFAIL|no valid (?:A|AAAA)|DNS problem|unable to determine zone|zone.*not found/i.test(detail)) {
  code='CERTIFICATE_DNS_FAILED';message='DNS validation failed. Check public DNS records, zone selection and challenge propagation, then retry.';
 } else if(/timed? ?out|timeout|ECONN|connection (?:refused|error)|network is unreachable|failed to establish|temporary failure in name resolution/i.test(detail)) {
  code='CERTIFICATE_NETWORK_FAILED';message='Certificate service connection failed. Check DNS resolution, outbound connectivity and challenge routing, then retry.';
 } else if(/unauthorized|challenge failed|invalid response|404|403/i.test(detail)) {
  code='CERTIFICATE_CHALLENGE_FAILED';message='Domain challenge failed. Check HTTP port 80 routing or DNS challenge records and retry.';
 }
 const safe=new Error(message);safe.name='CertificateError';safe.code=code;safe.public=true;safe.status=400;
 return safe;
}
export async function certificateOperation(operation, context = {}) {
 try{return await operation();}catch(error){throw certificateFailure(error, context);}
}
export async function runCertbot(execute,command,args,options) {
 await certificateOperation(()=>execute(command,args,options));
 return 'Certificate tooling operation completed.';
}
