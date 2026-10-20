// Presentation of existing API and browser errors; no request, status, or machine code is changed.
export function createErrorPresenter(intl,lookup,{policies,diagnosticId,networkId}){
 const message=(id,values)=>intl.formatMessage({id},values);
 function errorMessage(source){
  const text=String(source??'');
  if(Object.hasOwn(intl.messages,text))return message(text);
  const id=lookup.get(text||'Request failed.');
  return id?message(id):message('dynamic.technical-error',{detail:text});
 }
 function apiError(payload,status){
  const error=payload&&typeof payload==='object'?payload:{message:payload};
  const translatedKey=error.message_i18n??error.messageI18n;
  if(translatedKey&&Object.hasOwn(intl.messages,translatedKey))return message(translatedKey);
  const policy=policies[error.error_code??error.errorCode],reference=error.diagnostic_id??error.diagnosticId;
  if(policy&&typeof reference==='string'&&/^[a-f0-9-]{36}$/i.test(reference))return message(diagnosticId,{summary:message(policy.summary),reference,recommendation:message(policy.recommendation)});
  const source=translatedKey??error.message;return source!==undefined?errorMessage(source):status?message('dynamic.request-failed',{status}):errorMessage('Request failed.');
 }
 function networkError(error){
  if(error?.name==='AbortError')throw error;
  const Constructor=error instanceof TypeError?TypeError:Error;
  const localized=new Constructor(message(networkId),{cause:error});
  if(error?.name)localized.name=error.name;
  throw localized;
 }
 return Object.freeze({errorMessage,apiError,networkError});
}
