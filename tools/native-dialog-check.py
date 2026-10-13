#!/usr/bin/env python3
"""Dependency-free JS token audit of application-owned browser dialog references.

Checks direct/bare calls, browser aliases, static computed members, destructuring,
wrappers and explicit eval/Function strings. Strings/comments/regexes are not code.
Unresolved computed browser accesses are separately reported for manual review;
this is a regression guard, not a claim to resolve arbitrary generated JavaScript.
"""
import argparse, dataclasses, json, pathlib, re, sys
NATIVE={'alert','confirm','prompt'}
BROWSER={'window','globalThis','self'}
@dataclasses.dataclass
class Token:
    kind:str
    value:str
    offset:int

def tokens(source, start=0):
    out=[];i=0;identifier=re.compile(r'[A-Za-z_$][\w$]*|\d+(?:\.\d+)?')
    while i<len(source):
        c=source[i]
        if c.isspace():i+=1;continue
        if source.startswith('//',i):
            end=source.find('\n',i);i=len(source) if end<0 else end;continue
        if source.startswith('/*',i):
            end=source.find('*/',i+2);i=len(source) if end<0 else end+2;continue
        if c in '\"\'`':
            quote=c;begin=i;i+=1;value=''
            while i<len(source):
                if source[i]=='\\' and i+1<len(source):value+=source[i:i+2];i+=2;continue
                if source[i]==quote:i+=1;break
                if quote=='`' and source.startswith('${',i):
                    # Tokenize expressions within template strings, including nested braces.
                    depth=1;expr=i+2;j=expr;inner_quote=None
                    while j<len(source) and depth:
                        ch=source[j]
                        if inner_quote:
                            if ch=='\\':j+=2;continue
                            if ch==inner_quote:inner_quote=None
                        elif ch in '\"\'`':inner_quote=ch
                        elif ch=='{':depth+=1
                        elif ch=='}':depth-=1
                        j+=1
                    out.extend(tokens(source[expr:j-1],start+expr));i=j;value+='${…}';continue
                value+=source[i];i+=1
            value=re.sub(r'\\u([\da-fA-F]{4})|\\x([\da-fA-F]{2})',lambda m:chr(int(m[1] or m[2],16)),value)
            out.append(Token('string',value,start+begin));continue
        if c=='/' and (not out or out[-1].value in {'=','(',':',',','[','!','return','case','=>','&&','||','?'}):
            begin=i;i+=1;inside=False
            while i<len(source):
                if source[i]=='\\':i+=2;continue
                if source[i]=='[':inside=True
                elif source[i]==']':inside=False
                elif source[i]=='/' and not inside:
                    i+=1
                    while i<len(source) and source[i].isalpha():i+=1
                    break
                i+=1
            out.append(Token('regex','',start+begin));continue
        m=identifier.match(source,i)
        if m:
            value=m[0];out.append(Token('identifier' if not value[0].isdigit() else 'number',value,start+i));i+=len(value);continue
        op=next((x for x in ['?.','=>','===','!==','&&','||','==','!=','++','--','...'] if source.startswith(x,i)),c)
        out.append(Token('punct',op,start+i));i+=len(op)
    return out

