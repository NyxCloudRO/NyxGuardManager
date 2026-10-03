const ORDER=Symbol('arrival'),COUNT=Symbol('sequence');
export const newestFirst=(a,b)=>b.ts-a.ts || a[ORDER]-b[ORDER];
// Keep only the exact requested prefix, using a heap with the worst row at its root.
export function keepRecent(heap,event,limit) {
  Object.defineProperty(event,ORDER,{value:heap[COUNT]||0});heap[COUNT]=(heap[COUNT]||0)+1;
  if(heap.length===limit) {
    if(newestFirst(event,heap[0])>=0)return;
    heap[0]=event;
    let i=0;
    for(;;){let child=i*2+1;if(child>=heap.length)break;
      if(child+1<heap.length&&newestFirst(heap[child+1],heap[child])>0)child++;
      if(newestFirst(heap[i],heap[child])>=0)break;
      [heap[i],heap[child]]=[heap[child],heap[i]];i=child;
    }
  } else {
    heap.push(event);let i=heap.length-1;
    while(i>0){const parent=(i-1)>>1;if(newestFirst(heap[i],heap[parent])<=0)break;[heap[i],heap[parent]]=[heap[parent],heap[i]];i=parent;}
  }
}
