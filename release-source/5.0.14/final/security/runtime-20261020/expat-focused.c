#include <expat.h>
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
static void check_capacity(void) {
 for (int final=0;final<2;final++) {
  XML_Parser p=XML_ParserCreate(NULL);assert(p);
  assert(XML_ParseBuffer(p,10,final)==XML_STATUS_ERROR);
  assert(XML_GetErrorCode(p)==XML_ERROR_NO_BUFFER);
  void *b=XML_GetBuffer(p,10);assert(b);
  assert(XML_ParseBuffer(p,-1,final)==XML_STATUS_ERROR);
  assert(XML_GetErrorCode(p)==XML_ERROR_INVALID_ARGUMENT);
  assert(XML_ParseBuffer(p,10000,final)==XML_STATUS_ERROR);
  assert(XML_GetErrorCode(p)==XML_ERROR_INVALID_ARGUMENT);
#ifdef XML_UNICODE
  const char text[]={'<',0,'r',0,'>',0,'<',0,'/',0,'r',0,'>',0};
#else
  const char text[]="<r></r>";
#endif
  const int len=sizeof(text)
#ifndef XML_UNICODE
   -1
#endif
   ;
  memcpy(b,text,len);
  assert(XML_ParseBuffer(p,len,XML_FALSE)==XML_STATUS_OK);
  assert(XML_ParseBuffer(p,10000,final)==XML_STATUS_ERROR);
  assert(XML_GetErrorCode(p)==XML_ERROR_INVALID_ARGUMENT);
  assert(XML_ParseBuffer(p,0,XML_TRUE)==XML_STATUS_OK);
  XML_ParserFree(p);
 }
}
static void check_salt(void) {
 uint8_t entropy[16]={0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15};
 XML_Parser p=XML_ParserCreate(NULL);assert(p);
 assert(!XML_SetHashSalt16Bytes(NULL,entropy));assert(!XML_SetHashSalt16Bytes(p,NULL));
 assert(XML_SetHashSalt16Bytes(p,entropy));assert(XML_SetHashSalt16Bytes(p,entropy));
 assert(XML_Parse(p,"",0,XML_FALSE)==XML_STATUS_OK);
 assert(!XML_SetHashSalt16Bytes(p,entropy));
 assert(XML_ParserReset(p,NULL));assert(XML_SetHashSalt16Bytes(p,entropy));
 XML_Parser child=XML_ExternalEntityParserCreate(p,NULL,NULL);assert(child);
 assert(XML_SetHashSalt16Bytes(child,entropy));
 assert(XML_Parse(p,"",0,XML_FALSE)==XML_STATUS_OK);
 assert(!XML_SetHashSalt16Bytes(child,entropy));
 XML_ParserFree(child);XML_ParserFree(p);
}
static int starts;
static void XMLCALL on_start(void *data,const XML_Char *name,const XML_Char **attrs) {
 (void)data;(void)attrs;assert(name[0]=='r' || name[0]=='c');starts++;
}
static void check_stream(void) {
 XML_Parser p=XML_ParserCreate(NULL);assert(p);XML_SetStartElementHandler(p,on_start);
 assert(XML_Parse(p,"<root><child>",13,XML_FALSE)==XML_STATUS_OK);
 assert(XML_Parse(p,"value</child></root>",(int)strlen("value</child></root>"),XML_TRUE)==XML_STATUS_OK);
 assert(starts==2);XML_ParserFree(p);
}
int main(void){check_capacity();check_salt();check_stream();puts("PASS capacity initial/subsequent final/nonfinal negative/no-buffer; salt API/reset/child/legacy upstream suite");}
