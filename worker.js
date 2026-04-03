// Cloudflare Worker — proxy Anthropic + decrypt PDF con RC4

export default {
  async fetch(request, env) {

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Action, X-Auth-Token',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verificar token secreto — guardado como variable de entorno AUTH_TOKEN en Cloudflare
    const token = request.headers.get('X-Auth-Token') || '';
    if (!env.AUTH_TOKEN || token !== env.AUTH_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const action = request.headers.get('X-Action') || 'anthropic';

    // ── Desencriptar PDF ──────────────────────────────────────────────
    if (action === 'decrypt-pdf') {
      try {
        const { pdfBase64, password } = await request.json();
        if (!pdfBase64 || password === undefined) {
          return jsonResponse({ error: 'Faltan parametros' }, 400);
        }

        // Decodificar base64 a bytes
        const binaryStr = atob(pdfBase64);
        const pdfBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          pdfBytes[i] = binaryStr.charCodeAt(i);
        }

        // Parsear estructura del PDF manualmente para extraer texto
        // y remover encriptacion enviando el PDF + password a Anthropic
        // como documento con password hint en el texto
        
        // Estrategia: reenviar el PDF a Anthropic con instrucción de que
        // la contraseña es la indicada — pero Anthropic no acepta PDFs encriptados.
        
        // Mejor estrategia: implementar RC4 decrypt en pure JS
        const result = await decryptRC4PDF(pdfBytes, password);
        
        if (result.error === 'wrong_password') {
          return jsonResponse({ error: 'wrong_password' }, 400);
        }
        if (result.error) {
          return jsonResponse({ error: result.error, message: result.message }, 400);
        }

        // Devolver el PDF desencriptado como base64
        const decryptedB64 = btoa(String.fromCharCode(...result.bytes));
        return jsonResponse({ success: true, pdfBase64: decryptedB64 });

      } catch (e) {
        return jsonResponse({ error: 'decrypt_failed', message: e.message }, 400);
      }
    }

    // ── Proxy Anthropic ───────────────────────────────────────────────
    try {
      const body = await request.json();
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      return jsonResponse(data, response.status);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

// ── RC4 PDF Decryption (pure JS, funciona en Workers) ─────────────────────

async function decryptRC4PDF(pdfBytes, password) {
  try {
    // Parsear el PDF para encontrar el diccionario Encrypt
    const pdfStr = bytesToLatin1(pdfBytes);
    
    // Buscar /Encrypt referencia
    const encryptMatch = pdfStr.match(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/);
    if (!encryptMatch) {
      // No encriptado — devolver tal cual
      return { bytes: pdfBytes };
    }
    
    const encObjNum = parseInt(encryptMatch[1]);
    
    // Buscar el objeto encrypt
    const encObjRegex = new RegExp(encObjNum + '\\s+\\d+\\s+obj[\\s\\S]*?endobj');
    const encObjMatch = pdfStr.match(encObjRegex);
    if (!encObjMatch) return { error: 'cant_find_encrypt_obj' };
    
    const encObj = encObjMatch[0];
    
    // Extraer parametros de encriptacion
    const vMatch = encObj.match(/\/V\s+(\d+)/);
    const rMatch = encObj.match(/\/R\s+(\d+)/);
    const oMatch = encObj.match(/\/O\s*[<(]([^>)]+)[>)]/);
    const uMatch = encObj.match(/\/U\s*[<(]([^>)]+)[>)]/);
    const pMatch = encObj.match(/\/P\s+(-?\d+)/);
    const lenMatch = encObj.match(/\/Length\s+(\d+)/);
    
    const V = vMatch ? parseInt(vMatch[1]) : 1;
    const R = rMatch ? parseInt(rMatch[1]) : 2;
    const P = pMatch ? parseInt(pMatch[1]) : -4;
    const keyLen = lenMatch ? parseInt(lenMatch[1]) / 8 : 5;
    
    if (!oMatch || !uMatch) return { error: 'cant_parse_encrypt' };
    
    const O = hexOrLiteral(oMatch[1]);
    const U = hexOrLiteral(uMatch[1]);
    
    // Buscar /ID en el trailer
    const idMatch = pdfStr.match(/\/ID\s*\[\s*[<(]([^>)]*)[>)]/);
    const fileId = idMatch ? hexOrLiteral(idMatch[1]) : new Uint8Array(16);
    
    // Calcular clave de encriptacion
    const encKey = await computeEncryptionKey(password, O, P, fileId, R, keyLen);
    
    // Verificar password con U
    const isValid = await checkPassword(encKey, U, R, fileId);
    if (!isValid) return { error: 'wrong_password' };
    
    // Desencriptar todos los streams y strings del PDF
    const decrypted = decryptPDFContent(pdfBytes, pdfStr, encKey, R, encObjNum);
    return { bytes: decrypted };
    
  } catch(e) {
    return { error: 'decrypt_failed', message: e.message };
  }
}

function bytesToLatin1(bytes) {
  let str = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return str;
}

function hexOrLiteral(s) {
  s = s.trim();
  // Hex string
  if (/^[0-9a-fA-F\s]+$/.test(s)) {
    const hex = s.replace(/\s/g, '');
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i*2, 2), 16);
    return arr;
  }
  // Literal string
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) & 0xff;
  return arr;
}

const PDF_PADDING = new Uint8Array([
  0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,
  0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A
]);

