// yeaboi duck desktop pet — behavior.
//
// A tiny state machine drives the duck along the bottom of the screen:
//   WANDER  — pick a spot, walk toward it, then idle a beat, repeat
//               (standing still when the "walk around" preference is off)
//   FLEE    — cursor got close: bolt along the ground away from it
//               (only when the "avoid the cursor" preference is on)
//   STARTLE — cursor got TOO close (or you clicked): hop with a yelp
//   DRAG    — you grabbed it: it follows the cursor until you let go
//
// The ground is DOCK-AWARE: the duck stands on the desktop floor (screen
// bottom) at the sides, and climbs UP onto the dock where the dock physically
// sits (its rect comes from main via Accessibility). One shared vertical
// physics (baseY + vy under gravity) handles walking, hops, climbs, drops and
// drag-release falls. Cursor position is fed from main so the duck reacts to
// your mouse anywhere on screen.
//
// Size, colour and both behaviour switches arrive as `pet:prefs`. Size is not
// only a width: every distance and acceleration below is in pixels, so they
// scale with the duck or a big one waddles like a toy.

const walker = document.getElementById('duck-walker');
const rig = document.getElementById('duck-rig');
const body = document.getElementById('duck-body');
const bubble = document.getElementById('duck-bubble');
const footFront = rig.querySelector('.d-foot-front');
const footBack = rig.querySelector('.d-foot-back');

// --- geometry -------------------------------------------------------------
let DUCK_W = rig.offsetWidth || 72;
let RIGH = 72; // rig height, refined once the base sprite loads
const FEET_FRAC = 0.975; // sprite's feet-bottom as a fraction of rig height (measured: 496/509)
let SURFACE_RAISE = 20; // extra lift so it stands ON the surface, not sunk into it (pref)
const FLOOR_MARGIN = 10; // desktop floor: feet this far above the screen's bottom (raises the side-floor)
const HIT_PAD = 3; // hitbox inset — small, so nearly the whole sprite counts
// The window is click-through until the renderer says the cursor is over the
// duck, and the cursor feed is a poll. Turning solid slightly BEFORE the
// pointer arrives is what makes the first click land instead of falling through
// to the app underneath. Small, because solid pixels steal those clicks.
const SOLID_MARGIN = 8;

// dock geometry (window-local), from main; floor-only until it arrives
let dock = { present: false, x: 0, top: 0, w: 0, h: 0 };
let bottomInset = 0;

function floorSurfaceY() {
  return window.innerHeight - FLOOR_MARGIN;
}
// The contact surface (where the feet land) at a given horizontal center.
function surfaceAt(cx) {
  if (dock.present && cx >= dock.x && cx <= dock.x + dock.w) return dock.top;
  return floorSurfaceY();
}
// rig-top y whose feet rest on the surface at center cx (lifted so the duck
// stands on top of the surface rather than sinking its feet into it)
function groundBaseY(cx) {
  return surfaceAt(cx) - RIGH * FEET_FRAC - SURFACE_RAISE;
}

window.pet.onConfig((c) => {
  if (!c) return;
  if (typeof c.bottomInset === 'number') bottomInset = c.bottomInset;
  if (c.dock) dock = c.dock.present ? c.dock : { present: false, x: 0, top: 0, w: 0, h: 0 };
});

// --- state ----------------------------------------------------------------
let x = window.innerWidth * 0.5 - DUCK_W / 2; // left edge of the rig
let baseY = 0; // rig top y (set in boot once RIGH known)
let vx = 0;
let vy = 0;
let dir = -1; // facing: see applyFacing()
let grounded = true;
let mode = 'wander';
let targetX = x;
let idleUntil = 0;
let jumpCd = 0;
let dragDX = 0;
let dragDY = 0;
let dragging = false;
let tvx = 0; // smoothed drag velocity (for throwing)
let tvy = 0;
let tumbling = false; // mid-throw: physics-only until it settles
let gait = 0; // gait phase accumulator, advances with distance travelled

