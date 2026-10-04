import {crc32,deflateSync} from 'node:zlib';

function chunk(type,data) {
  const size=Buffer.alloc(4);size.writeUInt32BE(data.length);
  const payload=Buffer.concat([Buffer.from(type),data]),crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([size,payload,crc]);
}
// Valid PNG ancillary text grows a tiny synthetic image to an exact file size.
// No private photos or multi-megabyte binaries are checked into the repository.
export function pngAtSize(size=0,color=[20,120,180,255]) {
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
  const parts=[Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,...color])))];
  const end=chunk('IEND',Buffer.alloc(0)),base=Buffer.concat([...parts,end]);
  if(!size)return base;
  const extra=size-base.length-12;if(extra<8)throw Error('PNG fixture size must allow a valid text chunk');
  const text=Buffer.alloc(extra,65);Buffer.from('Comment\0').copy(text);
  return Buffer.concat([...parts,chunk('tEXt',text),end]);
}

export const jpegImage=Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDAooor6o+OP//Z",'base64');
export const webpImage=Buffer.from("UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoQABAAAUAmJaACdLoB+AADsAD+7v+f/nEsdTu7s//ppHjSPGkfKaAA",'base64');
