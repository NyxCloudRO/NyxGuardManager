set -eu
cd /evidence/gcc-source/gcc-12-12.2.0
mkdir -p libstdcxx-posix-build
cd libstdcxx-posix-build
../src/libstdc++-v3/configure --prefix=/usr --libdir=/usr/lib/x86_64-linux-gnu --enable-shared --disable-multilib --enable-threads=posix --enable-clocale=gnu --disable-libstdcxx-debug --disable-libstdcxx-pch --enable-libstdcxx-time=yes --with-default-libstdcxx-abi=new --enable-gnu-unique-object --disable-vtable-verify --enable-cet --host=x86_64-linux-gnu --build=x86_64-linux-gnu CXXFLAGS='-g -O2 -ffile-prefix-map=/evidence/gcc-source/gcc-12-12.2.0=.' CFLAGS='-g -O2'
make -j2
