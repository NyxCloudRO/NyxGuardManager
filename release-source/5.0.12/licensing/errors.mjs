// Only fixed messages and explicitly allowed technical metadata cross the boundary.
export const licensingPolicies = {
 LICENSING_CONFIGURATION: ['Licensing authority or protected local storage is not configured correctly.', 'Verify the authority origin and the existing vault key; do not replace installation data.'],
 LICENSING_AUTHORITY_TLS: ['The licensing authority HTTPS connection failed.', 'Check the public origin certificate, SNI and Cloudflare-to-origin TLS configuration.'],
 LICENSING_AUTHORITY_TIMEOUT: ['The licensing authority did not respond before the timeout.', 'Check the public authority route and service responsiveness, then retry.'],
 LICENSING_AUTHORITY_DNS: ['The licensing authority hostname could not be resolved.', 'Check the configured authority hostname and DNS resolution.'],
 LICENSING_AUTHORITY_UNAVAILABLE: ['The licensing authority is temporarily unavailable.', 'Check the public authority route and dependency health, then retry.'],
 LICENSING_AUTHORITY_RESPONSE: ['The licensing authority returned an unusable response.', 'Check gateway routing and the authority API contract. Existing entitlement data is retained.'],
 LICENSING_REQUEST_REJECTED: ['The licensing request was rejected.', 'Verify the selected product and claim or recovery details. Obtain a new code if it has expired or was consumed.'],
 LICENSING_INVALID_REQUEST: ['The licensing request is invalid or has no required activation state.', 'Check the selected product and supplied details before retrying.'],
 LICENSING_RATE_LIMITED: ['The licensing authority rate limit was reached.', 'Wait before retrying this operation.'],
};
const categories = new Set(['malformed_request','claim_invalid','claim_expired','claim_consumed','claim_rejected','activation_rejected','recovery_rejected','recovery_invalid','recovery_unavailable','credential_rejected','requires_reactivation','read_only_authority','lifecycle_configuration_invalid','database_unavailable','email_queue_unavailable','server_unavailable','replication_stale','request_rate_limited']);
export class LicensingError extends Error {
 constructor(message, { code = 'LICENSING_AUTHORITY_UNAVAILABLE', status = 503, dependency = 'licensing_authority', upstreamStatus, upstreamCategory, reference, failureType } = {}) {
  super(message); this.name = 'LicensingError'; this.code = code; this.status = status;
  this.safeSummary = licensingPolicies[code]?.[0] || licensingPolicies.LICENSING_AUTHORITY_UNAVAILABLE[0];
  this.safeRecommendation = licensingPolicies[code]?.[1] || licensingPolicies.LICENSING_AUTHORITY_UNAVAILABLE[1];
  this.details = { dependency, failure_type: failureType || code.toLowerCase(), http_status: status };
  if (Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599) this.details.upstream_http_status = upstreamStatus;
  if (categories.has(upstreamCategory)) this.details.authority_category = upstreamCategory;
  if (/^(?:[a-f0-9]{16,32}-[A-Z]{3}|[a-f0-9-]{36})$/i.test(reference || '')) this.details.dependency_reference = reference;
 }
}
export function licensingError(message, metadata = {}) {
 const invalid = /^(claim_code_invalid|activation_proof_missing|email_invalid|recovery_invalid|version_invalid|invalid_product_policy|refresh_not_configured|deactivation_not_configured|replacement_not_configured)$/;
 const configuration = /^(endpoint_configuration_invalid|endpoint_unavailable|vault_key_unavailable|vault_key_invalid|vault_key_permissions_invalid)$/;
 const denied = /^(support_upload_not_authorized|support_feature_not_authorized|license_revoked_or_reactivation_required)$/;
 return new LicensingError(message, { ...(invalid.test(message) ? {code:'LICENSING_INVALID_REQUEST',status:400} : configuration.test(message) ? {code:'LICENSING_CONFIGURATION',status:503} : denied.test(message) ? {code:'LICENSING_REQUEST_REJECTED',status:403} : {}), ...metadata });
}
export function responseFailure(message, result) {
 const status = result.status;
 return licensingError(message, { code:status === 429 ? 'LICENSING_RATE_LIMITED' : status >= 500 ? 'LICENSING_AUTHORITY_UNAVAILABLE' : 'LICENSING_REQUEST_REJECTED',
  status:status === 429 ? 429 : status >= 500 ? 503 : [400,401,403,404,409,410,422].includes(status) ? status : 502,
  upstreamStatus:status, upstreamCategory:result.data?.category || result.data?.result, reference:result.reference, dependency:result.dependency });
}
export function transportFailure(error, metadata = {}) {
 const reason = error?.cause?.code || error?.code || error?.name;
 const code = ['AbortError','TimeoutError','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(reason) ? 'LICENSING_AUTHORITY_TIMEOUT' :
  ['ENOTFOUND','EAI_AGAIN'].includes(reason) ? 'LICENSING_AUTHORITY_DNS' : /CERT|TLS|SSL|SELF_SIGNED/.test(String(reason)) ? 'LICENSING_AUTHORITY_TLS' : 'LICENSING_AUTHORITY_UNAVAILABLE';
 return licensingError('authority_unavailable', {code,...metadata});
}
export function safeLicensingFailure(error) {
 if (error instanceof LicensingError) return error;
 if (/^(vault_key_|endpoint_configuration)/.test(error?.message || '')) return licensingError(error.message);
 return error;
}
