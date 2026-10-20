local cjson=require('cjson.safe')
local M={}; local d=ngx.shared.nyxguard_blocked
local function drop(kind) d:incr(kind,1,0) end
function M.observe()
 if ngx.is_subrequest or ngx.status~=403 or not ngx.var.nyxguard_observed or ngx.var.nyxguard_observed=='' then return end
 local meta=cjson.decode(ngx.decode_base64(ngx.var.nyxguard_observed) or '')
 if not meta then drop('invalid');return end
 local sec=ngx.time()
 if meta.expires and meta.expires>0 and meta.expires<=sec then drop('expired');return end
 local gen=d:get('generation');local boot=d:get('boot')
 if not gen or not boot then drop('unready');return end
 local high=d:get('high') or 0
 if sec<high-1 then drop('clock');return end
 if sec>high then d:safe_set('high',sec) end
 local app=tonumber(ngx.var.nyxguard_observed_app)
 if not app or app<1 then drop('unmapped');return end
 local country=ngx.var.nyxguard_observed_geo or '';if not country:match('^[A-Z][A-Z]$') then country='' end
 local dimensions={boot,gen,sec,ngx.var.remote_addr,app,string.sub(ngx.var.host or '',1,253),ngx.var.nyxguard_observed,country}
 local key='q:'..cjson.encode(dimensions)
 if d:incr(key,1) then return end
 local groups=d:incr('groups',1,0)
 if not groups or groups>4096 then d:incr('groups',-1);drop('dropped');return end
 local ok=d:safe_add(key,1)
 if not ok then
  d:incr('groups',-1)
  if not d:incr(key,1) then drop('dropped') end
 end
end
function M.control()
 ngx.header.content_type='application/json'
 if ngx.req.get_method()=='POST' then
  ngx.req.read_body();local body=cjson.decode(ngx.req.get_body_data() or '')
  if not body then ngx.status=400;ngx.say('{}');return end
  if type(body.generation)=='string' and #body.generation==36 then
   if not d:get('boot') then d:safe_set('boot',ngx.var.request_id) end
   d:safe_set('generation',body.generation)
  end
  for _,ack in ipairs(body.acks or {}) do
   if type(ack[1])=='string' and ack[1]:sub(1,2)=='q:' and type(ack[2])=='number' and d:get(ack[1]) then
    d:safe_set('a:'..ack[1],ack[2])
   end
  end
 end
 local out={items={},boot=d:get('boot'),generation=d:get('generation'),metrics={}}
 for _,name in ipairs({'dropped','invalid','expired','unready','unmapped','clock','groups'})do out.metrics[name]=d:get(name) or 0 end
 local now=ngx.time()
 for _,key in ipairs(d:get_keys(10000)) do
  if key:sub(1,2)=='q:' then
   local dims=cjson.decode(key:sub(3));local n=d:get(key) or 0;local ack=d:get('a:'..key) or 0
   if dims and dims[3]<now-2 then
    if dims[2]~=d:get('generation') or (n==ack and dims[3]<now-60) then
     d:delete(key);d:delete('a:'..key);d:incr('groups',-1)
    elseif n>ack and #out.items<256 then table.insert(out.items,{key=key,d=dims,n=n}) end
   end
  end
 end
 ngx.say(cjson.encode(out))
end
return M
