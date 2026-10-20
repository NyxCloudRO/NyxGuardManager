import socket,threading,subprocess,os
srv=socket.socket();srv.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);srv.bind(('127.0.0.1',13891));srv.listen()
def serve():
 c,_=srv.accept();data=c.recv(4096);assert data[0]==0x30;assert b'cn=test' in data and b'test' in data
 # LDAPMessage(messageID=1, bindResponse(success, empty matchedDN/diagnostic)).
 c.sendall(bytes.fromhex('300c02010161070a010004000400'));c.recv(4096);c.close();srv.close()
t=threading.Thread(target=serve);t.start();subprocess.run(['/work/tests/ldap-bind'],env={**os.environ,'LD_LIBRARY_PATH':'/work/build-openldap/libraries/libldap/.libs:/work/build-openldap/libraries/liblber/.libs'},check=True);t.join(timeout=3)