def audit(source):
    ts=tokens(source);matches={};stack=[]
    for i,t in enumerate(ts):
        if t.value in {'(','[','{'}:stack.append(i)
        elif t.value in {')',']','}'} and stack:
            begin=stack.pop();matches[begin]=i;matches[i]=begin
    parents=[None];bindings=[{}];scopes=[];active=[0]
    for t in ts:
        scopes.append(active[-1])
        if t.value=='{':parents.append(active[-1]);bindings.append({});active.append(len(parents)-1)
        elif t.value=='}' and len(active)>1:active.pop()
    def binding(name,scope):
        while scope is not None:
            if name in bindings[scope]:return True,bindings[scope][name]
            scope=parents[scope]
        return False,None
    def browser(i):
        if i>=len(ts):return False
        found,value=binding(ts[i].value,scopes[i])
        if found:return value==('browser',None)
        if ts[i].value in BROWSER:return True
        return i+2<len(ts) and ts[i].value=='document' and ts[i+1].value in {'.','?.'} and ts[i+2].value=='defaultView'
    def constant(begin,end):
        values=[]
        for j in range(begin,end):
            t=ts[j]
            if t.value=='+':continue
            if t.kind=='string':values.append(t.value)
            elif t.kind=='identifier':
                found,value=binding(t.value,scopes[j])
                if not found or not value or value[0]!='string':return None
                values.append(value[1])
            else:return None
        return ''.join(values) if values else None
    # Register lexical declarations and function parameters before reference checks.
    for i,t in enumerate(ts):
        if t.value in {'const','let','var','function','class'} and i+1<len(ts) and ts[i+1].kind=='identifier':
            bindings[scopes[i]][ts[i+1].value]=None
        if t.value=='{' and i:
            prev=i-1
            if ts[prev].value=='=>':prev-=1
            if ts[prev].value==')' and prev in matches:
                begin=matches[prev];before=ts[max(0,begin-3):begin]
                function=any(x.value=='function' for x in before) or ts[i-1].value=='=>'
                if function:
                    child=scopes[i+1] if i+1<len(ts) else scopes[i]
                    for parameter in ts[begin+1:prev]:
                        if parameter.kind=='identifier':bindings[child][parameter.value]=None
            elif ts[i-1].value=='=>' and prev>=0 and ts[prev].kind=='identifier':
                bindings[scopes[i+1]][ts[prev].value]=None
    # Resolve simple browser/string aliases, including comma-separated declarations.
    for _ in range(3):
        for i,t in enumerate(ts[:-2]):
            if t.kind!='identifier' or ts[i+1].value!='=':continue
            found,_=binding(t.value,scopes[i])
            if not found:continue
            value=('browser',None) if browser(i+2) else ('string',ts[i+2].value) if ts[i+2].kind=='string' else None
            if value:bindings[scopes[i]][t.value]=value
    violations=[];dynamic=[]
    def add(t,kind):violations.append({'offset':t.offset,'kind':kind})
    for i,t in enumerate(ts):
        if browser(i):
            member=i+3 if t.value=='document' else i+1
            if member+1<len(ts) and ts[member].value in {'.','?.'} and ts[member+1].value in NATIVE:add(t,'browser dialog reference')
            elif member<len(ts) and ts[member].value=='[' and member in matches:
                end=matches[member];name=constant(member+1,end)
                if name in NATIVE:add(t,'computed browser dialog reference')
                elif name is None:dynamic.append({'offset':t.offset,'kind':'unresolved computed browser member'})
        if t.value in NATIVE and i+1<len(ts) and ts[i+1].value=='(':
            previous=ts[i-1].value if i else ''
            end=matches.get(i+1);method=end is not None and end+1<len(ts) and ts[end+1].value=='{'
            local,_=binding(t.value,scopes[i])
            if previous not in {'.','?.','function'} and not method and not local:add(t,'bare native dialog call')
        if t.value=='{' and i in matches:
            end=matches[i]
            if end+2<len(ts) and ts[end+1].value=='=' and browser(end+2):
                for key in ts[i+1:end]:
                    if key.value in NATIVE:add(key,'destructured native dialog reference')
        if t.value=='get' and i>=2 and ts[i-2].value=='Reflect' and i+4<len(ts) and ts[i+1].value=='(' and browser(i+2) and ts[i+3].value==',' and ts[i+4].value in NATIVE:add(t,'reflected native dialog reference')
        if t.value in {'eval','Function'} and i+2<len(ts) and ts[i+1].value=='(' and ts[i+2].kind=='string':
            if re.search(r'\b(?:window\s*\.\s*)?(?:confirm|alert|prompt)\s*\(',ts[i+2].value):add(t,'generated native dialog code')
    return violations,dynamic

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('paths',nargs='+',type=pathlib.Path);parser.add_argument('--json',type=pathlib.Path);args=parser.parse_args();findings=[];reviews=[];files=[]
    for path in args.paths:
        files.extend([path] if path.is_file() else sorted(x for x in path.rglob('*') if x.suffix in {'.js','.mjs','.jsx','.ts','.tsx'}))
    for path in files:
        violations,dynamic=audit(path.read_text());findings.extend({'file':str(path),**v} for v in violations);reviews.extend({'file':str(path),**v} for v in dynamic)
    result={'filesChecked':len(files),'nativeDialogReferences':findings,'computedMembersForManualReview':reviews}
    if args.json:args.json.write_text(json.dumps(result,indent=2)+'\n')
    print(f'Native dialog guard: {len(files)} files, {len(findings)} native references, {len(reviews)} computed browser members for manual review')
    if findings:
        for finding in findings:print(f"{finding['file']}:{finding['offset']}: {finding['kind']}")
    return bool(findings)
if __name__=='__main__':sys.exit(main())