// Everything below is quoted for a scale-1 (72px) duck; applyPrefs() rescales.
const BASE = {
  stride: 24, // px travelled per full step cycle (bigger = slower cadence)
  footLift: 5, // how high a foot lifts during its swing (px)
  throwMin: 6, // release speed above which a drop becomes a throw
  throwMax: 42, // release speed is clamped here, so a flick cannot launch it off-screen
  walkSpeed: 0.9,
  fleeSpeed: 3.4, // scurry speed — slow enough that a quick cursor can overtake and grab it
  fleeRadius: 150,
  fleeCeiling: 120, // a cursor higher above the duck than this is not a threat
  gravity: 1.1, // px/frame^2
  vmax: 18, // terminal fall speed
  look: 26, // how far ahead the duck looks for a step-up
  startleVy: -13,
  startlePush: 5,
  hopPush: 2.6,
  hopClear: 18, // extra height a climb hop clears the step by
  still: 0.15, // speeds below this are "not moving", for the gait and the walk class
};

let S = 1; // the size multiplier every distance above is measured in
let STRIDE = BASE.stride;
let FOOT_LIFT = BASE.footLift;
let THROW_MIN = BASE.throwMin;
let walkAbout = true; // wander, rather than standing where it was put
let evadeCursor = false; // flee an approaching cursor

let mx = -9999;
let my = -9999;
let interactive = false;

// --- secondary motion springs (procedural "juice") ------------------------
// Each spring is {p: position, v: velocity}. `springTo` nudges it toward a
// target with stiffness k and damping d — low d = bouncier follow-through.
// We inject velocity impulses on discrete events (land, turn) and let the
// spring settle. NO squash/scale — the duck keeps its shape; the life comes
// from a gentle lean into motion, a jelly sway on turns, and a small vertical
// bounce when it lands.
const bnc = { p: 0, v: 0 }; // vertical bounce offset (px, +down)
const lean = { p: 0, v: 0 }; // body tilt (deg), leans into travel + fall
const sway = { p: 0, v: 0 }; // jelly follow-through (deg) on accel/turns
let prevVx = 0;
function springTo(s, target, k, d) {
  s.v += (target - s.p) * k;
  s.v *= d;
  s.p += s.v;
}

const now = () => performance.now();
const rand = (a, b) => a + Math.random() * (b - a);

// --- personality (ported from the landing mascot) -------------------------
const REACTIONS = ['whoa!', 'hey! 🦆', 'eek!', 'missed me!', 'nope!', 'rude! 🦆'];
const IDLE_LINES = ['yeaboi!', 'just vibing 🦆', 'nice dock', '🦆', 'quack.', 'brb, waddling'];
let sayIdx = 0;
let bubbleShown = false;
let bubbleHideT = null;
// A sticky line is a question yeaboi is waiting on an answer to (a ship gate).
// It holds the bubble until the duck is clicked, and nothing chattier may take
// it — a question that fades out unanswered is worse than one never asked.
let stickyLine = false;
let noticeRoute = '';
// The first time out: he lands, says where he lives, and waits to be sent back.
// While this is set a click means "head back in" rather than "open a page".
let introducing = false;
let introTimer = 0;
/** Where in the app window he came from, so he can go back to exactly there.
 *  Window-local, because that is the space this overlay works in. */
let homePoint = null;
/** An arc flown under its own steam rather than under gravity: the trip home.
 *  `{ from, to, apex, start }`, all window-local. */
let homing = null;
/** He is home, and the app is drawing him again. Physics stays off until the
 *  window hides him — otherwise gravity resumes the frame the arc ends and he
 *  drops straight back out of the corner he just climbed into. */
let parked = false;
/** boot() has run. Until it has, the rig is unmeasured and the floor unknown. */
let booted = false;
/** An arrival that landed before boot did, replayed once it has. */
let pendingArrival = null;

