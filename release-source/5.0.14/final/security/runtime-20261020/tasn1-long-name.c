#include <libtasn1.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>
int main(void) {
 char module[ASN1_MAX_NAME_SIZE+1], oid[ASN1_MAX_NAME_SIZE+1], type[ASN1_MAX_NAME_SIZE+30],err[ASN1_MAX_ERROR_DESCRIPTION_SIZE];
 memset(module,'M',ASN1_MAX_NAME_SIZE);module[ASN1_MAX_NAME_SIZE]=0;
 memset(oid,'o',ASN1_MAX_NAME_SIZE);oid[ASN1_MAX_NAME_SIZE]=0;
 FILE *f=fopen("/work/tests/long-name.asn","w");assert(f);
 fprintf(f,"%s DEFINITIONS EXPLICIT TAGS ::= BEGIN\n%s OBJECT IDENTIFIER ::= { 1 2 3 4 }\nPayload ::= INTEGER\nContainer ::= SEQUENCE { kind OBJECT IDENTIFIER, value OCTET STRING }\nEND\n",module,oid);fclose(f);
 asn1_node defs=NULL,elem=NULL;int rc=asn1_parser2tree("/work/tests/long-name.asn",&defs,err);if(rc){printf("parse rc=%d %s\n",rc,err);return 1;}
 snprintf(type,sizeof(type),"%s.Container",module);
 assert(asn1_create_element(defs,type,&elem)==ASN1_SUCCESS);
 assert(asn1_write_value(elem,"kind","1.2.3.4",1)==ASN1_SUCCESS);
 const unsigned char der[]={2,1,1};assert(asn1_write_value(elem,"value",der,sizeof(der))==ASN1_SUCCESS);
 rc=asn1_expand_octet_string(defs,&elem,"value","kind");printf("long-name expansion rc=%d max_name=%d\n",rc,ASN1_MAX_NAME_SIZE);assert(rc==ASN1_SUCCESS);
 asn1_delete_structure(&elem);asn1_delete_structure(&defs);puts("PASS crafted maximal names and ASN.1 octet expansion");
}
