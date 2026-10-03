const TYPES = {'inbound.bot':'bot','inbound.sqli':'sqli','inbound.ddos':'ddos','inbound.authfail':'authfail'};
const equal = (a,b) => a == null && b == null || String(a) === String(b);
export async function backfillLegacyHistory(k) {
  let copied = 0, removed = 0;
  // Stream bounded pages and never delete unknown/native producers.
  let lastId = 0;
  for (;;) {
    const rows = await k('web_threat_events').where('id','>',lastId).where('category','inbound')
      .whereIn('rule_id',Object.keys(TYPES)).orderBy('id').limit(200);
    if (!rows.length) break;
    for (const row of rows) {
      lastId = row.id;
      let meta; try {meta = typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta;} catch {continue;}
      if (meta?.source !== 'nyxguard_attack_monitor') continue;
      // Unknown timestamps/IPs must not be invented.
      if (!row.src_ip || !Number.isFinite(new Date(row.ts).getTime())) throw new Error('Legacy attack lacks required history fields');
      const candidate = {attack_type:TYPES[row.rule_id], ip:row.src_ip, created_on:row.ts,
        host: typeof meta.host === 'string' ? meta.host : null,
        method: typeof meta.method === 'string' ? meta.method : null,
        uri: typeof meta.uri === 'string' ? meta.uri : null,
        status: Number.isInteger(meta.status) ? meta.status : null,
        user_agent: typeof meta.userAgent === 'string' ? meta.userAgent : null,
        referer: typeof meta.referer === 'string' ? meta.referer : null};
      // Compare persisted evidence, including context, before adopting an existing canonical row.
      let canonical = await k('nyxguard_attack_event').where('legacy_web_threat_id',row.id).first();
      if (!canonical) {
        const possible = await k('nyxguard_attack_event').where({attack_type:candidate.attack_type, ip:candidate.ip, created_on:candidate.created_on});
        canonical = possible.find(r=>Object.entries(candidate).every(([key,value])=>key==='created_on' ? new Date(r[key]).getTime()===new Date(value).getTime() : equal(r[key],value)));
        if (canonical) await k('nyxguard_attack_event').where('id',canonical.id).update({legacy_web_threat_id:row.id});
        else {await k('nyxguard_attack_event').insert({...candidate,legacy_web_threat_id:row.id}); copied++;}
      }
      const persisted = await k('nyxguard_attack_event').where('legacy_web_threat_id',row.id).first();
      if (!persisted || !Object.entries(candidate).every(([key,value])=>key==='created_on' ? new Date(persisted[key]).getTime()===new Date(value).getTime() : equal(persisted[key],value))) throw new Error('Canonical history verification failed');
      // Insert -> verify -> delete survives partial completion on nontransactional Aria.
      removed += await k('web_threat_events').where('id',row.id).delete();
    }
  }
  return {copied, removed};
}
