export function managerProcessDuration(seconds) {
  if(!Number.isSafeInteger(seconds)||seconds<0)return 'Unavailable';
  const minutes=Math.floor(seconds/60);
  if(minutes<1)return 'Less than a minute';
  if(minutes<60)return `${minutes} minute${minutes===1?'':'s'}`;
  const hours=Math.floor(minutes/60),remainder=minutes%60;
  if(hours<24)return `${hours} hour${hours===1?'':'s'}`+(remainder?` ${remainder} minute${remainder===1?'':'s'}`:'');
  const days=Math.floor(hours/24),rest=hours%24;
  return `${days} day${days===1?'':'s'}`+(rest?` ${rest} hour${rest===1?'':'s'}`:'');
}
