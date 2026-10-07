export function assertUpdateTarget(image,target,current) {
  if(!/^\d+\.\d+\.\d+$/.test(target||'')||!/^\d+\.\d+\.\d+$/.test(current||''))throw new Error('Unsupported runtime version identity');
  const a=target.split('.').map(Number),b=current.split('.').map(Number);
  const difference=a.findIndex((value,index)=>value!==b[index]);
  if(difference<0||a[difference]<b[difference])throw new Error('Activation would repeat or downgrade the current runtime');
  const env=Object.fromEntries((image.Config?.Env||[]).map(value=>{const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)];}));
  if(image.Config?.Labels?.['org.opencontainers.image.version']!==target||env.NPM_BUILD_VERSION!==target)
    throw new Error('Downloaded artifact version differs from intended target');
}
