local q=package.loaded.nyxguard_blocked_queue
if not q then q=assert(loadfile('/app/internal/blocked-queue.lua'))();package.loaded.nyxguard_blocked_queue=q end
q.control()
