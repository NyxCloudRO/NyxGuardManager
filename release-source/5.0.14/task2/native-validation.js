// Keep native HTML constraints and browser behavior; localize their application-facing messages.
export function nativeValidationMessage(field,i18n){
 const v=field.validity,message=(id,values)=>i18n.message(id,values);
 if(v.badInput)return message(field.type==='number'?"ui.1870d8b7fab388f0":"ui.af149da1ab28ea03");
 if(v.valueMissing)return message('error.required');
 if(v.typeMismatch)return message(field.type==='email'?'error.invalid-email':field.type==='url'?"ui.cabf6d7c0fe283fb":"ui.af149da1ab28ea03");
 if(v.tooShort)return message('error.min-character-length',{min:field.minLength});
 if(v.tooLong)return message('error.max-character-length',{max:field.maxLength});
 if(v.patternMismatch)return message("ui.9e7624e16b8a84c1");
 const limit=value=>['number','range'].includes(field.type)&&Number.isFinite(Number(value))?i18n.number(Number(value)):value;
 if(v.rangeUnderflow)return message('error.minimum',{min:limit(field.min)});
 if(v.rangeOverflow)return message('error.maximum',{max:limit(field.max)});
 if(v.stepMismatch)return message("ui.53f4af85b4dc10f0");
 return '';
}
export function installNativeValidation(i18n,root=document){
 const localized=new WeakSet();
 const clear=field=>{if(localized.has(field)){field.setCustomValidity('');localized.delete(field)}};
 root.addEventListener('invalid',event=>{
  const field=event.target;if(!field?.validity||typeof field.setCustomValidity!=='function'||field.validity.customError&&!localized.has(field))return;
  const message=nativeValidationMessage(field,i18n);field.setCustomValidity(message);if(message)localized.add(field);else localized.delete(field);
 },true);
 for(const type of ['input','change'])root.addEventListener(type,event=>clear(event.target),true);
 root.addEventListener('reset',event=>{for(const field of event.target.elements||[])clear(field)},true);
}
