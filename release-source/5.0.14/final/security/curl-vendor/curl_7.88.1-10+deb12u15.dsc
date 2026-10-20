-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

Format: 3.0 (quilt)
Source: curl
Binary: curl, libcurl4, libcurl3-gnutls, libcurl3-nss, libcurl4-openssl-dev, libcurl4-gnutls-dev, libcurl4-nss-dev, libcurl4-doc
Architecture: any all
Version: 7.88.1-10+deb12u15
Maintainer: Alessandro Ghedini <ghedo@debian.org>
Uploaders: Samuel Henrique <samueloph@debian.org>, Sergio Durigan Junior <sergiodj@debian.org>
Homepage: https://curl.se/
Standards-Version: 4.6.2
Vcs-Browser: https://salsa.debian.org/debian/curl
Vcs-Git: https://salsa.debian.org/debian/curl.git
Testsuite: autopkgtest
Testsuite-Triggers: @builddeps@, gcc, libc-dev, libcurl-dev, libldap-dev, pkgconf, slapd
Build-Depends: debhelper-compat (= 13), autoconf, automake, ca-certificates, dh-exec, groff-base, libbrotli-dev, libgnutls28-dev, libidn2-dev, libkrb5-dev, libldap2-dev, libnghttp2-dev, libnss3-dev, libpsl-dev, librtmp-dev, libssh-dev, libssh2-1-dev, libssl-dev, libtool, libzstd-dev, locales-all <!nocheck>, openssh-server <!nocheck>, python3:native <!nocheck>, python3-impacket <!nocheck>, gnutls-bin [amd64 arm64 armel armhf i386 mips64el mipsel s390x powerpc ppc64 riscv64] <!nocheck>, quilt, stunnel4 <!nocheck>, zlib1g-dev, nss-plugin-pem <!nocheck>
Build-Conflicts: autoconf2.13, automake1.4
Package-List:
 curl deb web optional arch=any
 libcurl3-gnutls deb libs optional arch=any
 libcurl3-nss deb libs optional arch=any
 libcurl4 deb libs optional arch=any
 libcurl4-doc deb doc optional arch=all
 libcurl4-gnutls-dev deb libdevel optional arch=any
 libcurl4-nss-dev deb libdevel optional arch=any
 libcurl4-openssl-dev deb libdevel optional arch=any
Checksums-Sha1:
 6ae5229c36badb822641bb14958e7d227c57611d 4343562 curl_7.88.1.orig.tar.gz
 9222035242431a3ef31d33a2ca3d881bcf4572fe 488 curl_7.88.1.orig.tar.gz.asc
 03b665ea82b1f319f6944c9473c8c9fd9980838b 87732 curl_7.88.1-10+deb12u15.debian.tar.xz
Checksums-Sha256:
 cdb38b72e36bc5d33d5b8810f8018ece1baa29a8f215b4495e495ded82bbf3c7 4343562 curl_7.88.1.orig.tar.gz
 7a5a55d7123149a1b357f298cf895bd0a601e3a2807005ef6c95f3752803485f 488 curl_7.88.1.orig.tar.gz.asc
 961b78bc48492c5693e4decb352ddd176f343260a8956f48b2887874048ef23b 87732 curl_7.88.1-10+deb12u15.debian.tar.xz
Files:
 1211d641ae670cebce361ab6a7c6acff 4343562 curl_7.88.1.orig.tar.gz
 08b846caa2ce56ccb4b4caa268b30dc2 488 curl_7.88.1.orig.tar.gz.asc
 71138351fd59969b2b8e79b44705a4a2 87732 curl_7.88.1-10+deb12u15.debian.tar.xz

-----BEGIN PGP SIGNATURE-----

iQIzBAEBCgAdFiEEBdtqg34QX0sdAsVfu6n6rcz7RwcFAmpAymIACgkQu6n6rcz7
Rwe2yQ/9GF9d27566xEX77yvma4zIjjyWrPm1nvXoyMBR7H6w+RknRcZYD+7BIqK
Ifiz3srbPKrvdnnnL3BeguPq+gGJ3pr30vCtBwuYHingqO2aq06GcqjC0B5mZsKn
5wzs/Ilih4G0NXQHvzNDQWKoxkXABg5D7rOuRlPiR+CX+wpRpewJ++TEQogFuehS
sp7Q0oVycN6wcCmOvukAgb2T7iElXwcv534wE5z13GzOYuQyNsB+dPX5LNXftMyC
T9waCrRzbCGeME0W5QgopRuYdYU+vmcza8xeIA1TP3yEkAA9+4VJ9r4DnBHw6m1j
xr7fHDDyqsaA0E336m/qPTMJOuaAtbrLEioLsez7+Rf8cw4lPp3UrxtG1Nq6YTYA
L7BE6H6xOQtrm+5vIJUk5IrR4fNtcMvT44YrKf3GgCGFaTgWppQoyqXmsjw8uzEB
KzDXYDJGiGF+Xeu100Vcw6osH0CI7tgK3Dc62dro4+DORHftX7e3gj9SvLW8XJ+o
HTn/VAS79H6wE6avxBjB//XhWtdp4w4hhBY0FlmeUUa4xUwWgbDppYic+GQAl6Lk
0eC4l5LJ6dx5WiEI4PD1zjcSPy7RBe+sVcZdF2RYiTXvoU8bP6MyNTIhsbQ69dI+
l8SrV46gaIzj9WelmZJhEQ3sQ/zgtEJAoNfTXbY3NN4Kiyq9H/Y=
=8RY0
-----END PGP SIGNATURE-----
