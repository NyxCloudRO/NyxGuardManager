#include <new>
#include <limits>
#include <cstdio>
#include <cstdint>
#include <thread>
#include <future>
#include <mutex>
#include <condition_variable>
#include <vector>
#include <string>
#include <sstream>
#include <stdexcept>
#include <memory_resource>
#include <filesystem>
#include <cassert>
static void handler(){throw std::bad_alloc();}
int main(){
 const size_t sizes[]={0,1,63,64,65,4097};
 for(size_t a=1;a<=4096;a*=2) for(size_t n:sizes){
  void*p=::operator new(n,std::align_val_t(a));assert(p);assert(reinterpret_cast<uintptr_t>(p)%a==0);if(n)static_cast<char*>(p)[n-1]=42;::operator delete(p,std::align_val_t(a));
  p=::operator new[](n,std::align_val_t(a));assert(p);assert(reinterpret_cast<uintptr_t>(p)%a==0);::operator delete[](p,std::align_val_t(a));
 }
 for(size_t a=64;a<=4096;a*=2){
  volatile size_t n=std::numeric_limits<size_t>::max()-31;
  try{void*p=::operator new(n,std::align_val_t(a));::operator delete(p,std::align_val_t(a));assert(false);}catch(const std::bad_alloc&){}
  assert(::operator new(n,std::align_val_t(a),std::nothrow)==nullptr);
  assert(::operator new[](n,std::align_val_t(a),std::nothrow)==nullptr);
 }
 auto prior=std::set_new_handler(handler);
 try{volatile size_t n=std::numeric_limits<size_t>::max()-31;::operator new(n,std::align_val_t(64));assert(false);}catch(const std::bad_alloc&){}
 std::set_new_handler(prior);
 std::mutex m;std::condition_variable cv;bool ready=false;
 std::thread t([&]{std::lock_guard<std::mutex> l(m);ready=true;cv.notify_one();});
 {std::unique_lock<std::mutex> l(m);cv.wait(l,[&]{return ready;});}t.join();
 assert(std::async(std::launch::async,[]{return 42;}).get()==42);
 std::pmr::synchronized_pool_resource pool;void*p=pool.allocate(128,64);pool.deallocate(p,128,64);
 std::ostringstream s;s<<42;assert(s.str()=="42");
 try{throw std::runtime_error("fixture");}catch(const std::exception&e){assert(std::string(e.what())=="fixture");}
 assert(std::filesystem::exists("/usr/lib"));
 puts("PASS: alignment, scalar/array/nothrow/handler, threads, futures, exceptions, PMR, locale, filesystem");
}