function say(line, sticky = false) {
  if (stickyLine && !sticky) return;
  bubble.textContent = line;
  bubble.classList.remove('say');
  void bubble.offsetWidth;
  bubble.classList.add('say', 'show');
  bubbleShown = true;
  stickyLine = sticky;
  clearTimeout(bubbleHideT);
  if (!sticky) bubbleHideT = setTimeout(hideBubble, 2600);
}
function hideBubble() {
  bubble.classList.remove('show');
  bubbleShown = false;
  stickyLine = false;
}
function positionBubble() {
  if (!bubbleShown) return;
  const cx = x;
  const headY = baseY + 6;
  const vw = window.innerWidth;
  const toLeft = cx + DUCK_W + 230 > vw;
  bubble.classList.toggle('flip', toLeft);
  bubble.style.top = headY + 'px';
  if (toLeft) {
    bubble.style.right = vw - cx + 12 + 'px';
    bubble.style.left = 'auto';
  } else {
    bubble.style.left = cx + DUCK_W + 12 + 'px';
    bubble.style.right = 'auto';
  }
}

// --- facing ---------------------------------------------------------------
// Sprite is drawn facing LEFT. scaleX(1) keeps that; scaleX(-1) faces right.
function applyFacing() {
  if (vx > 0.2 * S) dir = -1;
  else if (vx < -0.2 * S) dir = 1;
}

// --- feet (procedural gait) -----------------------------------------------
// Phase advances with DISTANCE travelled, not time, so the planted foot moves
// backward at exactly the body's forward speed → it looks planted on the
// ground while the other foot swings forward in an arc. The two feet are half a
// cycle apart. `front` is the direction of travel; multiplying the screen-x by
// `dir` cancels the walker's scaleX(dir) flip.
function footOffset(p, front) {
  if (p < 0.5) {
    const s = p / 0.5; // stance: planted, slides front → back
    return { x: front * (STRIDE / 2 - s * STRIDE), y: 0 };
  }
  const s = (p - 0.5) / 0.5; // swing: back → front, lifted in an arc
  return { x: front * (-STRIDE / 2 + s * STRIDE), y: -FOOT_LIFT * Math.sin(s * Math.PI) };
}
function driveFeet() {
  const spd = Math.abs(vx);
  const walkGait = grounded && !tumbling;
  const amt = walkGait ? Math.min(1, spd / (0.8 * S)) : 0; // neutral feet when stopped / airborne
  if (walkGait && spd > BASE.still * S) gait += spd / STRIDE;
  const front = vx >= 0 ? 1 : -1;
  const fF = footOffset(gait % 1, front);
  const fB = footOffset((gait + 0.5) % 1, front);
  footFront.style.transform = `translate(${(fF.x * dir * amt).toFixed(2)}px, ${(fF.y * amt).toFixed(2)}px)`;
  footBack.style.transform = `translate(${(fB.x * dir * amt).toFixed(2)}px, ${(fB.y * amt).toFixed(2)}px)`;
}

// --- interaction ----------------------------------------------------------
// Is the cursor on the duck, give or take `pad`? This decides only whether the
// window is solid; the click itself is bounded by .duck-rig's pointer-events.
function overDuck(pad) {
  const cx = x + DUCK_W / 2;
  const cy = baseY + RIGH / 2;
  return (
    Math.abs(mx - cx) <= DUCK_W / 2 - HIT_PAD + pad && Math.abs(my - cy) <= RIGH / 2 - HIT_PAD + pad
  );
}
function setInteractive(on) {
  if (on === interactive) return;
  interactive = on;
  window.pet.setInteractive(on);
  // show the grab hand whenever the duck is hover-grabbable (the window is only
  // solid over the duck, so this cursor only ever appears on it)
  if (!dragging) document.body.style.cursor = on ? 'grab' : 'default';
}
window.pet.onCursor((p) => {
  mx = p.x;
  my = p.y;
  setInteractive(dragging || overDuck(SOLID_MARGIN));
});

