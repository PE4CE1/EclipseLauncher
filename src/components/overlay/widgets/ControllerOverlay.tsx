import React, { useMemo } from 'react'

export type ControllerSkinId = 'ps5_white' | 'ps5_black' | 'ps4_white' | 'ps4_black' | 'xbox_one'

interface ControllerOverlayProps {
  url?: string
  skin?: ControllerSkinId
  scale?: number
  isEditMode?: boolean
}

function buildControllerHtml(activeSkin: ControllerSkinId): string {
  let specificCss = ''
  let skinClass = ''

  if (activeSkin === 'ps5_white') {
    skinClass = 'xbox ps5'
    specificCss = `
.controller.xbox.ps5 {
    background: url(https://i.imgur.com/fJIyBwn.png) no-repeat 0 0;
    width: 807px;
    height: 651px;
}
.ps5 .sticks {
    width: 367px;
    height: 100px;
    left: 220px;
    top: 333px;
    position: absolute;
}
.ps5 .stick {
    background: url(https://i.imgur.com/nXaGdI2.png) no-repeat 0 0;
    width: 100px;
    height: 100px;
    position: absolute;
    opacity: 1 !important;
}
.ps5 .stick.pressed {
    background-position: -102px 0;
}
.ps5 .stick.left {
    top: 0;
    left: 0;
}
.ps5 .stick.right {
    top: 0;
    left: 267px;
}
.ps5 .abxy {
    width: 181px;
    height: 181px;
    left: 573px;
    top: 178px;
    position: absolute;
}
.ps5 .button {
    background: url(https://i.imgur.com/DVqDSsJ.png) no-repeat;
    width: 58px;
    height: 58px;
    position: absolute;
    opacity: 1 !important;
}
.ps5 .button.pressed {
    background-position-y: -59px;
}
.ps5 .button.a {
    background-position-x: 0;
    left: 61px;
    top: 123px;
}
.ps5 .button.b {
    background-position-x: -59px;
    left: 123px;
    top: 62px;
}
.ps5 .button.x {
    background-position-x: -118px;
    left: 0px;
    top: 61px;
}
.ps5 .button.y {
    background-position-x: -177px;
    left: 61px;
    top: 0px;
}
.ps5 .arrows {
    left: 195px;
    top: 140px;
    width: 416px;
    height: 57px;
    position: absolute;
}
.ps5 .back, .ps5 .start {
    background: url(https://i.imgur.com/YJRVQxC.png) no-repeat;
    width: 27px;
    height: 57px;
    opacity: 0;
    position: absolute;
}
.ps5 .back { left: 0; }
.ps5 .start { right: 0; background-position: -28px 0; }
.ps5 .dpad {
    width: 144px;
    height: 144px;
    left: 71px;
    top: 196px;
    position: absolute;
}
.ps5 .face {
    background: url(https://i.imgur.com/hCmzXWK.png) no-repeat;
    position: absolute;
    opacity: 0;
}
.ps5 .face.up {
    background-position: 0 -68px;
    width: 52px;
    height: 63px;
    left: 46px;
    top: 0;
}
.ps5 .face.down {
    background-position: -54px -68px;
    width: 52px;
    height: 63px;
    left: 46px;
    top: 81px;
}
.ps5 .face.left {
    background-position: -108px -68px;
    width: 64px;
    height: 52px;
    left: -1px;
    top: 47px; 
}
.ps5 .face.right {
    background-position: -175px -68px;
    width: 63px;
    height: 52px;
    left: 81px;
    top: 46px;
}
.ps5 .bumpers {
    width: 620px;
    height: 35px;
    left: 93px;
    top: 114px;
    position: absolute;
}
.ps5 .bumper {
    background: url(https://i.imgur.com/2YssqRT.png) no-repeat;
    width: 110px;
    height: 35px;
    opacity: 0;
    position: absolute;
}
.ps5 .bumper.left { left: 0; }
.ps5 .bumper.right { right: 0; transform: rotateY(180deg); }
.ps5 .triggers {
    width: 619px;
    height: 108px;
    left: 94px;
    top: 0;
    position: absolute;
}
.ps5 .trigger {
    background: url(https://i.imgur.com/LsxmGBD.png) no-repeat;
    width: 111px;
    height: 108px;
    opacity: 0;
    position: absolute;
}
.ps5 .trigger.left { left: 0; }
.ps5 .trigger.right { right: 0; background-position: -113px 0; }
`
  } else if (activeSkin === 'ps5_black') {
    skinClass = 'ds4 ps5-black'
    specificCss = `
.controller.ds4.ps5-black {
    background: url(https://philipbry.github.io/ZDjUbh0.png) no-repeat 0 0;
    width: 794px;
    height: 639px;
}
.ps5-black .sticks {
    width: 367px;
    height: 95px;
    left: 222px;
    top: 294px;
    position: absolute;
}
.ps5-black .stick {
    background: url(https://philipbry.github.io/3sBwghP.png) no-repeat 0 0;
    width: 95px;
    height: 95px;
    position: absolute;
    opacity: 1 !important;
}
.ps5-black .stick.pressed.left, .ps5-black .stick.pressed.right {
    background-position: -95px 0;
}
.ps5-black .stick.left {
    top: 0;
    left: 0;
}
.ps5-black .stick.right {
    top: 0;
    left: 255px;
}
.ps5-black .abxy {
    width: 181px;
    height: 181px;
    left: 559px;
    top: 152px;
    position: absolute;
}
.ps5-black .button {
    background: url(https://philipbry.github.io/HdHbA0t.png) no-repeat;
    width: 54px;
    height: 54px;
    position: absolute;
    opacity: 1 !important;
}
.ps5-black .button.pressed {
    background-position-y: -55px;
}
.ps5-black .button.a {
    background-position-x: 0;
    left: 59px;
    top: 116px;
}
.ps5-black .button.b {
    background-position-x: -54px;
    left: 118px;
    top: 59px;
}
.ps5-black .button.x {
    background-position-x: -108px;
    left: 0px;
    top: 58px;
}
.ps5-black .button.y {
    background-position-x: -162px;
    left: 59px;
    top: 0px;
}
.ps5-black .arrows {
    left: 195px;
    top: 140px;
    width: 416px;
    height: 57px;
    position: absolute;
}
.ps5-black .back, .ps5-black .start {
    background: url(https://philipbry.github.io/PrAfLDQ.png) no-repeat;
    width: 23px;
    height: 37px;
    margin-top: -8px;
    opacity: 0;
    position: absolute;
}
.ps5-black .back { left: 5px; }
.ps5-black .start {
    background-position: -23px 0;
    right: 16px;
}
.ps5-black .bumpers {
    width: 620px;
    height: 36px;
    left: 90px;
    top: 98px;
    position: absolute;
}
.ps5-black .bumper {
    background: url(https://philipbry.github.io/wijYAzG.png) no-repeat;
    width: 114px;
    height: 36px;
    opacity: 0;
    position: absolute;
}
.ps5-black .bumper.left { left: 0; }
.ps5-black .bumper.right { right: 0; margin-right: 6px; transform: rotateY(180deg); }
.ps5-black .triggers {
    width: 593px;
    height: 97px;
    left: 100px;
    top: 0;
    position: absolute;
}
.ps5-black .trigger {
    background: url(https://philipbry.github.io/KcAyIZw.png) no-repeat;
    width: 100px;
    height: 97px;
    opacity: 0;
    position: absolute;
}
.ps5-black .trigger.left { left: 0; }
.ps5-black .trigger.right { right: 0; background-position: -100px 0; transform: rotateY(0); }
.ps5-black .dpad {
    position: absolute;
    width: 125px;
    height: 126px;
    top: 171px;
    left: 82px;
}
.ps5-black .face {
    background: url(https://philipbry.github.io/548MWGT.png) no-repeat;
    position: absolute;
    opacity: 1 !important;
}
.ps5-black .face.up, .ps5-black .face.down {
    width: 44px;
    height: 58px;
}
.ps5-black .face.left, .ps5-black .face.right {
    width: 57px;
    height: 44px;
}
.ps5-black .face.up {
    left: 45px;
    top: 0;
    background-position: 0px 0;
}
.ps5-black .face.down {
    left: 45px;
    bottom: -7px;
    background-position: -44px 0;
}
.ps5-black .face.left {
    top: 45px;
    left: 0;
    background-position: -88px 0;
}
.ps5-black .face.right {
    top: 44px;
    right: -7px;
    background-position: -145px 0;
}
.ps5-black .face.pressed {
    background-position-y: -58px;
}
`
  } else if (activeSkin === 'xbox_one') {
    skinClass = 'xbox'
    specificCss = `
.controller.xbox {
  background: url(https://gamepadviewer.com/xbox-assets/base.svg) no-repeat 0 0;
  width: 750px;
  height: 630px;
}
.xbox .triggers { width: 446px; height: 121px; top: 0; left: 152px; position: absolute; }
.xbox .trigger { background: url(https://gamepadviewer.com/xbox-assets/trigger.svg) no-repeat 0 0; width: 88px; height: 121px; opacity: 0; position: absolute; }
.xbox .trigger.left { left: 0; }
.xbox .trigger.right { right: 0; transform: rotateY(180deg); }
.xbox .bumpers { width: 536px; height: 61px; top: 129px; left: 107px; position: absolute; }
.xbox .bumper { background: url(https://gamepadviewer.com/xbox-assets/bumper.svg) no-repeat 0 0; width: 170px; height: 61px; opacity: 0; position: absolute; }
.xbox .bumper.left { left: 0; }
.xbox .bumper.right { right: 0; transform: rotateY(180deg); }
.xbox .arrows { width: 141px; height: 33px; top: 264px; left: 306px; position: absolute; }
.xbox .back, .xbox .start { background: url(https://gamepadviewer.com/xbox-assets/start-select.svg) no-repeat 0 0; width: 33px; height: 33px; opacity: 0; position: absolute; }
.xbox .back { left: 0; }
.xbox .start { right: 0; background-position: -34px 0; }
.xbox .abxy { width: 153px; height: 156px; top: 192px; left: 488px; position: absolute; }
.xbox .button { background: url(https://gamepadviewer.com/xbox-assets/abxy.svg) no-repeat 0 0; width: 48px; height: 48px; position: absolute; opacity: 1 !important; }
.xbox .button.pressed { background-position-y: -48px; margin-top: 4px; }
.xbox .button.a { background-position: 0 0; top: 108px; left: 55px; }
.xbox .button.b { background-position: -49px 0; top: 58px; right: 0px; }
.xbox .button.x { background-position: -98px 0; top: 58px; left: 4px; }
.xbox .button.y { background-position: -148px 0; left: 55px; top: 7px; }
.xbox .sticks { width: 371px; height: 196px; top: 239px; left: 144px; position: absolute; }
.xbox .stick { background: url(https://gamepadviewer.com/xbox-assets/stick.svg) no-repeat -85px 0; height: 83px; width: 83px; position: absolute; opacity: 1 !important; }
.xbox .stick.pressed { background-position: 0 0; }
.xbox .stick.left { top: 0; left: 0; }
.xbox .stick.right { top: 113px; left: 288px; }
.xbox .dpad { width: 110px; height: 111px; top: 345px; left: 223px; position: absolute; }
.xbox .face { background: url(https://gamepadviewer.com/xbox-assets/dpad.svg) no-repeat; position: absolute; opacity: 0; }
.xbox .face.up { background-position: -36px 0; left: 38px; top: 0px; width: 34px; height: 56px; }
.xbox .face.down { background-position: 0 0; left: 38px; bottom: 0; width: 34px; height: 56px; }
.xbox .face.left { background-position: 0 -93px; width: 55px; height: 35px; top: 38px; left: 0; }
.xbox .face.right { background-position: 0 -57px; width: 55px; height: 35px; top: 38px; right: 0; }
`
  } else {
    // PS4 (Classic Black or White/Red)
    const isWhite = activeSkin === 'ps4_white'
    skinClass = isWhite ? 'ds4 white' : 'ds4'
    const assetFolder = isWhite ? 'ps4-white-assets' : 'ps4-assets'
    specificCss = `
.controller.ds4 {
  background: url(https://gamepadviewer.com/${assetFolder}/base.svg) no-repeat 0 0;
  width: 806px;
  height: 598px;
}
.ds4 .triggers { width: 588px; height: 90px; top: 0; left: 109px; position: absolute; }
.ds4 .trigger { background: url(https://gamepadviewer.com/${assetFolder}/triggers.svg) no-repeat; width: 99px; height: 90px; opacity: 0; position: absolute; }
.ds4 .trigger.left { left: 0; }
.ds4 .trigger.right { right: 0; background-position: -100px 0; }
.ds4 .bumpers { width: 588px; height: 23px; top: 94px; left: 109px; position: absolute; }
.ds4 .bumper { background: url(https://gamepadviewer.com/${assetFolder}/bumper.svg) no-repeat; width: 99px; height: 23px; opacity: 0; position: absolute; }
.ds4 .bumper.left { left: 0; }
.ds4 .bumper.right { right: 0; transform: rotateY(180deg); }
.ds4 .arrows { width: 352px; height: 46px; top: 142px; left: 227px; position: absolute; }
.ds4 .back, .ds4 .start { background: url(https://gamepadviewer.com/${assetFolder}/start.svg) no-repeat; width: 28px; height: 46px; opacity: 0; position: absolute; }
.ds4 .back { left: 0; }
.ds4 .start { right: 0; transform: rotateY(180deg); }
.ds4 .abxy { width: 170px; height: 171px; top: 159px; left: 567px; position: absolute; }
.ds4 .button { width: 56px; height: 56px; background: url(https://gamepadviewer.com/${assetFolder}/face.svg) no-repeat; position: absolute; opacity: 1 !important; }
.ds4 .button.pressed { background-position-y: -56px; }
.ds4 .button.a { background-position-x: 0; bottom: 0; left: 57px; }
.ds4 .button.b { background-position-x: -56px; top: 57px; right: 0px; }
.ds4 .button.x { background-position-x: -112px; top: 57px; left: 0px; }
.ds4 .button.y { background-position-x: -168px; left: 57px; top: 0px; }
.ds4 .sticks { width: 350px; height: 105px; top: 309px; left: 228px; position: absolute; }
.ds4 .stick { background: url(https://gamepadviewer.com/${assetFolder}/sticks.svg) no-repeat; height: 94px; width: 94px; position: absolute; opacity: 1 !important; }
.ds4 .stick.pressed.left { background-position-x: -96px; }
.ds4 .stick.pressed.right { background-position-x: -192px; }
.ds4 .stick.left { top: 0; left: 0; }
.ds4 .stick.right { top: 0; left: 256px; }
.ds4 .dpad { width: 125px; height: 126px; top: 181px; left: 92px; position: absolute; }
.ds4 .face { background: url(https://gamepadviewer.com/${assetFolder}/dpad.svg) no-repeat; position: absolute; opacity: 1 !important; }
.ds4 .face.up { width: 36px; height: 52px; left: 44px; top: 0; background-position: -36px 0; }
.ds4 .face.down { width: 36px; height: 52px; left: 44px; bottom: 0; background-position: 0 0; }
.ds4 .face.left { width: 52px; height: 36px; top: 45px; left: 0; background-position: -126px 0; }
.ds4 .face.right { width: 52px; height: 36px; top: 45px; right: 0; background-position: -73px 0; }
.ds4 .face.pressed { background-position-y: -52px; }
`
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: transparent !important;
  overflow: hidden;
  user-select: none;
}
.controller {
  position: absolute;
  top: 0;
  left: 0;
}

/* Base structural layout */
.controller .triggers { position: absolute; width: 100%; top: 0; }
.controller .trigger { position: absolute; opacity: 0; }
.controller .bumpers { position: absolute; width: 100%; }
.controller .bumper { position: absolute; opacity: 0; }
.controller .arrows { position: absolute; }
.controller .back, .controller .start { position: absolute; opacity: 0; }
.controller .abxy { position: absolute; }
.controller .button { position: absolute; opacity: 1; }
.controller .dpad { position: absolute; }
.controller .face { position: absolute; }
.controller .sticks { position: absolute; }
.controller .stick { position: absolute; opacity: 1; }

${specificCss}
</style>
</head>
<body>
  <div id="controller" class="controller ${skinClass}">
    <div class="triggers">
      <div id="trigger-l" class="trigger left"></div>
      <div id="trigger-r" class="trigger right"></div>
    </div>
    <div class="bumpers">
      <div id="bumper-l" class="bumper left"></div>
      <div id="bumper-r" class="bumper right"></div>
    </div>
    <div class="arrows">
      <div id="btn-back" class="back"></div>
      <div id="btn-start" class="start"></div>
    </div>
    <div class="abxy">
      <div id="btn-a" class="button a"></div>
      <div id="btn-b" class="button b"></div>
      <div id="btn-x" class="button x"></div>
      <div id="btn-y" class="button y"></div>
    </div>
    <div class="dpad">
      <div id="dpad-up" class="face up"></div>
      <div id="dpad-down" class="face down"></div>
      <div id="dpad-left" class="face left"></div>
      <div id="dpad-right" class="face right"></div>
    </div>
    <div class="sticks">
      <div id="stick-l" class="stick left"></div>
      <div id="stick-r" class="stick right"></div>
    </div>
  </div>

  <script>
    const STICK_OFFSET = 20;
    const DEADZONE = 0.08;
    const isDpadGlowSkin = ${activeSkin === 'ps5_white' || activeSkin === 'xbox_one'};

    function applyDeadzone(v) {
      return Math.abs(v) < DEADZONE ? 0 : v;
    }

    function togglePressed(id, isPressed) {
      const el = document.getElementById(id);
      if (!el) return;
      if (isPressed) {
        el.classList.add('pressed');
        if (id.includes('bumper') || id.includes('btn-back') || id.includes('btn-start') || (isDpadGlowSkin && id.includes('dpad'))) {
          el.style.opacity = '1';
        }
      } else {
        el.classList.remove('pressed');
        if (id.includes('bumper') || id.includes('btn-back') || id.includes('btn-start') || (isDpadGlowSkin && id.includes('dpad'))) {
          el.style.opacity = '0';
        }
      }
    }

    function applyState(buttons, axes) {
      if (!buttons || !axes) return;
      const btn = (i) => Boolean(buttons[i]?.pressed || (typeof buttons[i]?.value === 'number' && buttons[i].value > 0.25) || buttons[i] === true);
      const val = (i) => typeof buttons[i]?.value === 'number' ? buttons[i].value : (buttons[i]?.pressed ? 1 : (buttons[i] === true ? 1 : 0));

      // ABXY / Action buttons
      togglePressed('btn-a', btn(0));
      togglePressed('btn-b', btn(1));
      togglePressed('btn-x', btn(2));
      togglePressed('btn-y', btn(3));

      // Bumpers (L1 / R1)
      togglePressed('bumper-l', btn(4));
      togglePressed('bumper-r', btn(5));

      // Triggers (L2 / R2)
      const l2 = val(6);
      const r2 = val(7);
      const trigL = document.getElementById('trigger-l');
      const trigR = document.getElementById('trigger-r');
      if (trigL) {
        trigL.style.opacity = l2 > 0.05 ? Math.max(0.2, l2) : '0';
        if (l2 > 0.1) trigL.classList.add('pressed'); else trigL.classList.remove('pressed');
      }
      if (trigR) {
        trigR.style.opacity = r2 > 0.05 ? Math.max(0.2, r2) : '0';
        if (r2 > 0.1) trigR.classList.add('pressed'); else trigR.classList.remove('pressed');
      }

      // Back / Start (Share / Options / View / Menu)
      togglePressed('btn-back', btn(8));
      togglePressed('btn-start', btn(9));

      // L3 / R3
      togglePressed('stick-l', btn(10));
      togglePressed('stick-r', btn(11));

      // D-Pad
      let dpadUp = btn(12);
      let dpadDown = btn(13);
      let dpadLeft = btn(14);
      let dpadRight = btn(15);

      // POV Hat fallback for DirectInput
      if (axes.length > 9 && !dpadUp && !dpadDown && !dpadLeft && !dpadRight) {
        const pov = Math.round(axes[9] * 100) / 100;
        if (pov >= -1.01 && pov <= 1.01) {
          if (pov >= -1.01 && pov < -0.6) { dpadUp = true; }
          else if (pov >= -0.6 && pov < -0.1) { dpadRight = true; }
          else if (pov >= -0.1 && pov < 0.4) { dpadDown = true; }
          else if (pov >= 0.4 && pov < 0.9) { dpadLeft = true; }
        }
      }

      togglePressed('dpad-up', dpadUp);
      togglePressed('dpad-down', dpadDown);
      togglePressed('dpad-left', dpadLeft);
      togglePressed('dpad-right', dpadRight);

      // Sticks
      const lx = applyDeadzone(axes[0] || 0) * STICK_OFFSET;
      const ly = applyDeadzone(axes[1] || 0) * STICK_OFFSET;
      const rx = applyDeadzone(axes[2] || 0) * STICK_OFFSET;
      const ry = applyDeadzone(axes[3] || 0) * STICK_OFFSET;

      const stickL = document.getElementById('stick-l');
      const stickR = document.getElementById('stick-r');
      if (stickL) stickL.style.transform = 'translate(' + lx + 'px, ' + ly + 'px)';
      if (stickR) stickR.style.transform = 'translate(' + rx + 'px, ' + ry + 'px)';
    }

    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'gamepad-state') {
        applyState(e.data.buttons, e.data.axes);
      }
    });

    function loop() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (let i = 0; i < gamepads.length; i++) {
        const g = gamepads[i];
        if (g && g.connected) {
          const hasPress = g.buttons.some(b => b && (b.pressed || b.value > 0.1));
          const hasAxis = g.axes.some(a => Math.abs(a) > 0.15);
          if (hasPress || hasAxis) {
            gp = g;
            break;
          }
        }
      }
      if (!gp) {
        for (let i = 0; i < gamepads.length; i++) {
          if (gamepads[i] && gamepads[i].connected) {
            gp = gamepads[i];
            break;
          }
        }
      }

      if (gp) {
        applyState(gp.buttons, gp.axes);
      }

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  </script>
</body>
</html>`
}

export const ControllerOverlay = React.memo(function ControllerOverlay({
  url,
  skin,
  scale = 80,
  isEditMode = false,
}: ControllerOverlayProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const finalScale = (scale || 80) / 100

  // Determine active skin
  const resolvedSkin: ControllerSkinId = useMemo(() => {
    if (skin) return skin
    if (url?.includes('ps5_black') || url?.includes('philipbry')) return 'ps5_black'
    if (url?.includes('FPS5') || url?.includes('PS5') || url?.includes('ps5_white')) return 'ps5_white'
    if (url?.includes('s=8') || url?.includes('ps4_white')) return 'ps4_white'
    if (url?.includes('s=5') || url?.includes('ps4_black')) return 'ps4_black'
    if (url?.includes('s=1') || url?.includes('xbox')) return 'xbox_one'
    return 'ps5_white'
  }, [skin, url])

  // Dimensions
  const BASE_WIDTH = 820
  const BASE_HEIGHT = 680
  const containerWidth = Math.round(BASE_WIDTH * (finalScale * 0.52))
  const containerHeight = Math.round(BASE_HEIGHT * (finalScale * 0.52))

  const htmlContent = useMemo(() => buildControllerHtml(resolvedSkin), [resolvedSkin])

  // Receive gamepad state from Main Process (via hidden gamepadService window).
  // This works even when Rocket League is focused because the main process
  // relays state from a separate focusable window that always has gamepad access.
  React.useEffect(() => {
    const api = (window as any).electronAPI

    const sendToIframe = (state: any) => {
      if (!state || !iframeRef.current?.contentWindow) return
      try {
        iframeRef.current.contentWindow.postMessage({
          type: 'gamepad-state',
          buttons: state.buttons,
          axes: state.axes,
        }, '*')
      } catch {}
    }

    // Primary: IPC from main process gamepad relay
    let ipcUnsub: (() => void) | null = null
    if (api?.on) {
      ipcUnsub = api.on('overlay:gamepad-state', sendToIframe)
    }

    // Fallback: direct poll via setInterval (works in Eclipse Launcher window context)
    const intervalId = setInterval(() => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
      let bestGp: Gamepad | null = null
      for (let i = 0; i < gamepads.length; i++) {
        const g = gamepads[i]
        if (g && g.connected) {
          const active = g.buttons.some(b => b && (b.pressed || b.value > 0.05)) || g.axes.some(a => Math.abs(a) > 0.1)
          if (active) { bestGp = g; break }
        }
      }
      if (!bestGp) {
        for (let i = 0; i < gamepads.length; i++) {
          const g = gamepads[i]
          if (g && g.connected) { bestGp = g; break }
        }
      }
      if (bestGp) {
        sendToIframe({
          buttons: bestGp.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
          axes: Array.from(bestGp.axes),
        })
      }
    }, 16) // ~60fps

    return () => {
      clearInterval(intervalId)
      if (ipcUnsub) ipcUnsub()
    }
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: containerWidth,
        height: containerHeight,
        pointerEvents: isEditMode ? 'auto' : 'none',
        userSelect: 'none',
        contain: 'paint layout',
        overflow: 'visible',
      }}
    >
      <iframe
        ref={iframeRef}
        key={resolvedSkin}
        srcDoc={htmlContent}
        title="Gamepad Controller Overlay"
        allow="gamepad *; autoplay *"
        scrolling="no"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${finalScale * 0.52})`,
          transformOrigin: 'top left',
          border: 'none',
          backgroundColor: 'transparent',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      />
      {isEditMode && (
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 6,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          🎮 Controller Overlay ({resolvedSkin})
        </div>
      )}
    </div>
  )
})
