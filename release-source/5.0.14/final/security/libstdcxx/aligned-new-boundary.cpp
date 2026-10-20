#include <new>
#include <limits>
#include <cstdio>
int main(){volatile std::size_t huge=std::numeric_limits<std::size_t>::max()-31;try{void *p=::operator new(huge,std::align_val_t(64));if(p){::operator delete(p,std::align_val_t(64));std::puts("FAIL: oversized aligned allocation returned storage instead of rejecting overflow; no storage written");return 1;}std::puts("FAIL: throwing aligned new returned null");return 2;}catch(const std::bad_alloc&){std::puts("PASS: oversized aligned allocation rejected");return 0;}}
