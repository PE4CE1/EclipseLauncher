import React, { useMemo } from 'react'

export type ControllerSkinId = 'ps4_white' | 'ps5_white' | 'ps4_black' | 'xbox_one'

interface ControllerOverlayProps {
  url?: string
  skin?: ControllerSkinId
  scale?: number
  isEditMode?: boolean
}

// Exact PS5 DualSense CSS provided by user
const PS5_CUSTOM_CSS = `
body { 
    background-color: #000000; 
    background-color: RGBA(0, 0, 0, 0); 
    margin: 0 auto; 
    overflow: hidden; 
} .controller.xbox{
    background: url(https://i.imgur.com/fJIyBwn.png) no-repeat 0 0;
    width: 807px;
    height: 651px;
    margin-left: 0;
    margin-top: 0;
} .xbox .sticks {
	width: 367px;
    height: 100px;
    left: 220px;
    top: 333px;
}.xbox .stick {
    background: url(https://i.imgur.com/nXaGdI2.png);
    width: 100px;
    height: 100px;
} .xbox .stick.pressed {
    background-position: -102px 0;
} .xbox .stick.right {
    top: 0;
    left: 267px;
} .xbox .abxy {
    width: 181px;
    height: 181px;
    left: 573px;
    top: 178px;
} .xbox .button {
    background: url(https://i.imgur.com/DVqDSsJ.png);
    width: 58px;
    height: 58px;
} .xbox .button.pressed {
  	background-position-y: -59px;
	margin-top: 0;
} .xbox .a {
    background-position: 0 0;
    left: 61px;
    top: 123px;
} .xbox .b {
    background-position: -59px 0;
    left: 123px;
    top: 62px;
} .xbox .x {
    background-position: -118px 0;
    left: 0px;
    top: 61px;
} .xbox .y {
    background-position: -177px 0;
    left: 61px;
    top: 0px;
} .xbox .arrows {
    left: 195px;
	top: 140px;
    width: 416px;
    height: 57px;
} .xbox .quadrant { 
    display: none; 
} .xbox .back, .xbox .start {
    background: url(https://i.imgur.com/YJRVQxC.png);
    width: 27px;
    height: 57px;
    opacity: 0;
} .xbox .start {
    background-position: 27px 0;
    float: right;
} .xbox .dpad {
	width: 144px;
    height: 144px;
    left: 71px;
    top: 196px;
} .xbox .face {
    background: url(https://i.imgur.com/hCmzXWK.png);
    position: absolute;
    opacity: 0;
} .xbox .face.up {
    background-position: 0 -68px;
    width: 52px;
    height: 63px;
    left: 46px;
} .xbox .face.down {
    background-position: -54px 63px;
    width: 52px;
    height: 63px;
    left: 46px;
    top: 81px;
} .xbox .face.left {
    background-position: -108px -68px;
    width: 64px;
    height: 52px;
    left: -1px;
    top: 47px; 
} .xbox .face.right {
    background-position: -175px -68px;
    width: 63px;
    height: 52px;
    left: 81px;
    top: 46px;
} .xbox .bumpers {
    width: 620px;
    height: 35px;
    left: 93px;
    top: 114px;
} .xbox .bumper {
    background: url(https://i.imgur.com/2YssqRT.png);
    width: 110px;
    height: 35px;
    opacity: 0;
} .xbox .triggers {
    width: 619px;
    height: 108px;
    left: 94px;
} .xbox .trigger {
    background: url(https://i.imgur.com/LsxmGBD.png);
    width: 111px;
    height: 108px;
    opacity: 0;
} .xbox .trigger.right {
    background-position: -113px 0;
	transform: rotateY(0);
}
`

