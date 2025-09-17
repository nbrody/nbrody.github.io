
// Math Helper - Complex numbers and matrix operations

class Complex {
    constructor(re = 0, im = 0) {
        this.re = re;
        this.im = im;
    }

    add(z) {
        return new Complex(this.re + z.re, this.im + z.im);
    }

    sub(z) {
        return new Complex(this.re - z.re, this.im - z.im);
    }

    mul(z) {
        return new Complex(
            this.re * z.re - this.im * z.im,
            this.re * z.im + this.im * z.re
        );
    }

    div(z) {
        const denom = z.re * z.re + z.im * z.im;
        if (denom === 0) return new Complex(Infinity, Infinity);
        return new Complex(
            (this.re * z.re + this.im * z.im) / denom,
            (this.im * z.re - this.re * z.im) / denom
        );
    }

    conjugate() {
        return new Complex(this.re, -this.im);
    }

    normSq() {
        return this.re * this.re + this.im * this.im;
    }

    abs() {
        return Math.sqrt(this.normSq());
    }

    toString() {
        const formatNum = (x) => {
            if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
            return String(parseFloat(x.toFixed(6)));
        };
        const reZero = Math.abs(this.re) < 1e-9;
        const imZero = Math.abs(this.im) < 1e-9;

        if (imZero) return formatNum(this.re);
        if (reZero) {
            const coeff = this.im === 1 ? '' : this.im === -1 ? '-' : formatNum(this.im);
            return `${coeff}i`;
        }

        const rePart = formatNum(this.re);
        const imAbs = Math.abs(this.im);
        const imPart = imAbs === 1 ? 'i' : `${formatNum(imAbs)}i`;
        const sign = this.im < 0 ? '-' : '+';
        return `${rePart} ${sign} ${imPart}`;
    }
}

class Matrix2 {
    constructor(a, b, c, d) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
    }

    multiply(m) {
        return new Matrix2(
            this.a.mul(m.a).add(this.b.mul(m.c)),
            this.a.mul(m.b).add(this.b.mul(m.d)),
            this.c.mul(m.a).add(this.d.mul(m.c)),
            this.c.mul(m.b).add(this.d.mul(m.d))
        );
    }

    inverse() {
        const det = this.a.mul(this.d).sub(this.b.mul(this.c));
        if (det.normSq() === 0) return null;
        const invDet = new Complex(1, 0).div(det);
        return new Matrix2(
            this.d.mul(invDet),
            this.b.mul(new Complex(-1, 0)).mul(invDet),
            this.c.mul(new Complex(-1, 0)).mul(invDet),
            this.a.mul(invDet)
        );
    }

    isIdentity() {
        return Math.abs(this.a.re - 1) < 1e-9 && Math.abs(this.a.im) < 1e-9 &&
            Math.abs(this.b.re) < 1e-9 && Math.abs(this.b.im) < 1e-9 &&
            Math.abs(this.c.re) < 1e-9 && Math.abs(this.c.im) < 1e-9 &&
            Math.abs(this.d.re - 1) < 1e-9 && Math.abs(this.d.im) < 1e-9;
    }

    trace() {
        return this.a.add(this.d);
    }

    neg() {
        const minus = new Complex(-1, 0);
        return new Matrix2(
            this.a.mul(minus), this.b.mul(minus),
            this.c.mul(minus), this.d.mul(minus)
        );
    }
}

function parseComplex(str) {
    let s = str.trim().replace(/\s/g, '').toLowerCase();
    if (s.length === 0) return new Complex(0, 0);
    s = s.replace(/^i$/, '1i').replace(/^-i$/, '-1i').replace(/\+i$/, '+1i').replace(/-i$/, '-1i');
    let real = 0, imag = 0;
    const terms = s.match(/[+-]?(?:[^+-]+)/g) || [];
    for (const term of terms) {
        if (term.endsWith('i')) {
            const coeffStr = term.substring(0, term.length - 1);
            imag += parseFloat(coeffStr === '' || coeffStr === '+' ? '1' : (coeffStr === '-' ? '-1' : coeffStr));
        } else if (term.includes('sqrt')) {
            const numMatch = term.match(/sqrt\(([^)]+)\)/);
            if (numMatch && numMatch[1]) {
                real += (term.startsWith('-') ? -1 : 1) * Math.sqrt(parseFloat(numMatch[1]));
            }
        } else {
            real += parseFloat(term);
        }
    }
    return new Complex(real, imag);
}

