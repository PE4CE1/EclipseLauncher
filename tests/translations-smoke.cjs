const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

module.exports=async function checkTranslations(window,output){
  const contents=window.webContents
  const evaluate=code=>contents.executeJavaScript(code)
  const ready=async code=>{for(let count=0;count<200;count++){if(await evaluate(code))return;await wait(25)}throw new Error('Translation UI timeout: '+code)}
  const click=async id=>{await ready(`!!document.getElementById('${id}')`);await evaluate(`document.getElementById('${id}').click()`)}
  const report=[]
  fs.mkdirSync(output,{recursive:true})
  for(const language of ['de','en','de']){
    const de=language==='de'
    await click('nav-settings');await click('settings-tab-general')
    await ready(`!!document.getElementById('settings-language')`)
    await evaluate(`(()=>{const select=document.getElementById('settings-language');select.value='${language}';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await ready(`document.documentElement.lang==='${language}'`)
    await ready(`window.electronAPI.getSettings().then(settings=>settings.language==='${language}')`)
    await click('nav-catalogue')
    await ready(`!!document.getElementById('catalogue-sources-search')`)
    const label=de?'Download-Quellen':'Download Sources'
    assert.ok(await evaluate(`document.getElementById('catalogue-sources-filter').textContent.includes(${JSON.stringify(label)})`))
    assert.equal(await evaluate(`document.getElementById('catalogue-sources-search').placeholder`),de?'Quellen suchen …':'Search sources...')
    assert.ok(await evaluate(`document.getElementById('catalogue-sources-filter').textContent.includes('${de?'0 verfügbar':'0 available'}')`))
    assert.ok(await evaluate(`document.getElementById('catalogue-sources-filter').textContent.includes('${de?'Keine Treffer':'No results'}')`))
    const count=de?'1.234 Spiele gefunden':'1,234 games found'
    await ready(`document.querySelector('.catalogue-scroll').textContent.includes('${count}')`)
    await click('catalogue-sort-toggle');await evaluate("document.querySelector('[data-select-value=ccu]').click();true")
    assert.equal(await evaluate(`document.getElementById('catalogue-sort-toggle').textContent.trim()`),de?'Meiste aktive Spieler':'Most active players')
    for(const kind of ['developers','publishers']){
      await evaluate(`document.querySelector('#catalogue-${kind}-filter > button').click()`)
      await ready(`!!document.getElementById('catalogue-${kind}-search')`)
      assert.equal(await evaluate(`document.getElementById('catalogue-${kind}-search').placeholder`),kind==='developers'?(de?'Entwickler suchen …':'Search developers...'):(de?'Publisher suchen …':'Search publishers...'))
    }
    for(let frame=0;frame<3;frame++){contents.invalidate();await contents.capturePage();await wait(40)}
    fs.writeFileSync(path.join(output,`catalogue-${language}.png`),(await contents.capturePage()).toPNG())
    await click('nav-library')
    await ready(`!!document.getElementById('library-tab-installed')`)
    assert.ok(await evaluate(`document.getElementById('library-tab-installed').textContent.includes('${de?'Installiert':'Installed'}')`))
    assert.equal(await evaluate(`document.getElementById('library-search').placeholder`),de?'Bibliothek durchsuchen …':'Search library…')
    assert.equal(await evaluate(`document.getElementById('library-view-list').title`),de?'Listenansicht':'List View')
    await click('nav-home')
    await ready(`document.querySelector('.topbar').textContent.includes('${de?'Start':'Home'}')`)
    await click('sidebar-profile-menu');await click('sidebar-open-notifications')
    await ready(`document.querySelector('main h1')?.textContent==='${de?'Benachrichtigungen':'Notifications'}'`)
    report.push({language,catalogue:true,sourceSearch:true,developerPublisherSearch:true,localizedCount:count,sort:true,library:true,navigation:true,saved:true})
  }
  await click('nav-home')
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2))
  return report
}
