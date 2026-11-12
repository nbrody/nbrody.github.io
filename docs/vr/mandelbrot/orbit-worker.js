/* Reference orbit using the same 256-bit input and adaptive BigInt arithmetic as GOLG. */
self.onmessage = e => {
  const { id, cx, cy, bits, prec, maxIter, bail2 } = e.data;
  const CX = BigInt(cx), CY = BigInt(cy), L = maxIter + 1;
  const o = new Float64Array(2 * L);
  let n = 1, escaped = false;
  if (prec <= 53) {
    const cr = Number(CX) / 2 ** bits, ci = Number(CY) / 2 ** bits;
    let zr = 0, zi = 0;
    for (; n < L; n++) {
      const t = zr*zr - zi*zi + cr; zi = 2*zr*zi + ci; zr = t;
      o[2*n] = zr; o[2*n+1] = zi;
      if (zr*zr + zi*zi > bail2) { escaped = true; n++; break; }
    }
  } else {
    const P = BigInt(prec), P1=P-1n, S=P-60n, sh=BigInt(bits-prec), T60=2**60;
    const cr=CX>>sh, ci=CY>>sh; let zr=0n, zi=0n;
    for (; n < L; n++) {
      const zr2=(zr*zr)>>P, zi2=(zi*zi)>>P;
      zi=((zr*zi)>>P1)+ci; zr=zr2-zi2+cr;
      const a=Number(zr>>S)/T60,b=Number(zi>>S)/T60;
      o[2*n]=a;o[2*n+1]=b;
      if(a*a+b*b>bail2){escaped=true;n++;break;}
    }
  }
  const orbit=o.slice(0,2*n); self.postMessage({id,len:n,escaped,orbit},[orbit.buffer]);
};
