(function(root){
  // Availability comes from the updater's reconciled semver comparison.
  // Do not infer updates from a version string, a failed fetch or stale cache.
  function presentation(status,{error=false,checking=false,now=Date.now()}={}) {
    const current=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
    const stable=/^\d+\.\d+\.\d+$/;
    if(checking||status?.stage==='checking')return {state:'checking',available:false,label:'Checking updates…'};
    const checked=Date.parse(status?.lastCheckAt||'');
    if(error||!status||!current.test(status.current||'')||!stable.test(status.latestPublished||'')||
      !Number.isFinite(checked)||now-checked>12*60*60*1000||checked>now+300000||status.lastCheckError||
      status.recoveryRequired||status.stage==='recovery_required'||typeof status.updateAvailable!=='boolean')
      return {state:'unknown',available:false,label:'Check unavailable'};
    if(status.updateAvailable){
      if(status.latestCompatible!==true||!stable.test(status.latest||'')||status.latest!==status.latestPublished)return {state:'unknown',available:false,label:'Check unavailable'};
      return {state:'available',available:true,label:'Update available v'+status.latest};
    }
    return {state:'current',available:false,label:status.current===status.latestPublished?'Up to date':'No newer stable release'};
  }
  root.NyxUpdatePresentation=presentation;
})(typeof window==='undefined'?globalThis:window);
