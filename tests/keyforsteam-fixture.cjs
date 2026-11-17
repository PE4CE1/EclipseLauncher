const product = (id,extra={}) => ({id,merchant:61,price:20,originalPrice:25,priceCard:22,pricePaypal:23,allowCard:true,allowPaypal:true,account:false,dispo:1,edition:'1',region:'2',activationPlatform:'steam',voucher_code:'LIVE10',voucher_discount_value:10,voucher_discount_type:'%',...extra})
const data = {
  merchants:{61:{name:'G2A',official:false},67:{name:'Fixture Keys',official:false}},
  editions:{1:{name:'Standard'},2:{name:'Deluxe'}},
  regions:{2:{filter_name:'STEAM GLOBAL'},9:{filter_name:'STEAM EUROPA'},6:{filter_name:'GOG GLOBAL'},412:{filter_name:'STEAM KONTO'},25:{filter_name:'STEAM GIFT GLOBAL'},99:{filter_name:'STEAM RUSSIA'}},
  prices:[product(101),product(102,{account:true,region:'412',price:3,priceCard:4}),product(103,{activationPlatform:'gog',region:'6',price:6,priceCard:7}),product(104,{edition:'2',price:5,priceCard:6}),product(105,{region:'99',price:1,priceCard:2}),product(106,{merchant:67,price:21,priceCard:23}),product(107,{region:'25',price:8,priceCard:9})],
}
const page=(currency='eur',title='Cyberpunk 2077',value=data)=>`<html><script>var __site = ${JSON.stringify({currency})};</script><h1><span data-itemprop="name">${title}</span></h1><a href="https://www.allkeyshop.com/blog/en-us/buy-cyberpunk-2077-cd-key-compare-prices/" data-currency="usd"></a><script id="aks-offers-js-extra">var gamePageTrans = ${JSON.stringify(value)};</script></html>`
const search={results:'<li data-platforms="ps5"><a href="https://www.keyforsteam.de/wrong-console/"><h2 class="ls-results-row-game-title">Cyberpunk 2077</h2></a></li><li data-platforms="pc"><a href="https://www.keyforsteam.de/cyberpunk-2077-key-kaufen-preisvergleich/"><h2 class="ls-results-row-game-title">Cyberpunk 2077</h2></a></li>'}
module.exports={product,data,page,search}
