// main.js - Final Wind Turbine Climb (pixel-built sprites, win/lose + restart)

const WIDTH = 480;
const HEIGHT = 640;

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: 0x87ceeb,
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

// Game state
let player;
let birdsFalling, birdsFlying;
let clouds;
let ladders;
let turretTop;
let keys;
let distanceFt = 200;
let distanceText, livesText;
let lives = 3;
let gameOver = false;
let scrollOffset = 0;
let climbThresholdY = 150; // when player hits this Y, scene scrolls instead of player moving up
let playerAnimTimer = 0;
let playerFrame = 0;
let winOverlay, loseOverlay, restartButton;
let lastDelta = 16;

// Bird tuning: 1.5x faster (base ranges multiplied), spawn delays 1.3x less frequent (delays multiplied)
const FLY_VX_MIN = 112;   // px/s
const FLY_VX_MAX = 165;   // px/s
const FALL_VY_MIN = 75;   // px/s
const FALL_VY_MAX = 150;  // px/s

const BASE_FALL_SPAWN = 900;   // ms (older baseline)
const BASE_FLY_SPAWN  = 1200;  // ms
const SPAWN_MULTIPLIER = 1.3;  // less frequent => multiply delay
const FALL_SPAWN_DELAY = Math.round(BASE_FALL_SPAWN * SPAWN_MULTIPLIER); // ~1170
const FLY_SPAWN_DELAY  = Math.round(BASE_FLY_SPAWN * SPAWN_MULTIPLIER);  // ~1560

function preload() {
  // no external files; we will generate textures in create()
}

function create() {
  // ------------- generate pixel textures via Graphics -------------
  const g = this.add.graphics();

  // BIRD: 24x24 frames, transparent background (don't clear to a filled rect)
  // frame 0: falling (wings up)
  g.clear();
  drawBirdFalling(g);
  g.generateTexture('bird0', 24, 24);

  // frame 1: flying A
  g.clear();
  drawBirdFlyA(g);
  g.generateTexture('bird1', 24, 24);

  // frame 2: flying B
  g.clear();
  drawBirdFlyB(g);
  g.generateTexture('bird2', 24, 24);

  // CLIMBER: two frames 32x32 (climb frames)
  g.clear();
  drawClimberFrameLeftArm(g);
  g.generateTexture('climber0', 32, 32);

  g.clear();
  drawClimberFrameRightArm(g);
  g.generateTexture('climber1', 32, 32);

  g.destroy();

  // ------------- scene elements -------------
  // Clouds group (rectangles)
  clouds = this.add.group();
  for (let i = 0; i < 6; i++) {
    const c = this.add.rectangle(
      Phaser.Math.Between(30, WIDTH - 30),
      Phaser.Math.Between(0, HEIGHT),
      Phaser.Math.Between(60, 120),
      24,
      0xffffff,
      0.85
    );
    clouds.add(c);
  }

  // Ladders: two lanes with poles and rungs
  ladders = [WIDTH / 3, (WIDTH / 3) * 2];
  ladders.forEach(x => {
    this.add.rectangle(x, HEIGHT / 2, 18, HEIGHT, 0xffffff);
    for (let ry = 40; ry < HEIGHT; ry += 40) {
      this.add.rectangle(x, ry, 36, 6, 0x888888);
    }
  });

  // Turbine top (off-screen initially, will scroll down when climbing)
  turretTop = this.add.container(WIDTH / 2, -300);
  const topBase = this.add.rectangle(0, 0, WIDTH * 1.1, 70, 0xaaaaaa);
  const topOutline = this.add.rectangle(0, 0, WIDTH * 1.1, 70).setStrokeStyle(2, 0x666666);
  turretTop.add([topBase, topOutline]);
  turretTop.setDepth(2);

  // ------------- player (physics sprite using generated texture) -------------
  player = this.physics.add.sprite(ladders[0], HEIGHT - 120, 'climber0');
  player.setDisplaySize(32, 32);
  player.setOrigin(0.5, 0.5);
  player.body.setSize(18, 28);
  player.setCollideWorldBounds(true);

  // ------------- birds groups -------------
  birdsFalling = this.physics.add.group();
  birdsFlying = this.physics.add.group();

  // collision handlers (overlaps)
  this.physics.add.overlap(player, birdsFalling, onHitBird, null, this);
  this.physics.add.overlap(player, birdsFlying, onHitBird, null, this);

  // HUD
  distanceText = this.add.text(12, 10, 'Height: 200.0 ft', { fontSize: '18px', color: '#000' }).setDepth(10);
  livesText = this.add.text(12, 36, 'Lives: 3', { fontSize: '18px', color: '#000' }).setDepth(10);

  // input
  keys = this.input.keyboard.addKeys({ W: 'W', S: 'S', A: 'A', D: 'D' });

  // spawners (less frequent by multiplier)
  this.time.addEvent({ delay: FALL_SPAWN_DELAY, loop: true, callback: spawnFallingBird, callbackScope: this });
  this.time.addEvent({ delay: FLY_SPAWN_DELAY, loop: true, callback: spawnFlyingBird, callbackScope: this });

  // overlays (hidden initially)
  winOverlay = createOverlayContainer(this, 0x00aa00, 'You Reached the Top!');
  loseOverlay = createOverlayContainer(this, 0xaa0000, 'GAME OVER');

  // pixel restart button created but hidden; will be shown on win/lose
  restartButton = createPixelButton(this, WIDTH / 2, HEIGHT / 2 + 60, '▶ RESTART');
  restartButton.setVisible(false);
  restartButton.getByName('btn').setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    restartGame(this);
  });
}

