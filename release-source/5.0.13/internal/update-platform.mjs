// Reuse metadata already returned by the existing bounded Docker tag check.
// Preparation still enforces the existing release-policy and recovery guards.
export function compatibleDockerPlatform(tag,{arch=process.arch,platform=process.platform}={}){
 const architecture={x64:'amd64',arm64:'arm64',arm:'arm'}[arch]||arch;
 return platform==='linux'&&Array.isArray(tag?.images)&&tag.images.some(image=>image?.os==='linux'&&image.architecture===architecture&&image.status==='active');
}

export function verifiedCachedPlatform(state){
 return typeof state?.lastCheckAt==='string'&&Number.isFinite(Date.parse(state.lastCheckAt))&&typeof state.latestPlatform?.compatible==='boolean'&&state.latestPlatform.version===state.latestVersion&&state.latestPlatform.checkedAt===state.lastCheckAt;
}
