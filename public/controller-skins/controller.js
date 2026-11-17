'use strict';
const skinClasses = { ps5_white: 'ps5', ps5_black: 'ps5-black', ps4_white: 'ds4 white', ps4_black: 'ds4', xbox_one: 'xbox' };
const requestedSkin = new URLSearchParams(window.location.search).get('skin');
const skin = Object.hasOwn(skinClasses, requestedSkin) ? requestedSkin : 'ps5_white';
const controller = document.getElementById('controller');
controller.className = 'controller ' + skinClasses[skin];
const stylesheet = document.getElementById('skin-style');
stylesheet.onload = function() {
  // Reveal the assembled skin once its sprites are cached, avoiding a frame
  // containing only whichever buttons happened to finish loading first.
  const urls = new Set();
  for (const element of [controller, ...controller.querySelectorAll('*')]) {
    const match = getComputedStyle(element).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    if (match) urls.add(match[1]);
  }
  Promise.all(Array.from(urls, url => new Promise(resolve => {
    const image = new Image();
    image.onload = image.onerror = resolve;
    image.src = url;
  }))).then(() => { controller.dataset.ready = 'true'; });
};
stylesheet.href = './' + skin + '.css';
const STICK_OFFSET = 20;
const DEADZONE = 0.08;
const isDpadGlowSkin = skin === 'ps5_white' || skin === 'xbox_one';

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
  if (!Array.isArray(buttons) || !Array.isArray(axes)) return;
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
  if (e.source === window.parent && e.data && e.data.type === 'gamepad-state') {
    applyState(e.data.buttons, e.data.axes);
  }
});