function latexToExpr(latex) {
    if (!latex || typeof latex !== 'string') return '0';
    let parserString = String(latex);

    parserString = parserString.replace(/\\left|\\right/g, '');
    parserString = parserString.replace(/\u2212/g, '-');
    parserString = parserString.replace(/\\mathrm\{?i\}?/g, 'i');
    parserString = parserString.replace(/\\operatorname\{?i\}?/g, 'i');

    parserString = parserString.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1)/($2)');
    parserString = parserString.replace(/\\sqrt\[(.+?)\]\{(.+?)\}/g, 'nthRoot($2, $1)');
    parserString = parserString.replace(/\\sqrt\{(.+?)\}/g, 'sqrt($1)');
    parserString = parserString.replace(/x_\{(.+?)\}/g, 'x$1');
    parserString = parserString.replace(/x_(\d+)/g, 'x$1');
    parserString = parserString.replace(/\\(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)h?\((.*?)\)/g, '$1($2)');
    parserString = parserString.replace(/\\log_\{(.+?)\}\((.+?)\)/g, 'log($2, $1)');
    parserString = parserString.replace(/\\ln\((.+?)\)/g, 'log($1)');
    parserString = parserString.replace(/\\pi/g, 'pi');
    parserString = parserString.replace(/\\times/g, '*');
    parserString = parserString.replace(/\\div/g, '/');
    parserString = parserString.replace(/e\^\{(.+?)\}/g, 'exp($1)');
    parserString = parserString.replace(/\\left\|(.+?)\\right\|/g, 'abs($1)');
    parserString = parserString.replace(/\^\{(.+?)\}/g, '^($1)');
    parserString = parserString.replace(/\\left\(/g, '(');
    parserString = parserString.replace(/\\right\)/g, ')');
    parserString = parserString.replace(/\*\*/g, '^');

    return parserString.trim();
}

function evalComplexExpression(expr) {
    try {
        if (typeof expr !== 'string') expr = String(expr || '0');
        expr = expr.replace(/\u2212/g, '-');
        const val = math.evaluate(expr);

        function toComplex(v) {
            if (v == null) return new Complex(0, 0);
            if (typeof v === 'object' && typeof v.re === 'number' && typeof v.im === 'number') {
                return new Complex(v.re, v.im);
            }
            if (typeof v === 'object' && typeof v.valueOf === 'function') {
                const num = Number(v.valueOf());
                if (!Number.isNaN(num)) return new Complex(num, 0);
            }
            if (typeof v === 'number') return new Complex(v, 0);
            if (typeof v === 'string') {
                const n = Number(v);
                if (!Number.isNaN(n)) return new Complex(n, 0);
            }
            return new Complex(NaN, NaN);
        }

        return toComplex(val);
    } catch (e) {
        return new Complex(NaN, NaN);
    }
}

function isClose(x, y, tol = 1e-6) {
    return Math.abs(x - y) < tol;
}

function isZero(z, tol = 1e-6) {
    return Math.abs(z.re) < tol && Math.abs(z.im) < tol;
}

function isUnitary(m, tol = 1e-6) {
    const n1 = m.a.normSq() + m.c.normSq();
    const n2 = m.b.normSq() + m.d.normSq();
    const ab = m.a.mul(m.b.conjugate());
    const cd = m.c.mul(m.d.conjugate());
    const ip = new Complex(ab.re + cd.re, ab.im + cd.im);
    const det = m.a.mul(m.d).sub(m.b.mul(m.c));
    return isClose(n1, 1, tol) && isClose(n2, 1, tol) && isZero(ip, tol) &&
        isClose(det.re, 1, tol) && Math.abs(det.im) < tol;
}

function matrixToString(m) {
    const a = m.a.toString(), b = m.b.toString(), c = m.c.toString(), d = m.d.toString();
    return `[[${a}, ${b}],\n [${c}, ${d}]]`;
}

function complexToLatex(z) {
    const re = Math.abs(z.re) < 1e-9 ? 0 : z.re;
    const im = Math.abs(z.im) < 1e-9 ? 0 : z.im;
    const fmt = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(parseFloat(v.toFixed(6))));
    if (im === 0) return fmt(re);
    if (re === 0) return im === 1 ? 'i' : (im === -1 ? '-i' : fmt(im) + 'i');
    const sign = im < 0 ? ' - ' : ' + ';
    const iabs = Math.abs(im);
    const imag = iabs === 1 ? 'i' : fmt(iabs) + 'i';
    return fmt(re) + sign + imag;
}

function matrixToLatex(m) {
    return `\\( \\begin{pmatrix} ${complexToLatex(m.a)} & ${complexToLatex(m.b)} \\\\ ${complexToLatex(m.c)} & ${complexToLatex(m.d)} \\end{pmatrix} \\)`;
}

// Deduplication helpers
const KEY_SCALE = 1e6;

function keyFromNumber(x, scale = KEY_SCALE) {
    return Math.round(x * scale);
}

function keyFromVec(vec, scale = KEY_SCALE) {
    return `${keyFromNumber(vec.x, scale)}:${keyFromNumber(vec.y, scale)}:${keyFromNumber(vec.z, scale)}`;
}

function canonicalizePSL(m) {
    const arr = [m.a.re, m.a.im, m.b.re, m.b.im, m.c.re, m.c.im, m.d.re, m.d.im];
    let flip = false;
    for (const v of arr) {
        if (Math.abs(v) > 1e-12) {
            if (v < 0) flip = true;
            break;
        }
    }
    return flip ? m.neg() : m;
}

function repWithNonnegativeRealTrace(m, tol = 1e-9) {
    const tr = m.trace();
    if (Math.abs(tr.im) < tol && tr.re < -tol) return m.neg();
    return m;
}

function keyFromMatrix(m, scale = KEY_SCALE) {
    const mc = canonicalizePSL(m);
    const parts = [mc.a.re, mc.a.im, mc.b.re, mc.b.im, mc.c.re, mc.c.im, mc.d.re, mc.d.im]
        .map(v => keyFromNumber(v, scale));
    return parts.join(';');
}