function update(time, delta) {
  if (gameOver) return;
  lastDelta = delta;

  const climbPx = 120 * (delta / 1000); // base climb speed px per frame scaled

  let isClimbingUp = false;

  // Up
  if (keys.W.isDown) {
    // if player above threshold, scroll scene instead of moving player up
    if (player.y > climbThresholdY) {
      player.y -= climbPx;
    } else {
      // scroll all scenery downwards to simulate upward motion
      clouds.getChildren().forEach(c => {
        c.y += climbPx * 0.5;
        if (c.y > HEIGHT + 30) c.y = -30;
      });
      // move birds downward relative to screen so they appear to stay in world
      birdsFalling.getChildren().forEach(b => { b.y += climbPx; if (b.y > HEIGHT + 50) b.destroy(); });
      birdsFlying.getChildren().forEach(b => { b.y += climbPx; if (b.y > HEIGHT + 50) b.destroy(); });
      turretTop.y += climbPx;
      scrollOffset += climbPx;
    }
    isClimbingUp = true;
  }

  // Down
  if (keys.S.isDown) {
    // allow moving down, but do not increase distance (as requested earlier)
    player.y += climbPx;
  }

  // Ladders switch A/D instant
  if (Phaser.Input.Keyboard.JustDown(keys.A)) {
    player.x = ladders[0];
  }
  if (Phaser.Input.Keyboard.JustDown(keys.D)) {
    player.x = ladders[1];
  }

  // Climber frame animation (toggle while climbing)
  if (isClimbingUp || keys.S.isDown) {
    playerAnimTimer += delta;
    if (playerAnimTimer > 150) {
      playerAnimTimer = 0;
      playerFrame = 1 - playerFrame;
      player.setTexture(playerFrame === 0 ? 'climber0' : 'climber1');
    }
  } else {
    player.setTexture('climber0');
  }

  // Distance decreases only while actively holding W (climbing up)
  if (keys.W.isDown) {
    // reduce 200 ft over ~30,000 ms (30 seconds) continuous climbing
    const decreasePerMs = 200 / 30000; // ft per ms
    distanceFt -= decreasePerMs * delta;
    if (distanceFt < 0) distanceFt = 0;
    distanceText.setText('Height: ' + distanceFt.toFixed(1) + ' ft');
  }

  // If reached 0 ft and turretTop has scrolled into visible region (we only check distance here),
  // show win (we will also place climber on top visually)
  if (distanceFt <= 0 && !gameOver) {
    triggerWin(this);
  }

  // Update birds movement (flying horizontal only or falling vertical only)
  birdsFlying.getChildren().forEach(b => {
    // vx is px/sec
    b.x += b.vx * (delta / 1000);
    // wing animation swap (frame toggle)
    b._frameTimer = (b._frameTimer || 0) + delta;
    if (b._frameTimer >= 220) {
      b._frameTimer = 0;
      if (b._frame === 1) { b.setTexture('bird2'); b._frame = 2; }
      else { b.setTexture('bird1'); b._frame = 1; }
    }
    if (b.x < -40 || b.x > WIDTH + 40) b.destroy();
  });

  birdsFalling.getChildren().forEach(b => {
    b.y += b.vy * (delta / 1000);
    b.angle += b._spin * (delta / 1000); // cosmetic spin
    if (b.y > HEIGHT + 50) b.destroy();
  });
}

