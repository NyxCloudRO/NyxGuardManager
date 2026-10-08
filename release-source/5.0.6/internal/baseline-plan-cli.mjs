import {baselinePlan} from './baseline-acceptance.mjs';
console.log(JSON.stringify(await baselinePlan('/handover-data',JSON.parse(process.env.BASELINE_MANAGER))));
