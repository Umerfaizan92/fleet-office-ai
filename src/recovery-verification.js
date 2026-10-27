// Recovery remembers the provider that issued the code; deployment changes never switch verification methods.
export const normalizeRecoveryCode=value=>String(value??'').replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?0x660:0x6f0))).replace(/[\s-]/g,'');
export async function verifyRecoveryChallenge(row,code,{verifySms,hash}){
 if(row.verification_provider==='telnyx_verify')return Boolean((await verifySms(row.destination,code)).ok);
 if(!/^\d{6}$/.test(code))return false;
 const crypto=await import('node:crypto');const expected=hash(row.id,code);
 return expected.length===row.code_hash.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(row.code_hash));
}