// ---------- sprite drawing helpers (pixel art using Graphics) ----------

function drawBirdFalling(g) {
  // small, mostly transparent canvas, paint bird shapes
  // body
  g.fillStyle(0x8a4b2b, 1); g.fillRect(4, 6, 16, 8);
  // belly
  g.fillStyle(0xe6b899, 1); g.fillRect(7, 9, 8, 4);
  // beak
  g.fillStyle(0xffa500, 1); g.fillRect(19, 10, 3, 2);
  // wing (up)
  g.fillStyle(0x6b3a25, 1); g.fillRect(1, 3, 8, 4);
  // subtle eye
  g.fillStyle(0x000000, 1); g.fillRect(6, 9, 1, 1);
}

function drawBirdFlyA(g) {
  g.fillStyle(0x8a4b2b, 1); g.fillRect(4, 8, 16, 6);
  g.fillStyle(0xe6b899, 1); g.fillRect(7, 10, 8, 3);
  g.fillStyle(0xffa500, 1); g.fillRect(19, 10, 3, 2);
  // wing up a bit
  g.fillStyle(0x6b3a25, 1); g.fillRect(1, 4, 8, 4);
  g.fillStyle(0x000000, 1); g.fillRect(6, 10, 1, 1);
}

function drawBirdFlyB(g) {
  g.fillStyle(0x8a4b2b, 1); g.fillRect(4, 8, 16, 6);
  g.fillStyle(0xe6b899, 1); g.fillRect(7, 10, 8, 3);
  g.fillStyle(0xffa500, 1); g.fillRect(19, 10, 3, 2);
  // wing down
  g.fillStyle(0x6b3a25, 1); g.fillRect(14, 12, 8, 4);
  g.fillStyle(0x000000, 1); g.fillRect(6, 10, 1, 1);
}

function drawClimberFrameLeftArm(g) {
  // minimal pixel shape in a 32x32 box
  // head
  g.fillStyle(0xffcc99, 1); g.fillRect(12, 4, 8, 8);
  // cap
  g.fillStyle(0xd32f2f, 1); g.fillRect(10, 2, 12, 3);
  // body
  g.fillStyle(0x1b7be0, 1); g.fillRect(12, 12, 8, 10);
  // backpack
  g.fillStyle(0xffd23b, 1); g.fillRect(6, 12, 6, 8);
  // left arm up
  g.fillStyle(0xd32f2f, 1); g.fillRect(8, 8, 4, 10);
  // right arm down
  g.fillStyle(0xd32f2f, 1); g.fillRect(20, 14, 4, 10);
  // legs
  g.fillStyle(0x244f8a, 1); g.fillRect(12, 22, 4, 8);
  g.fillStyle(0x244f8a, 1); g.fillRect(16, 22, 4, 8);
}

function drawClimberFrameRightArm(g) {
  g.fillStyle(0xffcc99, 1); g.fillRect(12, 4, 8, 8);
  g.fillStyle(0xd32f2f, 1); g.fillRect(10, 2, 12, 3);
  g.fillStyle(0x1b7be0, 1); g.fillRect(12, 12, 8, 10);
  g.fillStyle(0xffd23b, 1); g.fillRect(6, 12, 6, 8);
  // left arm down
  g.fillStyle(0xd32f2f, 1); g.fillRect(8, 14, 4, 10);
  // right arm up
  g.fillStyle(0xd32f2f, 1); g.fillRect(20, 8, 4, 10);
  g.fillStyle(0x244f8a, 1); g.fillRect(12, 22, 4, 8);
  g.fillStyle(0x244f8a, 1); g.fillRect(16, 22, 4, 8);
}

// ---------- spawners ----------

