set -eu
export LD_LIBRARY_PATH=/work/build-expat/lib/.libs
mkdir -p /work/build-python-core
cd /work/build-python-core
CPPFLAGS='-I/work/sources/expat/expat/lib -Wdate-time -D_FORTIFY_SOURCE=2' LDFLAGS='-L/work/build-expat/lib/.libs -Wl,-rpath-link,/work/build-expat/lib/.libs -g -fwrapv -O2' CFLAGS='-g -O2 -fstack-protector-strong -Wformat -Werror=format-security -ffile-prefix-map=/work=.' /work/sources/python/configure --prefix=/usr --libdir=/usr/lib/x86_64-linux-gnu --enable-ipv6 --enable-loadable-sqlite-extensions --with-dbmliborder=bdb:gdbm --with-computed-gotos --without-ensurepip --with-system-expat --with-wheel-pkg-dir=/usr/share/python-wheels/ --with-ssl-default-suites=openssl --with-system-ffi --with-dtrace > /work/logs/python-core-configure.log 2>&1
cp /usr/lib/python3.11/config-3.11-x86_64-linux-gnu/Setup.local Modules/Setup.local
make -j4 python > /work/logs/python-core-build.log 2>&1
LD_LIBRARY_PATH=/work/build-expat/lib/.libs PYTHONPATH=/usr/lib/python3.11 ./python -c 'import sys,pyexpat,_elementtree;print(sys.version);print(sys.builtin_module_names);print(pyexpat.__spec__.origin,_elementtree.__spec__.origin)' > /work/logs/python-core-initial.log 2>&1
