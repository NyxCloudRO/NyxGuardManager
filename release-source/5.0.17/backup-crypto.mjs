import crypto from 'node:crypto';
// Preserve the existing format and work factor. Node's default 32 MiB scrypt
// allowance cannot run this 128 MiB KDF. Bound it explicitly and admit one job.
const PARAMS=Object.freeze({N:131072,r:8,p:1,maxmem:160*1024*1024});
let deriving=false;
async function derive(passphrase,salt){
 if(deriving)throw Object.assign(new Error('Another encrypted backup operation is active.'),{status:409});
 deriving=true;
 try{return await new Promise((resolve,reject)=>crypto.scrypt(passphrase,salt,32,PARAMS,(error,key)=>error?reject(error):resolve(key)))}
 finally{deriving=false}
}
export async function encryptBackup(jsonString,passphrase){
 const salt=crypto.randomBytes(32),key=await derive(passphrase,salt),iv=crypto.randomBytes(16);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(jsonString,'utf8'),cipher.final()]);
 return JSON.stringify({enc:1,salt:salt.toString('hex'),iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:encrypted.toString('hex')});
}
export async function decryptBackup(encryptedJson,passphrase){
 let parsed;try{parsed=JSON.parse(encryptedJson)}catch{throw Error('Backup file is not valid JSON.')}
 if(parsed?.enc!==1)return {plain:true,parsed};
 if(!passphrase)throw Error('This backup is encrypted. A passphrase is required to import it.');
 const salt=Buffer.from(parsed.salt,'hex'),iv=Buffer.from(parsed.iv,'hex'),tag=Buffer.from(parsed.tag,'hex'),data=Buffer.from(parsed.data,'hex');
 const key=await derive(passphrase,salt),decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 try{return {plain:false,parsed:JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'))}}
 catch{throw Error('Backup decryption failed. Wrong passphrase or corrupted file.')}
}