function spawnFallingBird() {
  if (gameOver) return;
  const vy = Phaser.Math.Between(FALL_VY_MIN, FALL_VY_MAX); // px/s (faster = 1.5x)
  const x = Phaser.Math.Between(40, WIDTH - 40);
  const b = this.physics.add.sprite(x, -20, 'bird0');
  b.setDisplaySize(24, 24);
  b.vy = vy;
  b._spin = Phaser.Math.FloatBetween(-120, 120); // deg/sec cosmetic
  b.body.setAllowGravity(false);
  birdsFalling.add(b);
}

function spawnFlyingBird() {
  if (gameOver) return;
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -40 : WIDTH + 40;
  const y = Phaser.Math.Between(80, HEIGHT - 140);
  const vx = (fromLeft ? Phaser.Math.Between(FLY_VX_MIN, FLY_VX_MAX) : -Phaser.Math.Between(FLY_VX_MIN, FLY_VX_MAX));
  const b = this.physics.add.sprite(x, y, 'bird1');
  b.setDisplaySize(24, 24);
  b.vx = vx; // px/sec
  b._frame = 1;
  b._frameTimer = 0;
  b.body.setAllowGravity(false);
  birdsFlying.add(b);
}

// ---------- collisions & endgame ----------

function onHitBird(playerSprite, birdSprite) {
  if (gameOver) return;
  // destroy bird, lose life
  birdSprite.destroy();
  lives -= 1;
  livesText.setText('Lives: ' + lives);
  // flash
  player.setTint(0xff0000);
  setTimeout(() => player.clearTint(), 200);

  if (lives <= 0) {
    triggerLose(this);
  }
}

function triggerWin(scene) {
  gameOver = true;
  // Place climber on top of turbineTop (center)
  // turretTop is container placed at turretTop.y; we position player on top center
  const topY = turretTop.y; // y of top center
  player.x = turretTop.x;
  player.y = topY - 35; // just above top
  player.setTexture('climber0');
  // show overlay and restart button
  winOverlay.setVisible(true);
  restartButton.setVisible(true);
  restartButton.setDepth(100);
}

function triggerLose(scene) {
  gameOver = true;
  loseOverlay.setVisible(true);
  restartButton.setVisible(true);
  restartButton.setDepth(100);
}

// ---------- UI helpers: overlays and pixel button ----------

function createOverlayContainer(scene, color, text) {
  const container = scene.add.container(0, 0).setDepth(90);
  container.setVisible(false);
  const rect = scene.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH - 60, 120, color);
  const label = scene.add.text(WIDTH / 2, HEIGHT / 2, text, { fontSize: '28px', color: '#fff' }).setOrigin(0.5);
  container.add([rect, label]);
  return container;
}

function createPixelButton(scene, x, y, label) {
  // red pixel-art button with a chunky border and block text
  const container = scene.add.container(x, y).setDepth(95);
  // base
  const base = scene.add.rectangle(0, 0, 200, 44, 0xaa0000);
  // inner border (lighter)
  const inner = scene.add.rectangle(0, 0, 190, 34, 0xff3333);
  // text (use larger font)
  const txt = scene.add.text(0, 0, label, { fontSize: '18px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
  // add a pixel border effect using small rectangles at corners (suggested retro look)
  container.add([base, inner, txt]);
  container.setVisible(false);
  container.setSize(200, 44);
  // name the button element for interactivity
  container.add([base]);
  container.getByName = (n) => base; // to keep compatibility
  // store references to allow .setInteractive externally
  container.getByName('btn'); // dummy; we'll return base directly in create()
  // we will return container but expose the base as 'btn' for event hook
  container.getByName = (n) => base;
  return container;
}

// ---------- restart ----------

function restartGame(scene) {
  // destroy birds
  birdsFalling.clear(true, true);
  birdsFlying.clear(true, true);

  // reset states
  lives = 3;
  livesText.setText('Lives: ' + lives);
  distanceFt = 200;
  distanceText.setText('Height: 200.0 ft');
  gameOver = false;
  scrollOffset = 0;

  // hide overlays & button
  winOverlay.setVisible(false);
  loseOverlay.setVisible(false);
  restartButton.setVisible(false);

  // reset turret top position
  turretTop.y = -300;

  // reset player pos and texture
  player.setTexture('climber0');
  player.x = ladders[0];
  player.y = HEIGHT - 120;
  player.clearTint();
}

