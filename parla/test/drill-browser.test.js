const { chromium } = require('playwright');
const fail=[]; const check=(n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};
(async()=>{
  const b=await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
  const page=await(await b.newContext()).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://localhost:'+(process.argv[2]||8765)+'/index.html',{waitUntil:'networkidle'});
  await page.fill('.onboard input[type=text]','Condo');
  await page.locator('button',{hasText:'Start talking'}).click();
  await page.waitForTimeout(400);

  console.log('== Typed production ==');
  await page.evaluate(()=>PARLA.app.go('review'));
  await page.waitForTimeout(300);
  await page.locator('.seg button',{hasText:'EN→ES'}).click();
  await page.waitForTimeout(200);
  check('typed input appears', await page.locator('.answer-input').isVisible());
  const want = await page.evaluate(()=>{
    const v=PARLA.data.es.vocab, deck=PARLA.store.state.srs;
    const q=PARLA.srs.buildQueue(v.map(r=>r[0]),deck,{maxNew:12,maxTotal:40});
    return q[0];
  });
  await page.fill('.answer-input', want);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('a correct answer is marked right', await page.locator('.answer-state.ok').isVisible());
  check('and the matching grade is highlighted',
    (await page.locator('.grade-row button[data-suggested=yes]').count())===1);

  await page.locator('.grade-row button.g4').click();
  await page.waitForTimeout(250);
  const want2 = await page.evaluate(()=>{
    const v=PARLA.data.es.vocab, deck=PARLA.store.state.srs;
    const q=PARLA.srs.buildQueue(v.map(r=>r[0]),deck,{maxNew:12,maxTotal:40});
    return q[0];
  });
  console.log('\n== Near miss ==');
  const noAccent = want2.normalize('NFD').replace(/[̀-ͯ]/g,'');
  await page.fill('.answer-input', noAccent === want2 ? want2.slice(0,-1) : noAccent);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('a near miss is not marked wrong', await page.locator('.answer-state.near').isVisible(),
    await page.locator('.answer-state').innerText());

  console.log('\n== Wrong ==');
  await page.locator('.grade-row button.g3').click();
  await page.waitForTimeout(250);
  await page.fill('.answer-input', 'zzzzqqq');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('a wrong answer is marked wrong', await page.locator('.answer-state.no').isVisible());

  console.log('\n== Listening ==');
  await page.locator('.grade-row button.g0').click();
  await page.waitForTimeout(250);
  await page.locator('.seg button',{hasText:'👂'}).click();
  await page.waitForTimeout(300);
  const promptText = await page.locator('.flashcard .prompt').innerText();
  check('the word is hidden until you commit', promptText.trim()==='👂', promptText);
  await page.locator('button',{hasText:'Show answer'}).click();
  await page.waitForTimeout(200);
  check('revealing shows the Spanish', (await page.locator('.flashcard .prompt').innerText()).trim()!=='👂');

  console.log('\n== Mixed picks per card ==');
  const modes = await page.evaluate(()=>{
    // Age the deck so the mixed mode has strong cards to escalate.
    const v=PARLA.data.es.vocab.slice(0,30);
    v.forEach((r,i)=>{ PARLA.store.state.srs[r[0]]={ease:2.5,interval:1,due:0,reps:i%7,lapses:0}; });
    PARLA.store.save();
    return true;
  });
  await page.evaluate(()=>PARLA.app.go('review'));
  await page.waitForTimeout(300);
  await page.locator('.seg button',{hasText:'Mixed'}).click();
  await page.waitForTimeout(250);
  const seen = new Set();
  for (let k=0;k<8;k++){
    const mode = await page.getAttribute('.flashcard','data-mode');
    seen.add(mode);
    // Each drill ends differently: type-and-check, reveal-then-grade, or a mic.
    const inp = page.locator('.answer-input');
    if (await inp.count()) {
      await inp.fill('x'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    }
    const show = page.locator('button', { hasText: 'Show answer' });
    if (await show.count()) { await show.click(); await page.waitForTimeout(150); }
    const grade = page.locator('.grade-row button.g4');
    if (await grade.count()) { await grade.click(); }
    else break;                       // a speaking card needs a microphone
    await page.waitForTimeout(250);
    if (!(await page.locator('.flashcard').count())) break;   // session finished
  }
  check('mixed mode uses more than one drill', seen.size>1, [...seen].join(', '));

  check('no page errors', errs.length===0, errs.slice(0,2).join(' | '));
  await b.close();
  console.log('\n'+(fail.length?fail.length+' FAILED: '+fail.join(', '):'All checks passed.'));
  process.exit(fail.length?1:0);
})();
