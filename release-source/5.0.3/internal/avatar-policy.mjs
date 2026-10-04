import {crc32} from 'node:zlib';

// This module also generates the browser policy during the image build.
export const AVATAR_MAX_MIB = 5;
export const AVATAR_MAX_BYTES = AVATAR_MAX_MIB * 1024 * 1024;
export const AVATAR_TOO_LARGE = `Avatar too large (max ${AVATAR_MAX_MIB}MB)`;
export const AVATAR_FORMAT_ERROR = 'Avatar must be a PNG, JPEG, or WebP image';
export const AVATAR_MIME_TO_EXT = Object.freeze({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'});
export const browserAvatarPolicy = Object.freeze({maxBytes:AVATAR_MAX_BYTES, maxMiB:AVATAR_MAX_MIB,
  tooLarge:AVATAR_TOO_LARGE, formatsError:AVATAR_FORMAT_ERROR, mimeTypes:Object.keys(AVATAR_MIME_TO_EXT)});

// Validate image container structure, not a filename supplied by the client.
// No SVG/HTML is accepted. This is not a pixel decoder or an image transformer.
export function detectAvatarImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    let offset=8, header=false, data=false;
    while (offset+12<=buf.length) {
      const size=buf.readUInt32BE(offset), end=offset+12+size;
      if(end>buf.length)return null;
      const type=buf.toString('ascii',offset+4,offset+8);
      if(!/^[A-Za-z]{4}$/.test(type) || crc32(buf.subarray(offset+4,end-4))!==buf.readUInt32BE(end-4))return null;
      if(!header) {
        if(type!=='IHDR'||size!==13||!buf.readUInt32BE(offset+8)||!buf.readUInt32BE(offset+12))return null;
        const depth=buf[offset+16],color=buf[offset+17];
        const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
        if(!depths[color]?.includes(depth)||buf[offset+18]!==0||buf[offset+19]!==0||buf[offset+20]>1)return null;
        header=true;
      } else if(type==='IHDR')return null;
      if(type==='IDAT'&&size>0)data=true;
      if(type==='IEND')return size===0&&data&&end===buf.length?'png':null;
      offset=end;
    }
    return null;
  }
  if(buf[0]===255&&buf[1]===216&&buf.at(-2)===255&&buf.at(-1)===217) {
    let offset=2,frame=false;
    while(offset+4<=buf.length) {
      if(buf[offset++]!==255)return null;
      while(buf[offset]===255)offset++;
      const marker=buf[offset++];
      if(marker===217)return null;
      if(marker===1||(marker>=208&&marker<=215))continue;
      if(offset+2>buf.length)return null;
      const size=buf.readUInt16BE(offset);
      if(size<2||offset+size>buf.length)return null;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        if(size<8||!buf.readUInt16BE(offset+3)||!buf.readUInt16BE(offset+5))return null;
        frame=true;
      }
      if(marker===218)return frame&&size>=6&&offset+size<buf.length-2?'jpg':null;
      offset+=size;
    }
    return null;
  }
  if(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP'&&buf.readUInt32LE(4)+8===buf.length) {
    let offset=12,image=false;
    while(offset+8<=buf.length) {
      const type=buf.toString('ascii',offset,offset+4),size=buf.readUInt32LE(offset+4),end=offset+8+size;
      if(end>buf.length)return null;
      if(type==='VP8 ') {
        if(size<10||buf[offset+11]!==157||buf[offset+12]!==1||buf[offset+13]!==42)return null;
        image=true;
      } else if(type==='VP8L') {
        if(size<5||buf[offset+8]!==47)return null;
        image=true;
      } else if(type==='ANMF'&&size>=16)image=true; // Existing animated WebP support.
      offset=end+(size%2);
    }
    return offset===buf.length&&image?'webp':null;
  }
  return null;
}
