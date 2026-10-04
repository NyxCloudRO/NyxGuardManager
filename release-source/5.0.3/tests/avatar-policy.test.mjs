import test from 'node:test';import assert from 'node:assert/strict';
import {AVATAR_MAX_BYTES,AVATAR_MIME_TO_EXT,AVATAR_TOO_LARGE,browserAvatarPolicy,detectAvatarImageType} from '../internal/avatar-policy.mjs';
import {pngAtSize,jpegImage,webpImage} from './avatar-fixtures.mjs';

test('one browser/backend avatar policy defines the exact 5 MiB boundary and existing formats',()=>{
  assert.equal(AVATAR_MAX_BYTES,5242880);assert.equal(browserAvatarPolicy.maxBytes,AVATAR_MAX_BYTES);
  assert.equal(AVATAR_TOO_LARGE,'Avatar too large (max 5MB)');
  assert.deepEqual(Object.keys(AVATAR_MIME_TO_EXT),['image/png','image/jpeg','image/webp']);
  for(const size of [0,2*1024*1024,3*1024*1024,AVATAR_MAX_BYTES,AVATAR_MAX_BYTES+1,7*1024*1024]) {
    const image=pngAtSize(size);assert.equal(detectAvatarImageType(image),'png');
    assert.equal(image.length>AVATAR_MAX_BYTES,size>AVATAR_MAX_BYTES);
  }
});
test('renamed text, incomplete image headers, truncated containers and corrupt PNG chunks are rejected',()=>{
  assert.equal(detectAvatarImageType(Buffer.from('not an image.png')),null);
  assert.equal(detectAvatarImageType(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16)])),null);
  const image=pngAtSize();assert.equal(detectAvatarImageType(image.subarray(0,image.length-1)),null);
  const corrupt=Buffer.from(image);corrupt[45]^=1;assert.equal(detectAvatarImageType(corrupt),null);
  assert.equal(detectAvatarImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),null);
});
test('existing JPEG and WebP containers remain supported with malformed boundaries rejected',()=>{
  assert.equal(detectAvatarImageType(jpegImage),'jpg');assert.equal(detectAvatarImageType(webpImage),'webp');
  assert.equal(detectAvatarImageType(jpegImage.subarray(0,jpegImage.length-1)),null);
  const wrongLength=Buffer.from(webpImage);wrongLength.writeUInt32LE(webpImage.length,4);
  assert.equal(detectAvatarImageType(wrongLength),null);
});
