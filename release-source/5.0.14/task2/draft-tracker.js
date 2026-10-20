export class DraftTracker {
  constructor(){this.initial=new WeakMap();this.changed=new Map();}
  value(field){
    if(field.type==='checkbox'||field.type==='radio')return field.checked;
    if(field.type==='file')return field.files?.length||0;
    if(field.multiple)return JSON.stringify(Array.from(field.selectedOptions||[],o=>o.value));
    return field.value;
  }
  focus(field){if(!this.initial.has(field))this.initial.set(field,this.value(field));}
  change(field){
    if(!this.initial.has(field))this.initial.set(field,field.type==='checkbox'||field.type==='radio'?field.defaultChecked:field.type==='file'?0:field.defaultValue??'');
    if(this.value(field)!==this.initial.get(field))this.changed.set(field,true);else this.changed.delete(field);
  }
  hasChanges(){
    for(const field of this.changed.keys())if(!field.isConnected||this.value(field)===this.initial.get(field))this.changed.delete(field);
    return this.changed.size>0;
  }
  reset(){this.initial=new WeakMap();this.changed.clear();}
}