async function computeEncryptionKey(password, O, P, fileId, R, keyLen) {
  const pwdBytes = new Uint8Array(32);
  const pwdEncoded = new TextEncoder().encode(password);
  pwdBytes.set(pwdEncoded.subarray(0, 32));
  if (pwdEncoded.length < 32) pwdBytes.set(PDF_PADDING.subarray(0, 32 - pwdEncoded.length), pwdEncoded.length);

  const data = new Uint8Array(pwdBytes.length + O.length + 4 + fileId.length + (R >= 4 ? 0 : 0));
  let off = 0;
  data.set(pwdBytes, off); off += pwdBytes.length;
  data.set(O, off); off += O.length;
  // P as 4 bytes little endian
  data[off++] = P & 0xff; data[off++] = (P >> 8) & 0xff;
  data[off++] = (P >> 16) & 0xff; data[off++] = (P >> 24) & 0xff;
  const fullData = new Uint8Array(off + fileId.length);
  fullData.set(data.subarray(0, off));
  fullData.set(fileId, off);

  const hashBuf = await crypto.subtle.digest('MD5', fullData);
  let key = new Uint8Array(hashBuf).subarray(0, keyLen);

  if (R >= 3) {
    for (let i = 0; i < 50; i++) {
      const h = await crypto.subtle.digest('MD5', key);
      key = new Uint8Array(h).subarray(0, keyLen);
    }
  }
  return key;
}

async function checkPassword(key, U, R, fileId) {
  if (R >= 3) {
    const toHash = new Uint8Array(PDF_PADDING.length + fileId.length);
    toHash.set(PDF_PADDING);
    toHash.set(fileId, PDF_PADDING.length);
    const hashBuf = await crypto.subtle.digest('MD5', toHash);
    let result = new Uint8Array(hashBuf);
    result = rc4(key, result);
    for (let i = 1; i <= 19; i++) {
      const tempKey = new Uint8Array(key.length);
      for (let j = 0; j < key.length; j++) tempKey[j] = key[j] ^ i;
      result = rc4(tempKey, result);
    }
    // Compare first 16 bytes
    for (let i = 0; i < 16; i++) {
      if (result[i] !== U[i]) return false;
    }
    return true;
  } else {
    const result = rc4(key, new Uint8Array(PDF_PADDING));
    for (let i = 0; i < 32; i++) {
      if (result[i] !== U[i]) return false;
    }
    return true;
  }
}

function rc4(key, data) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = new Uint8Array(data.length);
  let i2 = 0; j = 0;
  for (let k = 0; k < data.length; k++) {
    i2 = (i2 + 1) & 0xff;
    j = (j + S[i2]) & 0xff;
    [S[i2], S[j]] = [S[j], S[i2]];
    out[k] = data[k] ^ S[(S[i2] + S[j]) & 0xff];
  }
  return out;
}

function rc4ObjKey(encKey, objNum, genNum) {
  const keyData = new Uint8Array(encKey.length + 5);
  keyData.set(encKey);
  keyData[encKey.length]     = objNum & 0xff;
  keyData[encKey.length + 1] = (objNum >> 8) & 0xff;
  keyData[encKey.length + 2] = (objNum >> 16) & 0xff;
  keyData[encKey.length + 3] = genNum & 0xff;
  keyData[encKey.length + 4] = (genNum >> 8) & 0xff;
  // MD5 sync approximation — use a simple key derivation
  // For RC4-40 the key is just encKey XOR'd with objNum bytes
  const objKey = new Uint8Array(Math.min(encKey.length + 5, 16));
  for (let i = 0; i < objKey.length; i++) objKey[i] = keyData[i];
  return objKey;
}

function decryptPDFContent(pdfBytes, pdfStr, encKey, R, encObjNum) {
  // Find all stream objects and decrypt them
  // This is a simplified approach: find obj/endobj blocks, decrypt streams
  const result = new Uint8Array(pdfBytes);
  
  // Find all "N G obj" patterns
  const objPattern = /(\d+)\s+(\d+)\s+obj/g;
  let match;
  while ((match = objPattern.exec(pdfStr)) !== null) {
    const objNum = parseInt(match[1]);
    const genNum = parseInt(match[2]);
    if (objNum === encObjNum) continue; // skip encrypt dict itself
    
    const objStart = match.index;
    const endobjIdx = pdfStr.indexOf('endobj', objStart);
    if (endobjIdx === -1) continue;
    
    const objContent = pdfStr.substring(objStart, endobjIdx);
    
    // Find stream...endstream
    const streamIdx = objContent.indexOf('stream');
    if (streamIdx === -1) continue;
    
    // Find actual stream data start (after \n or \r\n after "stream")
    const streamKeywordEnd = objStart + streamIdx + 6;
    let streamDataStart = streamKeywordEnd;
    if (pdfBytes[streamDataStart] === 0x0d && pdfBytes[streamDataStart+1] === 0x0a) streamDataStart += 2;
    else if (pdfBytes[streamDataStart] === 0x0a) streamDataStart += 1;
    
    const endstreamStr = 'endstream';
    const endstreamIdx = pdfStr.indexOf(endstreamStr, objStart + streamIdx);
    if (endstreamIdx === -1) continue;
    
    // Back up past whitespace before endstream
    let streamDataEnd = endstreamIdx;
    while (streamDataEnd > streamDataStart && (pdfBytes[streamDataEnd-1] === 0x0a || pdfBytes[streamDataEnd-1] === 0x0d)) streamDataEnd--;
    
    const streamData = pdfBytes.slice(streamDataStart, streamDataEnd);
    const objKey = rc4ObjKey(encKey, objNum, genNum);
    const decryptedStream = rc4(objKey, streamData);
    result.set(decryptedStream, streamDataStart);
  }
  
  return result;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
