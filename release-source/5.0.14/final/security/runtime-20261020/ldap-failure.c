#define LDAP_DEPRECATED 1
#include <stdio.h>
#include <ldap.h>
extern int ldap_url_parsehosts(LDAPURLDesc **,const char *,int);
extern void ldap_free_urllist(LDAPURLDesc *);
#include <ldif.h>
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
#include <dlfcn.h>
static int fail_dup, injected;
char *ber_strdup(const char *s) {
 if(fail_dup && (!strcmp(s,"ldap") || !strcmp(s,"/work/tests/missing.txt"))) { injected++; return NULL; }
 static char *(*real)(const char *);if(!real)real=dlsym(RTLD_NEXT,"ber_strdup");assert(real);return real(s);
}
char *ber_strdup_x(const char *s,void *ctx) {
 if(fail_dup && !strcmp(s,"ldap")) { injected++; return NULL; }
 static char *(*real)(const char *,void *);if(!real)real=dlsym(RTLD_NEXT,"ber_strdup_x");assert(real);return real(s,ctx);
}
int main(void){
 LDAPURLDesc *list=NULL;int rc;
 rc=ldap_url_parsehosts(&list,"[::1]:389 ldap.example.test",389);assert(rc==LDAP_SUCCESS);assert(list);ldap_free_urllist(list);list=NULL;
 fail_dup=1;assert(ldif_open_url("file:///work/tests/missing.txt")==NULL);
 rc=ldap_url_parsehosts(&list,"[::1]:389",389);fprintf(stderr,"rc=%d expected=%d injected=%d\n",rc,LDAP_NO_MEMORY,injected);assert(rc==LDAP_NO_MEMORY);assert(!list);assert(injected==2);
 fail_dup=0;rc=ldap_url_parse("ldaps://ldap.example.test:636/dc=example,dc=test?cn?sub?(uid=test)",&list);assert(rc==LDAP_URL_SUCCESS);ldap_free_urldesc(list);
 puts("PASS LDAP IPv6/LDAPS URL parsing and strdup failure handling");
}
