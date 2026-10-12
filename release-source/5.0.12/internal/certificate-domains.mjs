import {domainToASCII} from 'node:url';
export function validateCertificateDomains(names) {
 if(!Array.isArray(names)||!names.length||names.length>100)throw invalid();
 for(const name of names){
  if(typeof name!=='string'||name!==name.trim())throw invalid();
  const ascii=domainToASCII(name.startsWith('*.')?name.slice(2):name);
  if(!ascii||ascii.length>253||ascii.includes('*')||ascii.endsWith('.'))throw invalid();
  const labels=ascii.split('.');
  if(labels.length<2||labels.some(label=>!/^([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/i.test(label))||!(/^[a-z]{2,63}$/i.test(labels.at(-1))||/^xn--[a-z0-9-]+$/i.test(labels.at(-1))))throw invalid();
 }
}
function invalid(){return Object.assign(new Error('Enter valid DNS names. A wildcard is allowed only as *.domain.'),{code:'INVALID_CONFIGURATION',status:400,public:true});}