rig.addEventListener('mousedown', (e) => {
  e.preventDefault();
  dragging = true;
  tumbling = false;
  mode = 'drag';
  vx = 0;
  vy = 0;
  tvx = 0;
  tvy = 0;
  dragDX = mx - x;
  dragDY = my - baseY;
  rig.classList.add('grabbing');
  document.body.style.cursor = 'grabbing';
  walker.classList.remove('walking');
});
window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  rig.classList.remove('grabbing');
  document.body.style.cursor = interactive ? 'grab' : 'default';
  const speed = Math.hypot(tvx, tvy);
  if (speed > THROW_MIN) {
    // Throw: launch with the release velocity and let physics tumble it to a
    // stop (it arcs, hits the ground, bounces, bounces off the side walls).
    tumbling = true;
    mode = 'throw';
    const cap = BASE.throwMax * S;
    vx = Math.max(-cap, Math.min(cap, tvx));
    vy = Math.max(-cap, Math.min(cap, tvy));
    grounded = false;
    sway.v += Math.max(-16, Math.min(16, tvx / S)); // spin flair in the throw direction
    walker.classList.add('airborne');
    if (Math.random() < 0.85)
      say(['wheee!', 'yeaboi!', 'wooo 🦆', 'aaah!', 'again!'][Math.floor(Math.random() * 5)]);
  } else {
    // Gentle drop → fall back to the fixed resting height. Dragging just moves
    // the duck around; it doesn't redefine where it stands.
    mode = 'wander';
    vy = 0;
    idleUntil = now() + rand(150, 500);
    pickTarget();
  }
});
rig.addEventListener('click', () => {
  if (dragging) return;
  // While the duck is holding a question, a click answers it — it opens the
  // page that resolves it rather than making him hop.
  // Mid-introduction a click means "off you go" — he has no page to open yet.
  if (introducing) {
    headBackIn();
    return;
  }
  if (stickyLine) {
    const route = noticeRoute;
    noticeRoute = '';
    hideBubble();
    window.pet.open(route);
    return;
  }
  startle(mx > x + DUCK_W / 2 ? -1 : 1);
});

// --- hop / climb ----------------------------------------------------------
function startle(pushDir) {
  if (!grounded || now() < jumpCd) return;
  jumpCd = now() + 2000;
  vy = BASE.startleVy * S;
  vx += pushDir * BASE.startlePush * S;
  grounded = false;
  walker.classList.add('startled', 'airborne');
  if (bubbleShown || Math.random() < 0.9) say(REACTIONS[sayIdx++ % REACTIONS.length]);
  setTimeout(() => walker.classList.remove('startled'), 1350);
}
// jump sized to clear a step of height `h`, with clearance
function hopTo(h, pushDir) {
  vy = -Math.sqrt(2 * BASE.gravity * S * (h + BASE.hopClear * S));
  vx += pushDir * BASE.hopPush * S;
  grounded = false;
  jumpCd = now() + 700;
  walker.classList.add('airborne');
}

// --- wander ---------------------------------------------------------------
function pickTarget() {
  const margin = 20;
  targetX = rand(margin, window.innerWidth - DUCK_W - margin);
  idleUntil = now() + rand(400, 1800);
}
pickTarget();

setInterval(() => {
  if (!dragging && mode !== 'flee' && !bubbleShown && Math.random() < 0.5) {
    say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)]);
  }
}, 7000);

