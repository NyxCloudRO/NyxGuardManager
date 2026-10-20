#include <ldap.h>
#include <assert.h>
#include <stdio.h>
int main(void){LDAP *ld=NULL;int v=LDAP_VERSION3;assert(ldap_initialize(&ld,"ldap://127.0.0.1:13891")==LDAP_SUCCESS);assert(ldap_set_option(ld,LDAP_OPT_PROTOCOL_VERSION,&v)==LDAP_OPT_SUCCESS);struct berval cred={4,"test"};int rc=ldap_sasl_bind_s(ld,"cn=test",LDAP_SASL_SIMPLE,&cred,NULL,NULL,NULL);printf("LDAP bind rc=%d\n",rc);assert(rc==LDAP_SUCCESS);ldap_unbind_ext_s(ld,NULL,NULL);puts("PASS local LDAP simple authentication contract");}
