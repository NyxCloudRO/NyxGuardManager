from pathlib import Path
import difflib,hashlib,json
P=Path(__file__).parent;S=P/'gcc-source/gcc-12-12.2.0/src';f=S/'libstdc++-v3/libsupc++/new_opa.cc';old=f.read_text();new=old
block=old[old.index('#if _GLIBCXX_HAVE_ALIGNED_ALLOC\n# if defined _AIX',old.index('operator new')):old.index('\n  void *p;',old.index('operator new'))]
new=new.replace('using ::aligned_alloc;', '''// C11 requires size to be a multiple of alignment; reject rounding overflow.
static inline void*
aligned_alloc (std::size_t al, std::size_t sz)
{
# if defined _AIX || defined __APPLE__
  if (al < sizeof(void*))
    al = sizeof(void*);
# endif
  if (__builtin_add_overflow(sz, al - 1, &sz))
    return nullptr;
  sz &= ~(al - 1);
  return ::aligned_alloc(al, sz);
}''')
new=new.replace('{ return _aligned_malloc(sz, al); }','''{
  std::size_t check;
  if (__builtin_add_overflow(sz, al + 2 * sizeof(void*), &check))
    return nullptr;
  return _aligned_malloc(sz, al);
}''')
new=new.replace('  void* const malloc_ptr = malloc(sz + al);','  if (__builtin_add_overflow(sz, al, &sz))\n    return nullptr;\n  void* const malloc_ptr = malloc(sz);')
assert new.count(block)==1
new=new.replace(block,'');assert new!=old
(P/'gcc-aligned-new-backport.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/libstdc++-v3/libsupc++/new_opa.cc',tofile='b/libstdc++-v3/libsupc++/new_opa.cc')))
f.write_text(new)
(P/'gcc-backport-provenance.json').write_text(json.dumps({'source':'Debian gcc-12 12.2.0-14+deb12u1; debian/rules patch','upstream':'59d235ffa5a69231eb42e5290d52dc8c90d28b7a','adaptation':'Retain GCC12 ALIGNED_ALLOC-first selection; omit newer branch-only unlikely attributes; identical overflow guards and handler loop.','source_before_sha256':hashlib.sha256(old.encode()).hexdigest(),'source_after_sha256':hashlib.sha256(new.encode()).hexdigest()},indent=2))
