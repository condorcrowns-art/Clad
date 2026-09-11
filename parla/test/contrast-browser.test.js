/* Can you read it?
 *
 * The most basic quality bar there is, and the app was failing it in a lot of
 * places at once — mostly invisibly, because the author has good eyes and a
 * bright screen.
 *
 * Two systemic faults. In dark mode every accent is a bright pastel and white
 * text on one is 1.6-2.8:1, so every chip, every completed challenge day and
 * the selected tense button were unreadable. And in light mode the "faint"
 * text tier was 3.09:1 on white, which is under the 4.5 small text needs and
 * is the tier that carries the stat labels, the card meta lines and half the
 * hints in the app.
 *
 * This walks every screen in both themes and measures what a person would
 * actually see: colour composited through every alpha layer down to the
 * opaque ground, against the WCAG AA threshold for that text's size and
 * weight. It is not a proxy for looking at the screen — it is the thing
 * looking at a screenshot cannot do, which is arithmetic.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

const VIEWS = ['home','read','write','challenge','say','grammar','words','review',
               'progress','games','conjugate','coach','settings'];

const AUDIT = () => {
  // Composite every layer down to an opaque colour first. A 6%-alpha green
  // over white is nearly white, and reading the alpha colour raw made the word
  // bank look like 1.27:1 when it is fine.
  const parse=c=>{const m=(c||'').match(/[-\d.e+]+/g); if(!m||m.length<3) return null;
    let v=m.slice(0,3).map(Number);
    if(/^color\(/.test(c)) v=v.map(x=>x*255);           // color(srgb 0 .5 .3)
    return {r:v[0],g:v[1],b:v[2],a:m.length>3?Number(m[3]):1};};
  const over=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a), g:fg.g*fg.a+bg.g*(1-fg.a),
                        b:fg.b*fg.a+bg.b*(1-fg.a), a:1});
  const lum=c=>{const f=x=>{x/=255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
  const bgOf=e=>{
    const stack=[]; let n=e;
    while(n){ const cs=getComputedStyle(n);
      if(cs.backgroundImage && cs.backgroundImage!=='none' && /gradient/.test(cs.backgroundImage)){
        const m=cs.backgroundImage.match(/(rgba?\([^)]+\)|color\([^)]+\))/g);
        if(m){ const c=parse(m[0]); if(c) stack.push(c); }
      }
      const c=parse(cs.backgroundColor);
      if(c && c.a>0) stack.push(c);
      n=n.parentElement;
    }
    stack.push(parse(getComputedStyle(document.body).backgroundColor)||{r:255,g:255,b:255,a:1});
    let out=stack[stack.length-1];
    for(let i=stack.length-2;i>=0;i--) out=over(stack[i],out);
    return out;
  };
  const out=[];
  document.querySelectorAll('main *, #nav *').forEach(e=>{
    const hasText=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>0);
    if(!hasText) return;
    const cs=getComputedStyle(e);
    if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)<0.4) return;
    if(!e.getClientRects().length) return;
    const fg=parse(cs.color); if(!fg) return;
    const bg=bgOf(e);
    const l1=lum(over(fg,bg)), l2=lum(bg);
    const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    const px=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight,10)>=700;
    const need = (px>=24 || (px>=18.66 && bold)) ? 3 : 4.5;
    if(ratio<need) out.push({sel:(e.tagName+'.'+e.className).slice(0,42),
      t:e.textContent.trim().slice(0,24), r:+ratio.toFixed(2), need,
      c:cs.color, bg:'rgb('+[bg.r,bg.g,bg.b].map(Math.round).join(',')+')'});
  });
  const seen={}; return out.filter(x=>{const k=x.sel+x.r; if(seen[k])return false; seen[k]=1; return true;});
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  for (const scheme of ['light', 'dark']) {
    console.log((scheme === 'light' ? '' : '\n') + 'In ' + scheme + '\n');
    const page = await (await browser.newContext({
      viewport: { width: 412, height: 915 }, hasTouch: true, colorScheme: scheme })).newPage();
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.fill('.onboard input[type=text]', 'Condo');
    await page.locator('button', { hasText: 'Start talking' }).click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      PARLA.ui.say = function (t, cb) { if (cb) setTimeout(cb, 5); };
      PARLA.speech.speak = function (t, o) { if (o && o.onend) setTimeout(o.onend, 5); };
      PARLA.speech.cancel = function () {};
    });
    await page.evaluate(() => PARLA.dict.load());

    // The states that only exist once you have done something — a completed
    // challenge day, a text you have read, a mistake waiting. Those carry the
    // saturated fills, which is exactly where white text used to sit.
    await page.evaluate(() => {
      PARLA.store.state.progress.challengeDone = [0, 1, 2];
      PARLA.store.state.progress.challengeDay = 3;
      PARLA.store.markRead('perro', 3, 3);
      PARLA.store.markHeard('perro', 2, 3, 7);
      PARLA.store.markWritten('presentarse', 0);
      PARLA.store.rememberMistake({ es: 'soy cansado', fix: 'estoy cansado',
        note: 'ser/estar', topic: 'serestar' });
      PARLA.store.save();
    });

    for (const v of VIEWS) {
      await page.evaluate(x => PARLA.app.go(x), v);
      await page.waitForTimeout(350);
      const bad = await page.evaluate(AUDIT);
      check(v + ' is legible',
        bad.length === 0,
        bad.slice(0, 3).map(b => b.sel + ' “' + b.t + '” ' + b.r + ':1 (needs ' +
          b.need + ') ' + b.c + ' on ' + b.bg).join('  |  '));
    }
    await page.close();
  }

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nEvery screen is legible in both themes.');
  process.exit(fail.length ? 1 : 0);
})();
