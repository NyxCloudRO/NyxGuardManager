import fs from 'node:fs';
const root='/work/',p=JSON.parse(fs.readFileSync(root+'package.json')),plan=JSON.parse(fs.readFileSync('/npm-upgrades.json'));
// Freeze direct dependencies to the accepted installed versions before targeted upgrades.
for(const name of Object.keys(p.dependencies)){
 const current=JSON.parse(fs.readFileSync(root+'node_modules/'+name+'/package.json')).version;
 p.dependencies[name]=plan[name+'@'+current]||current;
}
for(const [key,target]of Object.entries(plan)){
 const at=key.lastIndexOf('@'),name=key.slice(0,at),current=key.slice(at+1);
 if(!p.dependencies[name]){p.overrides??={};p.overrides[name+'@'+current]=target;}
}
fs.writeFileSync(root+'package.json',JSON.stringify(p,null,2)+'\n');
