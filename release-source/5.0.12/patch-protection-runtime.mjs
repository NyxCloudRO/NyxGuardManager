import fs from 'node:fs';
const root=process.argv[2]||'/app';
function patch(relative,old,next){const file=root+'/'+relative;const s=fs.readFileSync(file,'utf8');if(s.split(old).length!==2)throw Error('Protection prerequisite differs: '+relative);fs.writeFileSync(file,s.replace(old,next));}
// Nginx accepts a zero burst by omitting the optional burst parameter.
patch('internal/nyxguard/nginx.js','ddosLines.push(`limit_req zone=nyxguard_req burst=${burst} nodelay;`);','ddosLines.push(`limit_req zone=nyxguard_req${burst > 0 ? ` burst=${burst}` : ""} nodelay;`);');
// A location-level add_header replaces server-level inheritance. Keep the
// existing protected-host policy in proxy locations, with empty values on
// unprotected hosts. Maps are declared before any startup server is parsed.
const headers=[
 ['Strict-Transport-Security','max-age=31536000; includeSubDomains'],
 ['X-Content-Type-Options','nosniff'],
 ['X-Frame-Options','SAMEORIGIN'],
 ['Referrer-Policy','strict-origin-when-cross-origin'],
 ['Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()'],
 ['Content-Security-Policy-Report-Only',"default-src 'self' https: http: data: blob: 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'self';"],
];
let maps='\n\tmap $host $nyxguard_response_protected { default 0; }\n';
let location='\n# Preserve the existing WAF header policy inside proxy locations.\n';
headers.forEach(([name,value],index)=>{const variable='$nyxguard_response_header_'+index;maps+=`\tmap $nyxguard_response_protected ${variable} { default ""; 1 "${value}"; }\n`;location+=`add_header ${name} ${variable} always;\n`;});
patch('../etc/nginx/nginx.conf','map_hash_bucket_size 512;','map_hash_bucket_size 512;'+maps);
patch('../etc/nginx/conf.d/include/proxy.conf','add_header        X-Served-By $host;','add_header        X-Served-By $host;'+location);
patch('internal/nyxguard/nginx.js','serverLines.push("# Security response headers for protected proxy hosts.");','serverLines.push("# Security response headers for protected proxy hosts.");\n            serverLines.push("set $nyxguard_response_protected 1;");');