// --- main loop ------------------------------------------------------------
function step() {
  requestAnimationFrame(step);
  const t = now();
  const center = x + DUCK_W / 2;
  const gap = mx - center;
  const near =
    evadeCursor && Math.abs(gap) < BASE.fleeRadius * S && my > baseY - BASE.fleeCeiling * S;

  // Parked: standing in the app's corner, waiting to be hidden. Holding the
  // last frame is the whole job — one tick of gravity here is a duck falling
  // back out of the window he has just climbed into.
  if (parked) return;

  if (homing) {
    flyHome(t);
    driveFeet();
    walker.style.transform = `translate(${x.toFixed(1)}px, ${baseY.toFixed(1)}px) scaleX(${dir})`;
    body.style.transform = `rotate(${lean.p.toFixed(2)}deg)`;
    positionBubble();
    return;
  }

  if (dragging) {
    const nx = Math.max(0, Math.min(window.innerWidth - DUCK_W, mx - dragDX));
    const ny = my - dragDY;
    tvx = 0.5 * tvx + 0.5 * (nx - x); // smoothed pointer velocity → throw impulse
    tvy = 0.5 * tvy + 0.5 * (ny - baseY);
    x = nx;
    baseY = ny;
  } else {
    // ---- horizontal intent ----
    if (tumbling) {
      vx *= grounded ? 0.84 : 0.995; // air keeps momentum; ground drags it down
    } else {
      let desired = 0;
      if (near) {
        // scurry away as the cursor closes in (the "catch me" game) — but no
        // teleport-hop on proximity: that launched it out of reach every time.
        // You can grab it mid-scurry; clicking it still makes it hop.
        mode = 'flee';
        const closeness = 1 - Math.abs(gap) / (BASE.fleeRadius * S);
        const away = gap >= 0 ? -1 : 1;
        desired = away * BASE.fleeSpeed * S * (0.45 + 0.55 * closeness);
        const atWall = (away < 0 && x < 8) || (away > 0 && x > window.innerWidth - DUCK_W - 8);
        if (atWall) startle(away); // only hop when cornered against a wall
      } else if (!walkAbout || t < idleUntil) {
        // Standing still is still physics: it falls when dropped and hops when
        // clicked, it just never picks somewhere to be.
        mode = 'wander';
        desired = 0;
      } else {
        mode = 'wander';
        const d = targetX - x;
        if (Math.abs(d) < 3 * S) {
          pickTarget();
          desired = 0;
        } else {
          desired = Math.sign(d) * BASE.walkSpeed * S;
        }
      }
      vx += (desired - vx) * 0.15;

      // ---- step-up: climb onto the dock when there's a higher surface ahead ----
      if (grounded && Math.abs(vx) > 0.2 * S && t > jumpCd) {
        const mvDir = vx >= 0 ? 1 : -1;
        const curSurf = surfaceAt(center);
        const aheadSurf = surfaceAt(center + mvDir * BASE.look * S);
        if (aheadSurf < curSurf - 6) hopTo(curSurf - aheadSurf, mvDir);
      }
    }

    x += vx;

    // ---- soft walls (bouncier while tumbling) ----
    if (x < 0) {
      x = 0;
      vx *= tumbling ? -0.62 : -0.5;
      if (!tumbling && mode === 'wander') pickTarget();
    } else if (x > window.innerWidth - DUCK_W) {
      x = window.innerWidth - DUCK_W;
      vx *= tumbling ? -0.62 : -0.5;
      if (!tumbling && mode === 'wander') pickTarget();
    }

    // ---- vertical physics (gravity + landing on the surface under us) ----
    const gnd = groundBaseY(x + DUCK_W / 2);
    vy += BASE.gravity * S;
    if (vy > BASE.vmax * S) vy = BASE.vmax * S;
    baseY += vy;
    if (baseY >= gnd && vy >= 0) {
      const impact = vy; // fall speed at the moment of touchdown
      baseY = gnd;
      vy = 0;
      if (!grounded) {
        grounded = true;
        bnc.v += Math.min(9, 1.5 + (impact / S) * 0.5) * S; // small downward bounce, scaled by impact
        if (tumbling && impact > 6 * S) {
          vy = -impact * 0.42; // bounce back up
          grounded = false;
          sway.v += (vx >= 0 ? 1 : -1) * 6;
        } else {
          walker.classList.remove('airborne');
          if (tumbling) {
            tumbling = false; // settled
            mode = 'wander';
            idleUntil = now() + rand(200, 700);
            pickTarget();
          }
        }
      }
    } else {
      grounded = false;
    }
  }

  applyFacing();
  const moving = !dragging && !tumbling && grounded && Math.abs(vx) > 0.18 * S;
  walker.classList.toggle('walking', moving);
  driveFeet();

  // ---- secondary motion (no squash — bounce + lean + jelly sway) ----
  // turn/accel wobble: an impulse opposite the change in horizontal velocity
  // The springs are angles and a small offset, so they read the velocities in
  // scale-1 units — a bigger duck leans the same amount, not twice as far.
  if (!dragging) sway.v += (-(vx - prevVx) * 1.7) / S;
  prevVx = vx;
  springTo(bnc, 0, 0.2, 0.7); // vertical bounce settles back to rest
  const leanTarget = dragging
    ? 0
    : (-vx * 2.3) / S + (grounded ? 0 : Math.max(-9, Math.min(9, (vy / S) * 0.55)));
  springTo(lean, leanTarget, 0.2, 0.75);
  springTo(sway, 0, 0.16, 0.78);

  body.style.transform = `translateY(${bnc.p.toFixed(2)}px) rotate(${(lean.p + sway.p).toFixed(2)}deg)`;

  walker.style.transform = `translate(${x.toFixed(1)}px, ${baseY.toFixed(1)}px) scaleX(${dir})`;
  positionBubble();
}

