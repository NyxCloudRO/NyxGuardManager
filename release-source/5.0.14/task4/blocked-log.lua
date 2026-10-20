-- Observation failure must never alter the existing response or enforcement.
local ok=pcall(function()
 local q=package.loaded.nyxguard_blocked_queue
 if not q then q=assert(loadfile('/app/internal/blocked-queue.lua'))();package.loaded.nyxguard_blocked_queue=q end
 q.observe()
end)
if not ok then ngx.shared.nyxguard_blocked:incr('invalid',1,0) end