function buildControllerHtml(activeSkin: ControllerSkinId): string {
  let skinClass = 'ds4 white'
  let injectedCss = ''

  if (activeSkin === 'ps5_white') {
    skinClass = 'xbox'
    injectedCss = PS5_CUSTOM_CSS
  } else if (activeSkin === 'ps4_black') {
    skinClass = 'ds4'
  } else if (activeSkin === 'xbox_one') {
    skinClass = 'xbox'
  } else {
    skinClass = 'ds4 white'
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
.controller .trigger { position: absolute; }
.controller .bumpers { position: absolute; width: 100%; }
.controller .bumper { position: absolute; }
.controller .arrows { position: absolute; }
.controller .back, .controller .start { position: absolute; }
.controller .abxy { position: absolute; }
.controller .button { position: absolute; }
.controller .dpad { position: absolute; }
.controller .face { position: absolute; }
.controller .sticks { position: absolute; }
.controller .stick { position: absolute; }

/* ─── PS4 Classic & PS4 White/Red ─── */
.controller.ds4 {
  background: url(https://gamepadviewer.com/ps4-assets/base.svg) no-repeat 0 0;
  width: 800px;
  height: 600px;
}
.controller.ds4.white {
  background: url(https://gamepadviewer.com/ps4-white-assets/base.svg) no-repeat 0 0;
  width: 800px;
  height: 600px;
}
.ds4 .triggers { width: 588px; height: 94px; top: 0; left: 107px; }
.ds4 .trigger { background: url(https://gamepadviewer.com/ps4-assets/triggers.svg); width: 99px; height: 94px; opacity: 0; }
.ds4.white .trigger { background: url(https://gamepadviewer.com/ps4-white-assets/triggers.svg); }
.ds4 .trigger.left { left: 0; }
.ds4 .trigger.right { right: 0; background-position-x: 99px; }
.ds4 .bumpers { width: 594px; height: 42px; top: 88px; left: 103px; }
.ds4 .bumper { background: url(https://gamepadviewer.com/ps4-assets/bumper.svg); width: 110px; height: 42px; opacity: 0; }
.ds4.white .bumper { background: url(https://gamepadviewer.com/ps4-white-assets/bumper.svg); }
.ds4 .bumper.left { left: 0; }
.ds4 .bumper.right { right: 0; background-position-x: 110px; }
.ds4 .arrows { width: 352px; height: 46px; top: 142px; left: 227px; }
.ds4 .back, .ds4 .start { background: url(https://gamepadviewer.com/ps4-assets/start.svg); width: 28px; height: 46px; opacity: 0; }
.ds4.white .back, .ds4.white .start { background: url(https://gamepadviewer.com/ps4-white-assets/start.svg); }
.ds4 .back { float: left; }
.ds4 .start { float: right; background-position: 28px 0; }
.ds4 .abxy { width: 170px; height: 171px; top: 159px; left: 567px; }
.ds4 .button { width: 55px; height: 55px; background: url(https://gamepadviewer.com/ps4-assets/face.svg); }
.ds4.white .button { background: url(https://gamepadviewer.com/ps4-white-assets/face.svg); }
.ds4 .button.pressed { background-position-y: 55px; }
.ds4 .button.a { background-position: 0 0; bottom: 0; left: 58px; }
.ds4 .button.b { background-position: -57px 0; top: 58px; right: 0px; }
.ds4 .button.x { background-position: -113px 0; top: 58px; left: 0; }
.ds4 .button.y { background-position: 55px 0; left: 58px; top: 0; }
.ds4 .sticks { width: 361px; height: 105px; top: 308px; left: 228px; }
.ds4 .stick { background: url(https://gamepadviewer.com/ps4-assets/sticks.svg); height: 94px; width: 94px; }
.ds4.white .stick { background: url(https://gamepadviewer.com/ps4-white-assets/sticks.svg); }
.ds4 .stick.pressed.left { background-position-x: -96px; }
.ds4 .stick.pressed.right { background-position-x: -192px; }
.ds4 .stick.left { top: 0; left: 0; }
.ds4 .stick.right { top: 0; left: 267px; }
.ds4 .dpad { width: 125px; height: 126px; top: 181px; left: 92px; }
.ds4 .face { background: url(https://gamepadviewer.com/ps4-assets/dpad.svg); }
.ds4.white .face { background: url(https://gamepadviewer.com/ps4-white-assets/dpad.svg); }
.ds4 .face.up { width: 36px; height: 52px; left: 44px; top: 0; background-position: -37px 0px; }
.ds4 .face.down { width: 36px; height: 52px; left: 44px; bottom: 0; background-position: 0px 0; }
.ds4 .face.left { width: 52px; height: 36px; top: 45px; left: 0; background-position: 104px 0; }
.ds4 .face.right { width: 52px; height: 36px; top: 45px; right: 0px; background-position: 52px 0; }
.ds4 .face.pressed { background-position-y: 52px; }

/* ─── Xbox One ─── */
.controller.xbox {
  background: url(https://gamepadviewer.com/xbox-assets/base.svg) no-repeat 0 0;
  width: 764px;
  height: 566px;
}
.xbox .triggers { width: 564px; height: 103px; top: 0; left: 100px; }
.xbox .trigger { background: url(https://gamepadviewer.com/xbox-assets/trigger.svg); width: 109px; height: 103px; opacity: 0; }
.xbox .trigger.left { left: 0; }
.xbox .trigger.right { right: 0; transform: rotateY(180deg); }
.xbox .bumpers { width: 574px; height: 49px; top: 78px; left: 95px; }
.xbox .bumper { background: url(https://gamepadviewer.com/xbox-assets/bumper.svg); width: 154px; height: 49px; opacity: 0; }
.xbox .bumper.left { left: 0; }
.xbox .bumper.right { right: 0; transform: rotateY(180deg); }
.xbox .arrows { width: 154px; height: 38px; top: 188px; left: 305px; }
.xbox .back, .xbox .start { background: url(https://gamepadviewer.com/xbox-assets/start.svg); width: 38px; height: 38px; opacity: 0; }
.xbox .back { float: left; }
.xbox .start { float: right; background-position: 38px 0; }
.xbox .abxy { width: 170px; height: 171px; top: 120px; left: 512px; }
.xbox .button { width: 54px; height: 54px; background: url(https://gamepadviewer.com/xbox-assets/face.svg); }
.xbox .button.pressed { background-position-y: 54px; }
.xbox .button.a { background-position: 0 0; bottom: 0; left: 58px; }
.xbox .button.b { background-position: -54px 0; top: 58px; right: 0px; }
.xbox .button.x { background-position: -108px 0; top: 58px; left: 0; }
.xbox .button.y { background-position: -162px 0; left: 58px; top: 0; }
.xbox .sticks { width: 442px; height: 215px; top: 126px; left: 130px; }
.xbox .stick { background: url(https://gamepadviewer.com/xbox-assets/stick.svg); height: 95px; width: 95px; }
.xbox .stick.pressed { background-position-y: 95px; }
.xbox .stick.left { top: 0; left: 0; }
.xbox .stick.right { top: 120px; left: 347px; }
.xbox .dpad { width: 116px; height: 116px; top: 252px; left: 247px; }
.xbox .face { background: url(https://gamepadviewer.com/xbox-assets/dpad.svg); }
.xbox .face.up { width: 36px; height: 46px; left: 40px; top: 0; background-position: 0 0; }
.xbox .face.down { width: 36px; height: 46px; left: 40px; bottom: 0; background-position: -36px 0; }
.xbox .face.left { width: 46px; height: 36px; top: 40px; left: 0; background-position: -72px 0; }
.xbox .face.right { width: 46px; height: 36px; top: 40px; right: 0; background-position: -118px 0; }
.xbox .face.pressed { background-position-y: 46px; }

${injectedCss}
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

    function applyDeadzone(v) {
      return Math.abs(v) < DEADZONE ? 0 : v;
    }

    function togglePressed(id, isPressed) {
      const el = document.getElementById(id);
      if (!el) return;
      if (isPressed) {
        el.classList.add('pressed');
        el.style.opacity = '1';
      } else {
        el.classList.remove('pressed');
        if (!id.includes('trigger')) el.style.opacity = '';
      }
    }

    function loop() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) { gp = gamepads[i]; break; }
      }

      if (gp) {
        const b = gp.buttons;
        const btn = (i) => Boolean(b[i]?.pressed || (b[i]?.value && b[i].value > 0.25));
        const val = (i) => b[i]?.value !== undefined ? b[i].value : (b[i]?.pressed ? 1 : 0);

        // ABXY
        togglePressed('btn-a', btn(0));
        togglePressed('btn-b', btn(1));
        togglePressed('btn-x', btn(2));
        togglePressed('btn-y', btn(3));

        // Bumpers
        togglePressed('bumper-l', btn(4));
        togglePressed('bumper-r', btn(5));

        // Triggers
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

        // Back / Start
        togglePressed('btn-back', btn(8));
        togglePressed('btn-start', btn(9));

        // L3 / R3
        togglePressed('stick-l', btn(10));
        togglePressed('stick-r', btn(11));

        // D-Pad
        togglePressed('dpad-up', btn(12));
        togglePressed('dpad-down', btn(13));
        togglePressed('dpad-left', btn(14));
        togglePressed('dpad-right', btn(15));

        // Sticks
        const lx = applyDeadzone(gp.axes[0] || 0) * STICK_OFFSET;
        const ly = applyDeadzone(gp.axes[1] || 0) * STICK_OFFSET;
        const rx = applyDeadzone(gp.axes[2] || 0) * STICK_OFFSET;
        const ry = applyDeadzone(gp.axes[3] || 0) * STICK_OFFSET;

        const stickL = document.getElementById('stick-l');
        const stickR = document.getElementById('stick-r');
        if (stickL) stickL.style.transform = 'translate(' + lx + 'px, ' + ly + 'px)';
        if (stickR) stickR.style.transform = 'translate(' + rx + 'px, ' + ry + 'px)';
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
  const finalScale = (scale || 80) / 100

  // Determine active skin
  const resolvedSkin: ControllerSkinId = useMemo(() => {
    if (skin) return skin
    if (url?.includes('FPS5') || url?.includes('PS5')) return 'ps5_white'
    if (url?.includes('s=5')) return 'ps4_black'
    if (url?.includes('s=1')) return 'xbox_one'
    return 'ps4_white'
  }, [skin, url])

  // Dimensions
  const BASE_WIDTH = 820
  const BASE_HEIGHT = 680
  const containerWidth = Math.round(BASE_WIDTH * (finalScale * 0.52))
  const containerHeight = Math.round(BASE_HEIGHT * (finalScale * 0.52))

  const htmlContent = useMemo(() => buildControllerHtml(resolvedSkin), [resolvedSkin])

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