// --- preferences ----------------------------------------------------------
// Size is a CSS width plus a rescale of every distance and acceleration above;
// colour is two filter variables; the two switches are read by the main loop.
function applyPrefs(p) {
  if (!p || typeof p !== 'object') return;
  const style = document.documentElement.style;
  if (typeof p.scale === 'number' && p.scale > 0) {
    S = p.scale;
    style.setProperty('--duck-w', (72 * S).toFixed(1) + 'px');
    STRIDE = BASE.stride * S;
    FOOT_LIFT = BASE.footLift * S;
    THROW_MIN = BASE.throwMin * S;
  }
  if (typeof p.hue === 'number') style.setProperty('--duck-hue', p.hue.toFixed(0) + 'deg');
  if (typeof p.vividness === 'number') style.setProperty('--duck-sat', p.vividness.toFixed(2));
  if (typeof p.raise === 'number') SURFACE_RAISE = p.raise;
  if (typeof p.walk === 'boolean') walkAbout = p.walk;
  if (typeof p.evade === 'boolean') evadeCursor = p.evade;

  // The new width has to reach layout before the rig can be measured, and the
  // duck has to be re-seated on the ground or a resize leaves it floating.
  measure();
  x = Math.max(0, Math.min(window.innerWidth - DUCK_W, x));
  if (grounded) baseY = groundBaseY(x + DUCK_W / 2);
  if (walkAbout) pickTarget();
}

function measure() {
  DUCK_W = rig.offsetWidth || DUCK_W;
  RIGH = rig.offsetHeight || RIGH;
}

window.pet.onPrefs(applyPrefs);

// --- boot -----------------------------------------------------------------
function boot() {
  measure();
  booted = true;
  walker.classList.remove('unloaded');
  if (pendingArrival) {
    // He is taking over from the duck the app was drawing, at a known point.
    // No hatch, no greeting, no centre-screen default: each of them is a
    // visible seam in something meant to read as one continuous duck.
    const arrival = pendingArrival;
    pendingArrival = null;
    applyArrival(arrival);
  } else {
    x = window.innerWidth * 0.5 - DUCK_W / 2;
    baseY = groundBaseY(x + DUCK_W / 2);
    walker.classList.add('hatch');
    say('yeaboi! 🦆');
  }
  requestAnimationFrame(step);
}

const baseImg = rig.querySelector('.d-base');
if (baseImg.complete) boot();
else baseImg.addEventListener('load', boot);

window.addEventListener('resize', () => {
  x = Math.min(x, window.innerWidth - DUCK_W);
});

// Awareness: something happened while nobody was looking. The main process
// decides what qualifies (app/awareness.py) — the duck only reads it out.
window.pet.onNotice((notice) => {
  noticeRoute = notice.route || '';
  say(notice.quip, !!notice.sticky);
});

// The duck has jumped out of the app window. He arrives at the point he left
// from, above the floor and falling — so the landing is the physics the rig
// already has, squash and all, rather than a second animation that has to be
// kept in step with it.
/** How far above the floor he appears, so the arrival ends in a real landing
 *  rather than a duck that is simply there. Scaled with the rig. */
const ARRIVAL_DROP = 120;

/** The line he holds until he is sent back in. */
const INTRO_STICKY = 'Settings \u25b8 Duck sets where I stand. Click me to head back in.';
/** How long the arrival line holds before the sticky one replaces it. */
const INTRO_BEAT_MS = 2600;
/** How long the trip back to the app window takes. */
const HOMING_MS = 780;

