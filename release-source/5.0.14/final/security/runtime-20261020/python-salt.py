import sys,io,contextlib,subprocess,os,json
import pyexpat,_elementtree,xml.etree.ElementTree as ET,xml.dom.minidom as MD,xml.sax
assert pyexpat.__spec__.origin == 'built-in'
assert _elementtree.__spec__.origin == 'built-in'
p=pyexpat.ParserCreate();p.Parse(b'<root><child>value</child></root>',True)
p=pyexpat.ParserCreate(namespace_separator='|');p.Parse(b'<x xmlns="urn:nyx">',False);p.Parse(b'content</x>',True)
p=pyexpat.ParserCreate();p.buffer_text=True;p.Parse(b'<root>',False);p.Parse(b'x'*50000,False);p.Parse(b'</root>',True)
try:pyexpat.ParserCreate().Parse(b'<broken>',True)
except pyexpat.ExpatError:pass
else:raise AssertionError('invalid XML accepted')
assert ET.fromstring('<root><x>ok</x></root>')[0].text=='ok'
assert MD.parseString('<root/>').documentElement.tagName=='root'
print('PASS extension imports, streaming, namespaces, buffer expansion, malformed XML, ElementTree, minidom')
