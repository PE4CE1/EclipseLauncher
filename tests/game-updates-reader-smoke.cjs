const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

module.exports = async function verifyNewsReader({ window, evaluate, until, click, output }) {
  const formatting = await evaluate(`(() => {
    const {formatNews,prepareNews,newsImageUrl}=window.__gameMediaFixture;
    const parse=html=>new DOMParser().parseFromString(html,'text/html').body;
    const notes=parse(formatNews('[p]HOTFIX PATCH![/p][list][*][p]Region fix[/p][/*][*][b]Rendering fix[/b][list][*]Nested fix[/*][/list][/*][/list]'));
    const images=parse(formatNews('[img src="{STEAM_CLAN_IMAGE}/images/news.jpg"][/img][img]https://shared.fastly.steamstatic.com/news.jpg[/img]<img src="https://steamusercontent.com/a.jpg">'));
    const lead=prepareNews('[p][img src="{STEAM_CLAN_IMAGE}/images/news.jpg"][/img][/p][h2]Hello[/h2][p]World[/p]');
    const inline=prepareNews('[p]Opening text[/p][img src="{STEAM_CLAN_IMAGE}/images/news.jpg"][/img]');
    const unsafe=parse(formatNews('<script>window.__newsUnsafe=true</script><iframe src="https://evil.test"></iframe><style>body{display:none}</style><img src="https://evil.test/a.png" onerror="window.__newsUnsafe=true">[img src="https://steamstatic.com.evil.test/a.png"][/img][url="javascript:alert(1)"]Bad[/url][url="https://store.steampowered.com/"]Good[/url]'));
    const media=parse(formatNews('[previewyoutube="j8vL7SFJZUM;full"][/previewyoutube][table][tr][th]Change[/th][/tr][tr][td]Fixed[/td][/tr][/table]'));
    return {
      items:notes.querySelectorAll('li').length,nested:notes.querySelectorAll('li ul li').length,leaked:notes.textContent.includes('[/*]'),
      images:[...images.querySelectorAll('img')].map(img=>({src:img.src,lazy:img.loading,referrer:img.referrerPolicy})),
      lead:{src:lead.leadImage,inlineImages:parse(lead.html).querySelectorAll('img').length},
      inline:{hasLead:!!inline.leadImage,images:parse(inline.html).querySelectorAll('img').length},
      unsafe:!!unsafe.querySelector('script,style,iframe,img,[onerror],[href^="javascript:"]'),safeLinks:unsafe.querySelectorAll('a[href]').length,
      youtube:media.querySelector('a')?.href,table:media.querySelector('td')?.textContent,
      allowed:!!newsImageUrl('//clan.fastly.steamstatic.com/images/a.jpg'),evil:!!newsImageUrl('https://steamstatic.com.evil.test/a.jpg'),credentials:!!newsImageUrl('https://name:pass@steamstatic.com/a.jpg'),port:!!newsImageUrl('https://steamstatic.com:444/a.jpg')
    };
  })()`)
  assert.equal(formatting.items, 3)
  assert.equal(formatting.nested, 1)
  assert.equal(formatting.leaked, false)
  assert.equal(formatting.images.length, 3)
  assert.ok(formatting.images.every(image=>image.lazy==='lazy' && image.referrer==='no-referrer'))
  assert.match(formatting.lead.src, /clan.fastly.steamstatic.com/)
  assert.equal(formatting.lead.inlineImages, 0, 'A leading title image must not be duplicated')
  assert.deepEqual(formatting.inline, {hasLead:false,images:1}, 'An image after text must retain its original context')
  assert.equal(formatting.unsafe, false)
  assert.equal(formatting.safeLinks, 1)
  assert.equal(formatting.youtube, 'https://www.youtube.com/watch?v=j8vL7SFJZUM')
  assert.equal(formatting.table, 'Fixed')
  assert.equal(formatting.allowed, true)
  for (const key of ['evil','credentials','port']) assert.equal(formatting[key],false)

  const search = async value => {
    await evaluate(`(()=>{const input=document.querySelector('[data-updates-search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  }
  await until('document.querySelectorAll("[data-updates-item]").length===4')
  await click('[data-updates-filter="patches"]')
  await until('document.querySelectorAll("[data-updates-item]").length===2')
  await click('[data-updates-filter="all"]')
  await search('matchmaking')
  await until('document.querySelectorAll("[data-updates-item]").length===1 && document.querySelector("[data-updates-article]")?.dataset.updatesId==="1000"')
  await search('nothing-matches-this-text')
  await until('!document.querySelector("[data-updates-article]") && document.querySelector(".updates-empty")?.textContent.includes("No updates match")')
  await click('.updates-empty button')
  await until('document.querySelectorAll("[data-updates-item]").length===4')
  await evaluate(`document.querySelector('[data-updates-item="999"]').scrollIntoView({block:"nearest"});true`)
  await click('[data-updates-item="999"]')
  await until('document.querySelector("[data-updates-hero] img")?.src.includes("/730/header.jpg") && document.querySelector("[data-updates-hero] img")?.naturalWidth>0')
  await evaluate(`document.querySelector('[data-updates-item="1000"]').scrollIntoView({block:"nearest"});true`)
  await click('[data-updates-item="1000"]')
  await until('document.querySelector("[data-updates-article]")?.dataset.updatesId==="1000" && document.querySelector("[data-updates-hero] img")?.naturalWidth>0')
  assert.equal(await evaluate('document.querySelectorAll(".steam-news-content img").length'),0)
  assert.equal(await evaluate('document.querySelectorAll(".steam-news-content li").length'),2)
  assert.equal(await evaluate('document.querySelector(".steam-news-content").textContent.includes("[/*]")'),false)
  assert.equal(await evaluate('document.querySelector("[data-updates-hero] img").loading'),'eager')
  await evaluate('document.querySelector("[data-updates-close]").focus();true')
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await until('document.activeElement.matches("[data-updates-search]")')
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8})
  assert.equal(await evaluate('document.activeElement.matches("[data-updates-close]")'),true)

  const layouts=[]
  for (const width of [1150,780,540,400]) {
    window.setContentSize(width,880)
    await new Promise(resolve=>setTimeout(resolve,180))
    const layout=await evaluate(`(()=>{const panel=document.querySelector('[data-game-updates]'),article=document.querySelector('[data-updates-article]'),hero=document.querySelector('[data-updates-hero]'),r=panel.getBoundingClientRect();return{width:innerWidth,panel:r.width,overflow:panel.scrollWidth>panel.clientWidth+1,articleOverflow:article.scrollWidth>article.clientWidth+1,articleHeight:article.clientHeight,heroWidth:hero.getBoundingClientRect().width}})()`)
    assert.equal(layout.overflow,false)
    assert.equal(layout.articleOverflow,false)
    assert.ok(layout.articleHeight>200)
    assert.ok(layout.heroWidth<width)
    layouts.push(layout)
    if(width===540) fs.writeFileSync(path.join(output,'news-reader-mobile.png'),(await window.webContents.capturePage()).toPNG())
  }
  window.setContentSize(1150,880)
  await evaluate('window.__gameMediaFixture.language("de");true')
  await until('document.querySelector("[data-updates-search]")?.placeholder==="Updates durchsuchen …" && document.getElementById("game-updates-title")?.textContent.includes("Neuigkeiten")')
  await evaluate(`document.querySelector('[data-updates-item="1000"]').scrollIntoView({block:"nearest"});true`)
  await click('[data-updates-item="1000"]')
  await until('document.querySelector("[data-updates-hero] img")?.naturalWidth>0')
  fs.writeFileSync(path.join(output,'news-reader-de.png'),(await window.webContents.capturePage()).toPNG())
  await evaluate('window.__gameMediaFixture.language("en");true')
  await until('document.getElementById("game-updates-title")?.textContent.includes("News & Updates")')
  return {formatting,searchBody:true,filters:true,brokenImageFallback:true,keyboardFocusTrap:true,localized:true,layouts}
}
