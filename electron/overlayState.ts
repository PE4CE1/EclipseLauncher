import type { AppSettings } from '../src/types/game'
import { resolveGameCrosshair, identifyCrosshairGame } from '../src/services/gameCrosshairs'

export function buildOverlayData(settings: Partial<AppSettings>, game: {name:string;startTime?:number;exeName?:string}|null, pid=0) {
  const roblox=Boolean(game && (game.name==='Roblox' || /^robloxplayer/i.test(game.exeName||''))), rocket=game?.name==='Rocket League'
  const crosshair=resolveGameCrosshair(settings,game)
  return {name:game?.name||'Desktop',exeName:game?.exeName,pid:game?pid:0,startTime:game?.startTime||0,positions:settings.overlayPositions,settings:{
    overlayGeneralAlwaysOn:settings.overlayGeneralAlwaysOn===true,
    performance:settings.overlayPerformance===true,crosshair:crosshair.enabled,
    overlayCS2Stats:identifyCrosshairGame(game)==='cs2'&&settings.overlayCS2Stats===true,
    cps:settings.overlayCps===true,robloxCps:roblox && settings.overlayRobloxCps===true,
    robloxTimer:roblox && settings.overlayRobloxTimer===true,robloxAntiAfk:roblox && settings.overlayRobloxAntiAfk===true,
    rlHud:rocket && settings.overlayRLHud===true,overlayRLSteam:rocket && settings.overlayRLSteam===true,
    overlayController:settings.overlayController===true,overlayRLController:rocket && settings.overlayRLController===true,
    overlayControllerStreamOnly:settings.overlayControllerStreamOnly===true,
    rlControllerSkin:settings.rlControllerSkin,rlControllerUrl:settings.rlControllerUrl,rlControllerScale:settings.rlControllerScale,
    metrics:settings.overlayMetrics,crosshairConfig:crosshair.config,steamProfileUrl:settings.steamProfileUrl,
    rlScoreboardKeyCtrl:settings.rlScoreboardKeyCtrl,rlSteamAvatarScale:settings.rlSteamAvatarScale,
    overlayMedia:settings.overlayMedia===true,overlayMediaSource:settings.overlayMediaSource,
    overlayMediaAutoHide:settings.overlayMediaAutoHide,overlayMediaVisualizer:settings.overlayMediaVisualizer!==false,language:settings.language,
  }}
}

export function hasDesktopWidgets(data:any):boolean {
  const s=data?.settings||{},game=data?.name||data?.title
  if(!(game && game!=='Desktop') && s.overlayGeneralAlwaysOn!==true)return false
  return Boolean(s.overlayCS2Stats||s.performance||s.overlayPerformance||s.crosshair||s.overlayCrosshair||s.cps||s.overlayCps||s.robloxCps||s.overlayRobloxCps||s.robloxTimer||s.overlayRobloxTimer||s.rlHud||s.overlayRLHud||s.overlayRLSteam||s.overlayMedia||(!s.overlayControllerStreamOnly&&(s.overlayController||s.overlayRLController)))
}