/** The jump out of the app window: a shove up and away from the nearer wall,
 *  with gravity doing the rest — the rig's own physics rather than a second
 *  animation that has to be kept in step with it.
 *
 *  `startleVy` is already negative (up is negative here) so it is used as it
 *  stands; negating it is a duck fired at the floor. Thrown rather than
 *  walked, because the horizontal intent that damps `vx` to nothing in three
 *  frames is skipped while tumbling — without it he drops where he stood
 *  instead of travelling. */
function leapOff() {
  vy = BASE.startleVy * S * 1.6;
  vx = (x > window.innerWidth * 0.5 ? -1 : 1) * BASE.walkSpeed * S * 9;
  tumbling = true;
  grounded = false;
  mode = 'throw';
  walker.classList.add('airborne');
}

function applyArrival(arrival) {
  parked = false;
  dragging = false;
  tumbling = false;
  homing = null;
  mode = 'wander';
  // He appears exactly where the app was drawing him. This overlay is
  // full-screen and sits above every window, so "inside the app" is just a
  // position on it — the app hides its own duck at the same instant, and there
  // is one duck throughout with nothing handed between two of them.
  x = Math.max(0, Math.min(window.innerWidth - DUCK_W, arrival.x - DUCK_W / 2));
  baseY = arrival.y - RIGH / 2;
  vx = 0;
  vy = 0;
  grounded = false;
  if (arrival.leap) leapOff();
  if (!arrival.intro) {
    // A leap with nothing to say: the app went away and he is coming out to
    // the desktop. He gets on with being a duck once he lands.
    if (!arrival.leap) say('yeaboi!');
    pickTarget();
    return;
  }
  homePoint = { x, y: baseY };
  introducing = true;
  clearTimeout(introTimer);
  // He stands where he lands: wandering off mid-sentence would drag the bubble
  // across the screen behind him.
  targetX = x;
  idleUntil = Number.POSITIVE_INFINITY;
  say("yeaboi! this is where I'll be when the app's out of the way.");
  introTimer = setTimeout(() => {
    if (introducing) say(INTRO_STICKY, true);
  }, INTRO_BEAT_MS);
}

// The arrival can beat `boot()` — main sends it on did-finish-load, and boot
// waits for the sprite to decode. Held until then, or boot would put him back
// in the middle of the screen a frame after he took over from the app.
window.pet.onArrive((arrival) => {
  if (!arrival) return;
  if (!booted) {
    pendingArrival = arrival;
    return;
  }
  applyArrival(arrival);
});

/** Send him home: an arc back to the exact spot in the app he came from. */
function headBackIn() {
  introducing = false;
  clearTimeout(introTimer);
  idleUntil = 0;
  hideBubble();
  if (!homePoint) {
    window.pet.introDone();
    return;
  }
  homing = {
    from: { x, y: baseY },
    to: { ...homePoint },
    apex: Math.min(baseY, homePoint.y) - 150 * S,
    start: now(),
  };
}

/** Advance the trip home. Owns the duck's position while it runs. */
function flyHome(t) {
  const k = Math.min(1, (t - homing.start) / HOMING_MS);
  const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  x = homing.from.x + (homing.to.x - homing.from.x) * ease;
  // Quadratic through from → apex → to, so the height is a real arc rather
  // than a straight line with a wobble on it.
  const a = homing.from.y;
  const b = homing.apex;
  const c = homing.to.y;
  baseY = (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;
  dir = homing.to.x < homing.from.x ? 1 : -1;
  lean.p = -14 * dir * (1 - Math.abs(0.5 - k) * 2);
  grounded = false;
  vx = 0;
  vy = 0;
  if (k >= 1) {
    homing = null;
    parked = true;
    window.pet.introDone();
  }
}

window.pet.onRecenter(() => {
  parked = false;
  dragging = false;
  mode = 'wander';
  x = window.innerWidth * 0.5 - DUCK_W / 2;
  baseY = groundBaseY(x + DUCK_W / 2);
  vx = 0;
  vy = 0;
  say('yeaboi!');
  pickTarget();
});
