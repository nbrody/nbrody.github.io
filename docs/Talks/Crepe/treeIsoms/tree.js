/**
 * RegularTreeViz — 4-regular tree (Cayley graph of F₂ = ⟨a, b⟩)
 */
class RegularTreeViz {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.maxDepth = 7;
        this.ratio = 0.45;
        this.baseLength = 160;
        this.showLabels = false;
        this.showRegions = false;
        this.view = { x: 0, y: 0, scale: 1 };
        this.mouseState = { isDragging: false, lastX: 0, lastY: 0 };
        this.animating = false;
        this.animProgress = 0;
        this.animDuration = 600;
        this.animStartTime = 0;
        this.ephemeralNodes = [];
        this.ephemeralEdges = [];
        this.baseLetters = [];
        // Quotient
        this.quotientMode = false;
        this.quotientProgress = 0;
        this.quotientAnimating = false;
        this.quotientAnimStart = 0;
        this.quotientDuration = 1800;
        // Paradox: 0=off, 1=exploded, 2=reassembled
        this.paradoxPhase = 0;
        this.paradoxProgress = 1;
        this.paradoxAnimating = false;
        this.paradoxAnimStart = 0;
        this.paradoxDuration = 1200;
        this.paradoxPrevPhase = 0;

        this.nodes = [];
        this.edges = [];
        // MathJax label cache: latex string → { canvas, width, height }
        this.mathLabelCache = new Map();
        this.mathLabelsReady = false;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupControls();
        this.buildTree();
        this.preRenderMathLabels();
        this.startLoop();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.canvas.clientWidth * dpr;
        this.canvas.height = this.canvas.clientHeight * dpr;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.dpr = dpr;
    }

    static INVERSE = { a: 'aInv', aInv: 'a', b: 'bInv', bInv: 'b' };
    static ALL_GENS = ['a', 'aInv', 'b', 'bInv'];
    static DIR = { a:{dx:1,dy:0}, aInv:{dx:-1,dy:0}, b:{dx:0,dy:-1}, bInv:{dx:0,dy:1} };

    computePosition(wordStr) {
        if (wordStr === '') return { x: 0, y: 0 };
        const letters = wordStr.split('·');
        let px = 0, py = 0, edgeLen = this.baseLength;
        for (const l of letters) { const d = RegularTreeViz.DIR[l]; px += d.dx*edgeLen; py += d.dy*edgeLen; edgeLen *= this.ratio; }
        return { x: px, y: py };
    }

    static prependGen(gen, w) {
        if (w === '') return gen;
        const l = w.split('·');
        if (l[0] === RegularTreeViz.INVERSE[gen]) { l.shift(); return l.join('·'); }
        return gen + '·' + w;
    }
    static wordDepth(w) { return w === '' ? 0 : w.split('·').length; }
    static concatWordArrays(a, b) {
        const L=[...a], R=[...b];
        while(L.length>0&&R.length>0&&L[L.length-1]===RegularTreeViz.INVERSE[R[0]]){L.pop();R.shift();}
        return [...L,...R];
    }
    getDisplayWord(nw) {
        const nl = nw===''?[]:nw.split('·');
        return RegularTreeViz.concatWordArrays(this.baseLetters, nl).join('·');
    }

    buildTree() {
        this.nodes=[]; this.edges=[]; this.nodeMap=new Map();
        this.nodes.push({word:'',x:0,y:0,startX:0,startY:0,targetX:0,targetY:0,depth:0,startGen:null});
        this.nodeMap.set('',0);
        const build=(pi,depth,el)=>{
            if(depth>this.maxDepth)return;
            const p=this.nodes[pi];
            const gens=p.startGen===null?RegularTreeViz.ALL_GENS:RegularTreeViz.ALL_GENS.filter(g=>g!==RegularTreeViz.INVERSE[p.startGen]);
            for(const g of gens){
                const d=RegularTreeViz.DIR[g],nx=p.x+d.dx*el,ny=p.y+d.dy*el;
                const w=p.word===''?g:p.word+'·'+g, idx=this.nodes.length;
                this.nodes.push({word:w,x:nx,y:ny,startX:nx,startY:ny,targetX:nx,targetY:ny,depth,startGen:g});
                this.nodeMap.set(w,idx);
                this.edges.push({from:pi,to:idx,depth});
                build(idx,depth+1,el*this.ratio);
            }
        };
        build(0,1,this.baseLength);
    }

    applyGenerator(gen) {
        if(this.animating||this.quotientMode||this.quotientAnimating)return;
        if(this.paradoxPhase>0||this.paradoxAnimating)return;
        for(const n of this.nodes){n.startX=n.x;n.startY=n.y;}
        for(const n of this.nodes){const nw=RegularTreeViz.prependGen(gen,n.word);const t=this.computePosition(nw);n.targetX=t.x;n.targetY=t.y;}
        const gi=RegularTreeViz.INVERSE[gen];
        this.ephemeralNodes=[];this.ephemeralEdges=[];
        for(const n of this.nodes){
            const sw=RegularTreeViz.prependGen(gi,n.word);
            if(RegularTreeViz.wordDepth(sw)>this.maxDepth){
                const sp=this.computePosition(sw);
                this.ephemeralNodes.push({word:n.word,startX:sp.x,startY:sp.y,targetX:n.x,targetY:n.y,x:sp.x,y:sp.y,depth:n.depth});
            }
        }
        this.pendingGen=gen;this.animating=true;this.animProgress=0;this.animStartTime=performance.now();
    }

    reset(){
        this.animating=false;this.animProgress=0;this.ephemeralNodes=[];this.ephemeralEdges=[];this.baseLetters=[];
        this.quotientMode=false;this.quotientProgress=0;this.quotientAnimating=false;
        this.paradoxPhase=0;this.paradoxProgress=1;this.paradoxAnimating=false;this.paradoxPrevPhase=0;
        this.view={x:0,y:0,scale:1};this.buildTree();
    }
    setDepth(d){this.maxDepth=Math.max(1,Math.min(10,d));this.buildTree();this.animating=false;this.ephemeralNodes=[];}
    setRatio(r){this.ratio=Math.max(0.2,Math.min(0.6,r));this.buildTree();this.animating=false;this.ephemeralNodes=[];}

    toggleQuotient(){
        if(this.animating||this.paradoxPhase>0)return;
        if(!this.showRegions&&!this.quotientMode)return; // require regions
        this.quotientAnimating=true;this.quotientAnimStart=performance.now();
        this.quotientMode=!this.quotientMode;
    }

    advanceParadox(){
        if(this.animating||this.paradoxAnimating||this.quotientMode)return;
        if(this.paradoxPhase===0&&this.baseLetters.length>0){this.baseLetters=[];this.buildTree();}
        this.paradoxPrevPhase=this.paradoxPhase;
        this.paradoxPhase=(this.paradoxPhase+1)%3;
        if(this.paradoxPhase===1)this.showRegions=true;
        this.paradoxAnimating=true;this.paradoxProgress=0;this.paradoxAnimStart=performance.now();
    }

    getNodeRegion(n){const dw=this.getDisplayWord(n.word);return this.getFirstGen(dw)||'e';}
    getExplodeOffset(r){
        const E=this.baseLength*2;
        return{a:{dx:E,dy:0},aInv:{dx:-E,dy:0},b:{dx:0,dy:-E},bInv:{dx:0,dy:E},e:{dx:-E*0.55,dy:E*0.55}}[r]||{dx:0,dy:0};
    }
    getParadoxPos(n,ph){
        const r=this.getNodeRegion(n);
        if(ph===0)return{x:n.x,y:n.y};
        if(ph===1){const o=this.getExplodeOffset(r);return{x:n.x+o.dx,y:n.y+o.dy};}
        const CS=this.baseLength*3,dw=this.getDisplayWord(n.word);
        if(r==='e')return{x:0,y:CS*0.4};
        if(r==='a'){const p=this.computePosition(dw);return{x:p.x-CS,y:p.y};}
        if(r==='aInv'){const s=dw.split('·').slice(1).join('·');const p=this.computePosition(s);return{x:p.x-CS,y:p.y};}
        if(r==='b'){const p=this.computePosition(dw);return{x:p.x+CS,y:p.y};}
        if(r==='bInv'){const s=dw.split('·').slice(1).join('·');const p=this.computePosition(s);return{x:p.x+CS,y:p.y};}
        return{x:n.x,y:n.y};
    }
    getNodeWorldPos(n){
        if(this.paradoxPhase===0&&!this.paradoxAnimating)return{x:n.x,y:n.y};
        const prev=this.getParadoxPos(n,this.paradoxPrevPhase);
        const curr=this.getParadoxPos(n,this.paradoxPhase);
        const t=this.paradoxAnimating?this.easeInOut(this.paradoxProgress):1;
        return{x:prev.x+(curr.x-prev.x)*t,y:prev.y+(curr.y-prev.y)*t};
    }

    setupControls(){
        this.canvas.addEventListener('mousedown',e=>{this.mouseState.isDragging=true;this.mouseState.lastX=e.clientX;this.mouseState.lastY=e.clientY;});
        window.addEventListener('mouseup',()=>this.mouseState.isDragging=false);
        window.addEventListener('mousemove',e=>{if(this.mouseState.isDragging){this.view.x+=e.clientX-this.mouseState.lastX;this.view.y+=e.clientY-this.mouseState.lastY;this.mouseState.lastX=e.clientX;this.mouseState.lastY=e.clientY;}});
        this.canvas.addEventListener('wheel',e=>{
            e.preventDefault();const dpr=this.dpr,rect=this.canvas.getBoundingClientRect();
            const mx=(e.clientX-rect.left)*dpr-this.centerX,my=(e.clientY-rect.top)*dpr-this.centerY;
            const mxb=mx-this.view.x*dpr,myb=my-this.view.y*dpr,oldS=this.view.scale;
            this.view.scale=Math.max(0.05,Math.min(20,oldS*(e.deltaY<0?1.08:0.93)));
            const sf=this.view.scale/oldS;this.view.x=(mx-mxb*sf)/dpr;this.view.y=(my-myb*sf)/dpr;
        },{passive:false});
        let lastDist=0;
        this.canvas.addEventListener('touchstart',e=>{
            if(e.touches.length===1){this.mouseState.isDragging=true;this.mouseState.lastX=e.touches[0].clientX;this.mouseState.lastY=e.touches[0].clientY;}
            else if(e.touches.length===2){lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
            e.preventDefault();
        },{passive:false});
        this.canvas.addEventListener('touchmove',e=>{
            if(e.touches.length===1&&this.mouseState.isDragging){this.view.x+=e.touches[0].clientX-this.mouseState.lastX;this.view.y+=e.touches[0].clientY-this.mouseState.lastY;this.mouseState.lastX=e.touches[0].clientX;this.mouseState.lastY=e.touches[0].clientY;}
            else if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);this.view.scale=Math.max(0.05,Math.min(20,this.view.scale*d/lastDist));lastDist=d;}
            e.preventDefault();
        },{passive:false});
        this.canvas.addEventListener('touchend',()=>this.mouseState.isDragging=false);
    }

    worldToScreen(wx,wy){const s=this.view.scale;return{x:this.centerX+(this.view.x+wx*s)*this.dpr,y:this.centerY+(this.view.y+wy*s)*this.dpr};}
    getFirstGen(w){if(!w||w==='')return null;return w.split('·')[0];}
    getRegionColor(w,alpha=1){
        const f=this.getFirstGen(w);
        if(!f)return`rgba(255,255,255,${0.9*alpha})`;
        const c={a:[45,212,191],aInv:[129,140,248],b:[244,114,182],bInv:[251,146,60]}[f];
        return`rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
    }
    startLoop(){const loop=()=>{this.render();requestAnimationFrame(loop);};requestAnimationFrame(loop);}

    // ════════════════════════════════════════
    // MathJax → Canvas pre-rendering
    // ════════════════════════════════════════
    preRenderMathLabels() {
        const labelsToRender = [
            // Paradox labels
            { key: 'paradox_a', tex: 'X_a \\cup\\, a \\cdot X_{a^{-1}} = T', color: '#2dd4bf' },
            { key: 'paradox_b', tex: 'X_b \\cup\\, b \\cdot X_{b^{-1}} = T', color: '#f472b6' },
            { key: 'paradox_e', tex: '+ \\{e\\}', color: '#ffffff' },
            // Quotient labels
            { key: 'quotient_a', tex: 'a', color: '#2dd4bf' },
            { key: 'quotient_b', tex: 'b', color: '#f472b6' },
        ];
        this._pendingMathLabels = labelsToRender;
        this._tryRenderMathLabels();
    }

    _tryRenderMathLabels() {
        if (typeof MathJax === 'undefined' || !MathJax.tex2svg) {
            // MathJax not yet loaded, retry
            setTimeout(() => this._tryRenderMathLabels(), 200);
            return;
        }
        for (const item of this._pendingMathLabels) {
            this._renderMathToCache(item.key, item.tex, item.color);
        }
        this.mathLabelsReady = true;
    }

    _renderMathToCache(key, tex, color, fontSize) {
        fontSize = fontSize || 28;
        try {
            const wrapper = MathJax.tex2svg(tex, { display: false });
            const svgEl = wrapper.querySelector('svg');
            if (!svgEl) return;

            // Apply color
            svgEl.style.color = color;
            svgEl.querySelectorAll('*').forEach(el => {
                if (el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') el.setAttribute('fill', color);
                if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', color);
            });

            // Read intrinsic size from SVG
            const vb = svgEl.getAttribute('viewBox');
            if (!vb) return;
            const [,, vw, vh] = vb.split(/\s+/).map(Number);
            // Scale: 1ex ≈ fontSize * 0.5
            const exSize = fontSize * 0.5;
            const svgW = svgEl.getAttribute('width');
            const svgH = svgEl.getAttribute('height');
            const wEx = parseFloat(svgW) || vw / 10;
            const hEx = parseFloat(svgH) || vh / 10;
            const pixW = Math.ceil(wEx * exSize * 2);
            const pixH = Math.ceil(hEx * exSize * 2);

            svgEl.setAttribute('width', pixW);
            svgEl.setAttribute('height', pixH);

            const svgStr = new XMLSerializer().serializeToString(svgEl);
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const oc = document.createElement('canvas');
                oc.width = pixW; oc.height = pixH;
                const octx = oc.getContext('2d');
                octx.drawImage(img, 0, 0, pixW, pixH);
                this.mathLabelCache.set(key, { canvas: oc, width: pixW, height: pixH });
                URL.revokeObjectURL(url);
            };
            img.src = url;
        } catch (e) {
            // Silently fail — canvas text fallback used
        }
    }

    // Render a word as LaTeX and cache it, returns cache entry or null
    _getWordLabel(word) {
        const key = 'word_' + word;
        if (this.mathLabelCache.has(key)) return this.mathLabelCache.get(key);
        if (!this.mathLabelsReady) return null;
        // Build LaTeX
        const tex = this.formatWordTeX(word);
        const dw = this.getDisplayWord(word === '' ? '' : word);
        const fg = this.getFirstGen(dw);
        const color = fg ? { a: '#2dd4bf', aInv: '#818cf8', b: '#f472b6', bInv: '#fb923c' }[fg] : '#f1f5f9';
        // Mark as pending to avoid re-triggering
        this.mathLabelCache.set(key, null);
        this._renderMathToCache(key, tex, this.showRegions ? color : '#f1f5f9', 22);
        return null;
    }

    formatWordTeX(nodeWord) {
        const dw = this.getDisplayWord(nodeWord);
        if (!dw || dw === '') return 'e';
        return dw.split('·').map(g => {
            if (g === 'aInv') return 'a^{-1}';
            if (g === 'bInv') return 'b^{-1}';
            return g;
        }).join('');
    }

    render(){
        const{ctx,canvas}=this;
        const grad=ctx.createRadialGradient(this.centerX,this.centerY,0,this.centerX,this.centerY,Math.max(canvas.width,canvas.height)*0.7);
        grad.addColorStop(0,'#0d1321');grad.addColorStop(0.7,'#080e1a');grad.addColorStop(1,'#060a14');
        ctx.fillStyle=grad;ctx.fillRect(0,0,canvas.width,canvas.height);

        // Isometry animation
        if(this.animating){
            const el=performance.now()-this.animStartTime;this.animProgress=Math.min(1,el/this.animDuration);
            const t=this.easeInOut(this.animProgress);
            for(const n of this.nodes){n.x=n.startX+(n.targetX-n.startX)*t;n.y=n.startY+(n.targetY-n.startY)*t;}
            for(const ep of this.ephemeralNodes){ep.x=ep.startX+(ep.targetX-ep.startX)*t;ep.y=ep.startY+(ep.targetY-ep.startY)*t;}
            if(this.animProgress>=1){
                if(this.pendingGen){const gi=RegularTreeViz.INVERSE[this.pendingGen];this.baseLetters=RegularTreeViz.concatWordArrays([gi],this.baseLetters);this.pendingGen=null;}
                this.animating=false;this.ephemeralNodes=[];this.ephemeralEdges=[];this.buildTree();
            }
        }
        // Quotient animation
        if(this.quotientAnimating){
            const el=performance.now()-this.quotientAnimStart;const raw=Math.min(1,el/this.quotientDuration);
            const t=this.easeInOut(raw);
            this.quotientProgress=this.quotientMode?t:1-t;
            if(raw>=1){this.quotientAnimating=false;this.quotientProgress=this.quotientMode?1:0;}
        }
        // Paradox animation
        if(this.paradoxAnimating){
            const el=performance.now()-this.paradoxAnimStart;this.paradoxProgress=Math.min(1,el/this.paradoxDuration);
            if(this.paradoxProgress>=1){this.paradoxAnimating=false;this.paradoxProgress=1;this.paradoxPrevPhase=this.paradoxPhase;}
        }

        const qp=this.quotientProgress;
        // Subtree fade: everything except fundamental domain fades during quotient
        const subtreeFade=Math.max(0,1-qp*2.5); // gone by qp=0.4

        this.drawAxes(ctx);
        if(subtreeFade>0.01){
            this.drawEdges(ctx,this.edges,this.nodes,subtreeFade,qp>0);
            this.drawNodes(ctx,this.nodes,subtreeFade,qp>0);
            if(this.animating&&this.ephemeralNodes.length>0)this.drawEphemeralNodes(ctx,subtreeFade);
        }
        if(qp>0)this.drawQuotientFold(ctx);
        if(this.paradoxPhase===2||(this.paradoxAnimating&&this.paradoxPhase===2))this.drawParadoxLabels(ctx);
    }

    drawAxes(ctx){
        const root=this.nodes[0];if(!root)return;
        const wp=this.getNodeWorldPos(root),o=this.worldToScreen(wp.x,wp.y);
        ctx.save();ctx.setLineDash([4*this.dpr,8*this.dpr]);ctx.strokeStyle='rgba(124,138,255,0.05)';ctx.lineWidth=1*this.dpr;
        ctx.beginPath();ctx.moveTo(0,o.y);ctx.lineTo(this.canvas.width,o.y);ctx.stroke();
        ctx.beginPath();ctx.moveTo(o.x,0);ctx.lineTo(o.x,this.canvas.height);ctx.stroke();
        ctx.setLineDash([]);ctx.restore();
    }

    drawEdges(ctx,edges,nodes,fade,skipRoot){
        const paradoxActive=this.paradoxPhase>0||this.paradoxAnimating;
        const H=this.baseLength/2;
        for(const edge of edges){
            if(skipRoot&&edge.from===0)continue;
            const from=nodes[edge.from],to=nodes[edge.to];
            const fp=this.getNodeWorldPos(from),tp=this.getNodeWorldPos(to);
            const sa=this.worldToScreen(fp.x,fp.y),sb=this.worldToScreen(tp.x,tp.y);
            if(Math.max(sa.x,sb.x)<-200||Math.min(sa.x,sb.x)>this.canvas.width+200)continue;
            if(Math.max(sa.y,sb.y)<-200||Math.min(sa.y,sb.y)>this.canvas.height+200)continue;
            const depth=edge.depth;
            const lineW=Math.max(0.3,(3.5-depth*0.35)*this.view.scale*this.dpr);
            if(lineW<0.15)continue;
            // Split root edges for fundamental domain
            if(this.showRegions&&edge.from===0){
                const dir=RegularTreeViz.DIR[to.startGen];
                // Inner half: extends H from root in gen direction (moves with root piece)
                const innerEnd=this.worldToScreen(fp.x+dir.dx*H,fp.y+dir.dy*H);
                // Outer half: extends H back from child toward root (moves with child piece)
                const outerStart=this.worldToScreen(tp.x-dir.dx*H,tp.y-dir.dy*H);
                const ba=Math.max(0.15,0.7-depth*0.06)*fade;
                ctx.lineWidth=lineW;
                ctx.strokeStyle=`rgba(255,255,255,${ba*0.85})`;
                ctx.beginPath();ctx.moveTo(sa.x,sa.y);ctx.lineTo(innerEnd.x,innerEnd.y);ctx.stroke();
                const dw=this.getDisplayWord(to.word);
                ctx.strokeStyle=this.getRegionColor(dw,ba);
                ctx.beginPath();ctx.moveTo(outerStart.x,outerStart.y);ctx.lineTo(sb.x,sb.y);ctx.stroke();
                continue;
            }
            if(this.showRegions){
                const dw=this.getDisplayWord(to.word);
                ctx.strokeStyle=this.getRegionColor(dw,Math.max(0.15,0.7-depth*0.06)*fade);
            }else{
                ctx.strokeStyle=`rgba(124,138,255,${Math.max(0.08,0.55-depth*0.06)*fade})`;
            }
            ctx.lineWidth=lineW;ctx.beginPath();ctx.moveTo(sa.x,sa.y);ctx.lineTo(sb.x,sb.y);ctx.stroke();
        }
    }

    drawNodes(ctx,nodes,fade,skipRoot){
        for(const node of nodes){
            if(skipRoot&&node.word==='')continue;
            const wp=this.getNodeWorldPos(node);
            const s=this.worldToScreen(wp.x,wp.y);
            if(s.x<-100||s.x>this.canvas.width+100||s.y<-100||s.y>this.canvas.height+100)continue;
            const depth=node.depth;
            const size=Math.max(0.5,6*Math.pow(this.ratio,depth*0.7)*this.view.scale*this.dpr);
            if(size<0.4)continue;
            const dw=this.getDisplayWord(node.word);
            if(size>2.5){ctx.beginPath();ctx.arc(s.x,s.y,size*3,0,Math.PI*2);ctx.fillStyle=this.showRegions?this.getRegionColor(dw,0.06*fade):`rgba(124,138,255,${0.06*fade})`;ctx.fill();}
            ctx.beginPath();ctx.arc(s.x,s.y,size,0,Math.PI*2);
            if(this.showRegions){const c=this.getRegionColor(dw,fade);ctx.fillStyle=c;if(size>2){ctx.shadowBlur=size*2;ctx.shadowColor=c;}}
            else{ctx.fillStyle=`hsla(225,75%,68%,${fade})`;if(size>2){ctx.shadowBlur=size*2;ctx.shadowColor='hsl(225,75%,68%)';}}
            ctx.fill();ctx.shadowBlur=0;
            if(node.word===''){ctx.beginPath();ctx.arc(s.x,s.y,size*2,0,Math.PI*2);ctx.strokeStyle=`rgba(255,255,255,${0.35*fade})`;ctx.lineWidth=1.5*this.dpr;ctx.stroke();}
            if(this.showLabels&&depth<=3&&size>1.5){
                const label=dw===''?'e':this.formatWordShort(dw);
                const fs=Math.max(7,(12-depth*2)*this.view.scale)*this.dpr;
                if(fs>5){
                    // Try MathJax-rendered label
                    const cached = this._getWordLabel(node.word);
                    if (cached && cached.canvas) {
                        const scale = fs / 14;  // base font reference
                        const drawW = cached.width * scale;
                        const drawH = cached.height * scale;
                        const lx = s.x - drawW / 2;
                        const ly = s.y - size - 5 * this.dpr - drawH;
                        // Background pill
                        const px = 4 * this.dpr, py = 2 * this.dpr;
                        ctx.fillStyle = `rgba(6,10,20,${0.8 * fade})`;
                        ctx.beginPath();
                        ctx.roundRect(lx - px, ly - py, drawW + px * 2, drawH + py * 2, 3 * this.dpr);
                        ctx.fill();
                        ctx.globalAlpha = fade;
                        ctx.drawImage(cached.canvas, lx, ly, drawW, drawH);
                        ctx.globalAlpha = 1;
                    } else {
                        // Fallback: plain text
                        ctx.font=`500 ${fs}px 'Inter',sans-serif`;ctx.textAlign='center';ctx.textBaseline='bottom';
                        const tw=ctx.measureText(label).width,px=4*this.dpr,py=2*this.dpr,lx=s.x,ly=s.y-size-5*this.dpr;
                        ctx.fillStyle=`rgba(6,10,20,${0.75*fade})`;ctx.beginPath();ctx.roundRect(lx-tw/2-px,ly-fs-py,tw+px*2,fs+py*2,3*this.dpr);ctx.fill();
                        ctx.fillStyle=this.showRegions?this.getRegionColor(dw,0.95*fade):`rgba(241,245,249,${0.9*fade})`;
                        ctx.fillText(label,lx,ly);
                    }
                }
            }
        }
    }

    drawEphemeralNodes(ctx,fade){
        for(const ep of this.ephemeralNodes){
            const s=this.worldToScreen(ep.x,ep.y);
            if(s.x<-100||s.x>this.canvas.width+100||s.y<-100||s.y>this.canvas.height+100)continue;
            const size=Math.max(0.5,6*Math.pow(this.ratio,ep.depth*0.7)*this.view.scale*this.dpr);
            if(size<0.4)continue;
            const a=this.animProgress*fade;
            ctx.beginPath();ctx.arc(s.x,s.y,size,0,Math.PI*2);
            ctx.fillStyle=this.showRegions?this.getRegionColor(this.getDisplayWord(ep.word),a):`rgba(124,138,255,${a*0.8})`;
            ctx.fill();
        }
    }

    // ════════════════════════════════════════
    // QUOTIENT FOLD: white plus → rose petals
    // ════════════════════════════════════════
    drawQuotientFold(ctx){
        const qp=this.quotientProgress;
        if(qp<=0)return;
        const H=this.baseLength/2;
        // Sub-phases: fold arms (0→0.6), bloom into petals (0.6→1)
        const foldT=this.easeInOut(Math.min(1,qp/0.6));
        const bloomT=this.easeInOut(Math.max(0,(qp-0.6)/0.4));
        const lw=Math.max(1.5,3*this.view.scale)*this.dpr;
        const o=this.worldToScreen(0,0);

        ctx.save();

        // Draw outer halves of root edges (fading out fast)
        const outerFade=Math.max(0,1-qp*3);
        if(outerFade>0.01){
            const halfEdges=[
                {dx:1,dy:0,col:[45,212,191]},{dx:-1,dy:0,col:[129,140,248]},
                {dx:0,dy:-1,col:[244,114,182]},{dx:0,dy:1,col:[251,146,60]}
            ];
            for(const he of halfEdges){
                const mid=this.worldToScreen(he.dx*H,he.dy*H);
                const tip=this.worldToScreen(he.dx*this.baseLength,he.dy*this.baseLength);
                ctx.strokeStyle=`rgba(${he.col[0]},${he.col[1]},${he.col[2]},${0.65*outerFade})`;
                ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(mid.x,mid.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
            }
        }

        if(bloomT<=0){
            // ── Fold phase: slowly swing opposite arms together ──
            // Left arm swings from angle π → 2π (=0) via the top (through -π/2 in screen)
            const leftAngle=Math.PI+Math.PI*foldT;
            const ltx=H*Math.cos(leftAngle),lty=H*Math.sin(leftAngle);
            // Down arm swings from angle π/2 → -π/2 via the right (through 0)
            const downAngle=Math.PI/2-Math.PI*foldT;
            const dtx=H*Math.cos(downAngle),dty=H*Math.sin(downAngle);

            ctx.strokeStyle='rgba(255,255,255,0.85)';
            ctx.lineWidth=lw;
            // Right arm (fixed)
            const rEnd=this.worldToScreen(H,0);
            ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(rEnd.x,rEnd.y);ctx.stroke();
            // Left arm (swinging)
            const lt=this.worldToScreen(ltx,lty);
            ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(lt.x,lt.y);ctx.stroke();
            // Up arm (fixed)
            const uEnd=this.worldToScreen(0,-H);
            ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(uEnd.x,uEnd.y);ctx.stroke();
            // Down arm (swinging)
            const dt=this.worldToScreen(dtx,dty);
            ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(dt.x,dt.y);ctx.stroke();
        } else {
            // ── Bloom phase: overlapping pairs inflate into ellipses → circles ──
            const aRx=H/2, aRy=(H/2)*bloomT;
            const aCtr=this.worldToScreen(H/2,0);
            const sRx=aRx*this.view.scale*this.dpr, sRy=aRy*this.view.scale*this.dpr;
            // Color: white → teal
            const bt=bloomT;
            const tR=Math.round(255+(45-255)*bt),tG=Math.round(255+(212-255)*bt),tB=Math.round(255+(191-255)*bt);
            ctx.strokeStyle=`rgba(${tR},${tG},${tB},0.9)`;ctx.lineWidth=lw;
            if(bt>0.5){ctx.shadowBlur=10*this.dpr*bt;ctx.shadowColor='rgba(45,212,191,0.3)';}
            ctx.beginPath();ctx.ellipse(aCtr.x,aCtr.y,Math.max(1,sRx),Math.max(1,sRy),0,0,Math.PI*2);ctx.stroke();

            const bRx=(H/2)*bloomT, bRy=H/2;
            const bCtr=this.worldToScreen(0,-H/2);
            const sbRx=bRx*this.view.scale*this.dpr, sbRy=bRy*this.view.scale*this.dpr;
            const pR=Math.round(255+(244-255)*bt),pG=Math.round(255+(114-255)*bt),pB=Math.round(255+(182-255)*bt);
            ctx.shadowColor='rgba(244,114,182,0.3)';
            ctx.strokeStyle=`rgba(${pR},${pG},${pB},0.9)`;
            ctx.beginPath();ctx.ellipse(bCtr.x,bCtr.y,Math.max(1,sbRx),Math.max(1,sbRy),0,0,Math.PI*2);ctx.stroke();
            ctx.shadowBlur=0;

            // Arrows
            if(bt>0.6){
                const aa=Math.min(1,(bt-0.6)/0.4);
                this._drawPetalArrow(ctx,aCtr,sRx,sRy,-Math.PI/3,`rgba(${tR},${tG},${tB},${aa})`,lw);
                this._drawPetalArrow(ctx,bCtr,sbRx,sbRy,-Math.PI/6,`rgba(${pR},${pG},${pB},${aa})`,lw);
            }
            // Labels
            if(bt>0.7){
                const la=Math.min(1,(bt-0.7)/0.3);
                const fs=Math.max(10,16*this.view.scale)*this.dpr;
                const cached_a = this.mathLabelCache.get('quotient_a');
                const cached_b = this.mathLabelCache.get('quotient_b');
                if (cached_a && cached_a.canvas) {
                    const scale = fs / 14;
                    const dw = cached_a.width * scale, dh = cached_a.height * scale;
                    ctx.globalAlpha = la;
                    ctx.drawImage(cached_a.canvas, aCtr.x - dw/2, aCtr.y - Math.max(sRy,sRx) - fs*0.6 - dh/2, dw, dh);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.font=`700 ${fs}px 'Inter',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
                    ctx.fillStyle=`rgba(45,212,191,${la})`;ctx.fillText('a',aCtr.x,aCtr.y-Math.max(sRy,sRx)-fs*0.6);
                }
                if (cached_b && cached_b.canvas) {
                    const scale = fs / 14;
                    const dw = cached_b.width * scale, dh = cached_b.height * scale;
                    ctx.globalAlpha = la;
                    ctx.drawImage(cached_b.canvas, bCtr.x + Math.max(sbRx,sbRy) + fs*0.6 - dw/2, bCtr.y - dh/2, dw, dh);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.font=`700 ${fs}px 'Inter',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
                    ctx.fillStyle=`rgba(244,114,182,${la})`;ctx.fillText('b',bCtr.x+Math.max(sbRx,sbRy)+fs*0.6,bCtr.y);
                }
            }
        }

        // Root vertex — always visible during quotient
        const dotR=Math.max(3,6*this.view.scale)*this.dpr;
        ctx.beginPath();ctx.arc(o.x,o.y,dotR*3,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fill();
        ctx.beginPath();ctx.arc(o.x,o.y,dotR,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.95)';ctx.fill();
        ctx.beginPath();ctx.arc(o.x,o.y,dotR*1.8,0,Math.PI*2);
        ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1.5*this.dpr;ctx.stroke();

        ctx.restore();
    }

    _drawPetalArrow(ctx,center,rx,ry,angle,color,lw){
        const ax=center.x+rx*Math.cos(angle),ay=center.y+ry*Math.sin(angle);
        const tx=-Math.sin(angle),ty=Math.cos(angle);
        const sz=lw*2.5;
        ctx.save();ctx.fillStyle=color;ctx.translate(ax,ay);ctx.rotate(Math.atan2(ty,tx));
        ctx.beginPath();ctx.moveTo(sz*0.5,0);ctx.lineTo(-sz*0.3,-sz*0.35);ctx.lineTo(-sz*0.3,sz*0.35);ctx.closePath();ctx.fill();ctx.restore();
    }

    drawParadoxLabels(ctx){
        const t=this.paradoxAnimating?this.easeInOut(this.paradoxProgress):(this.paradoxPhase===2?1:0);
        if(t<=0)return;
        const CS=this.baseLength*3,fs=Math.max(12,18*this.view.scale)*this.dpr;
        ctx.save();

        // Label 1: X_a ∪ a·X_{a⁻¹} = T
        const c1=this.worldToScreen(-CS,0);
        const cached_a = this.mathLabelCache.get('paradox_a');
        if (cached_a && cached_a.canvas) {
            const scale = fs / 16;
            const dw = cached_a.width * scale, dh = cached_a.height * scale;
            ctx.globalAlpha = t * 0.9;
            ctx.drawImage(cached_a.canvas, c1.x - dw/2, c1.y - fs*3, dw, dh);
            ctx.globalAlpha = 1;
        } else {
            ctx.font=`700 ${fs}px 'Inter',sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';
            ctx.fillStyle=`rgba(45,212,191,${t*0.9})`;ctx.fillText('X_a \u222a a\u00b7X_{a\u207b\u00b9} = T',c1.x,c1.y-fs*3);
        }

        // Label 2: X_b ∪ b·X_{b⁻¹} = T
        const c2=this.worldToScreen(CS,0);
        const cached_b = this.mathLabelCache.get('paradox_b');
        if (cached_b && cached_b.canvas) {
            const scale = fs / 16;
            const dw = cached_b.width * scale, dh = cached_b.height * scale;
            ctx.globalAlpha = t * 0.9;
            ctx.drawImage(cached_b.canvas, c2.x - dw/2, c2.y - fs*3, dw, dh);
            ctx.globalAlpha = 1;
        } else {
            ctx.font=`700 ${fs}px 'Inter',sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';
            ctx.fillStyle=`rgba(244,114,182,${t*0.9})`;ctx.fillText('X_b \u222a b\u00b7X_{b\u207b\u00b9} = T',c2.x,c2.y-fs*3);
        }

        // Label 3: + {e}
        const ev=this.worldToScreen(0,CS*0.4);
        const sf=Math.max(10,14*this.view.scale)*this.dpr;
        const cached_e = this.mathLabelCache.get('paradox_e');
        if (cached_e && cached_e.canvas) {
            const scale = sf / 14;
            const dw = cached_e.width * scale, dh = cached_e.height * scale;
            ctx.globalAlpha = t * 0.7;
            ctx.drawImage(cached_e.canvas, ev.x - dw/2, ev.y + sf*1.5, dw, dh);
            ctx.globalAlpha = 1;
        } else {
            ctx.font=`600 ${sf}px 'Inter',sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';
            ctx.fillStyle=`rgba(255,255,255,${t*0.7})`;ctx.fillText('+ {e}',ev.x,ev.y+sf*1.5);
        }

        ctx.restore();
    }

    formatWordShort(w){
        if(!w||w==='')return'e';
        return w.split('·').map(g=>g==='aInv'?'a⁻¹':g==='bInv'?'b⁻¹':g).join('');
    }
    easeInOut(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
}
