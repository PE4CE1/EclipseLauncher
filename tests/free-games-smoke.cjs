const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function checkFreeGames(window, output, links) {
  const contents = window.webContents
  const evaluate = code => contents.executeJavaScript(code)
  const ready = async code => {
    for (let count = 0; count < 400; count++) { if (await evaluate(code)) return; await wait(40) }
    throw new Error('Free Games timeout: ' + code)
  }
  const enter = async () => {
    await ready('!!document.getElementById("sidebar-profile-menu") && !document.querySelector(".splash-screen-overlay")')
    await evaluate('document.getElementById("sidebar-profile-menu").click()')
    await ready('!!document.getElementById("sidebar-open-free-games")')
    await evaluate('document.getElementById("sidebar-open-free-games").click()')
    await ready('document.querySelectorAll("[data-free-games] article").length === 6')
  }
  const card = index => `document.querySelectorAll('[data-free-games] article')[${index}]`
  const click = async (index, button) => {
    await evaluate(`${card(index)}.querySelectorAll('button')[${button}].click()`)
    await wait(80)
  }
  const claimed = index => evaluate(`${card(index)}.dataset.claimed === 'true'`)
  await enter()
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-free-game-platform]')].map(card=>card.dataset.freeGamePlatform)`), ['Steam', 'Steam', 'Epic Games', 'Epic Games', 'GOG', 'Other'])
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-free-games] h2')].map(node=>node.textContent)`), ['Steam First', 'Steam Second', 'Epic First', 'Epic Second', 'GOG Offer', 'Other Offer'])
  const before = await evaluate(`${card(0)}.getBoundingClientRect().height`)
  await click(0, 0) // Cover: native client.
  await ready(`${card(0)}.dataset.claimed === 'true'`)
  assert.equal(links.length, 1)
  assert.equal(links[0].url, 'steam://store/42')
  assert.equal(await evaluate(`${card(0)}.querySelectorAll('button')[1].textContent.trim()`), 'Claimed')
  assert.equal(await evaluate(`${card(0)}.getBoundingClientRect().height`), before)
  await click(0, 1) // Claimed remains clickable.
  await click(0, 2) // Browser remains clickable too.
  assert.equal(links.length, 3)
  assert.equal(links[1].url, 'steam://store/42')
  assert.equal(links[2].url, 'https://store.steampowered.com/app/42')
  await click(2, 2) // A browser-first opening also marks the offer.
  assert.equal(await claimed(2), true)
  assert.equal(await claimed(3), false)
  await click(4, 1) // Failed external launch must not claim an offer.
  assert.equal(await claimed(4), false)
  assert.equal(await evaluate('!!document.querySelector("[data-free-games] [role=alert]")'), true)
  await click(4, 1)
  assert.equal(await claimed(4), true)
  assert.equal(await evaluate('!!document.querySelector("[data-free-games] [role=alert]")'), false)
  await evaluate('document.getElementById("free-games-refresh").click()')
  await ready('!document.getElementById("free-games-refresh").disabled')
  assert.equal(await claimed(0), true)
  assert.equal(await claimed(2), true)

  await new Promise(resolve => { contents.once('did-finish-load', resolve); contents.reload() })
  await enter()
  assert.equal(await claimed(0), true, 'Claim history must survive a full renderer reload')
  assert.equal(await claimed(2), true)
  assert.equal(await claimed(4), true)
  assert.equal(await claimed(1), false)
  await click(0, 1)
  assert.equal(links.length, 7, 'Reloaded claims must still open their links exactly once')
  fs.mkdirSync(output, { recursive: true })
  for (let frame = 0; frame < 4; frame++) { contents.invalidate(); await contents.capturePage(); await wait(50) }
  fs.writeFileSync(path.join(output, 'claimed-offers.png'), (await contents.capturePage()).toPNG())
  const report = { platformOrder: true, stableFeedOrder: true, coverOpensClient: true, claimedCanReopen: true, browserCanReopen: true, failedOpenDoesNotClaim: true, refreshRetainsClaims: true, reloadRetainsClaims: true, cardHeightStable: true, externalCalls: links }
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2))
  await evaluate('document.getElementById("nav-home").click()')
  await ready('!!document.querySelector(".home-view")')
  return report
}

module.exports = checkFreeGames
module.exports.offers = [
  { id: 'epic-1', title: 'Epic First', platform: 'Epic Games', slug: 'epic-first', url: 'https://store.epicgames.com/de/p/epic-first', clientUrl: 'com.epicgames.launcher://store/p/epic-first' },
  { id: 'gog-1', title: 'GOG Offer', platform: 'GOG', url: 'https://www.gog.com/en/game/gog_offer' },
  { id: 'steam-1', title: 'Steam First', platform: 'Steam', steamAppId: 42, url: 'https://store.steampowered.com/app/42', clientUrl: 'steam://store/42' },
  { id: 'other-1', title: 'Other Offer', platform: 'Other', url: 'https://example.com/offer' },
  { id: 'steam-2', title: 'Steam Second', platform: 'Steam', steamAppId: 43, url: 'https://store.steampowered.com/app/43', clientUrl: 'steam://store/43' },
  { id: 'epic-2', title: 'Epic Second', platform: 'Epic Games', slug: 'epic-second', url: 'https://store.epicgames.com/de/p/epic-second' },
]
