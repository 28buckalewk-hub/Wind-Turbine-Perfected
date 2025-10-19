// main.js — Pixel-built sprites, scrolling, distance, lives

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
let player, playerFrameTimer = 0, playerFrame = 0;
let birdsFalling, birdsFlying, clouds;
let ladders;
let lives = 3;
let livesText, distanceText;
let distanceFt = 200; // starts at 200 ft
let gameOver = false;
let turretTop;
let climbThresholdY = 150; // y at which player stops moving up and scene scrolls instead
let scrollOffset = 0; // how far we've scrolled
let lastDelta = 16;

function preload() {
  // nothing external
}

function create() {
  const scene = this;

  // --- Generate bird textures (24x24) as pixel art ---
  const g = this.add.graphics();
  // bird frame 0: falling (wings up)
  g.clear();
  g.fillStyle(0x111111, 1); // outline
  g.fillRect(1, 1, 22, 22);
  g.fillStyle(0x8a4b2b, 1); // brown body
  g.fillRect(3, 6, 16, 8);
  g.fillStyle(0xe6b899, 1); // belly
  g.fillRect(6, 10, 8, 4);
  g.fillStyle(0xffa500, 1); // beak
  g.fillRect(19, 10, 3, 2);
  this.textures.addCanvas('bird0', g.generateTexture('bird0', 24, 24));

  // bird frame 1: fly A
  g.clear();
  g.fillStyle(0x111111, 1); g.fillRect(1, 1, 22, 22);
  g.fillStyle(0x8a4b2b, 1); g.fillRect(3, 8, 16, 6);
  g.fillStyle(0xe6b899, 1); g.fillRect(6, 10, 8, 4);
  g.fillStyle(0xffa500, 1); g.fillRect(19, 10, 3, 2);
  // wing up
  g.fillStyle(0x6b3a25, 1); g.fillRect(-1 + 3, 4, 8, 4);
  this.textures.addCanvas('bird1', g.generateTexture('bird1', 24, 24));

  // bird frame 2: fly B
  g.clear();
  g.fillStyle(0x111111, 1); g.fillRect(1, 1, 22, 22);
  g.fillStyle(0x8a4b2b, 1); g.fillRect(3, 8, 16, 6);
  g.fillStyle(0xe6b899, 1); g.fillRect(6, 10, 8, 4);
  g.fillStyle(0xffa500, 1); g.fillRect(19, 10, 3, 2);
  // wing down
  g.fillStyle(0x6b3a25, 1); g.fillRect(14, 12, 8, 4);
  this.textures.addCanvas('bird2', g.generateTexture('bird2', 24, 24));
  g.clear();

  // --- Generate climber frames (32x32) as pixel-art ---
  // climber frame 0 (left arm up)
  g.fillStyle(0x000000, 1); g.fillRect(0,0,32,32); // temporary to clear but invisible background not needed
  g.clear();
  // head
  g.fillStyle(0xffcc99,1); g.fillRect(12,2,8,8);
  // cap
  g.fillStyle(0xd32f2f,1); g.fillRect(10,0,12,4);
  // body / backpack detail
  g.fillStyle(0x1b7be0,1); g.fillRect(12,10,8,10);
  g.fillStyle(0xffd23b,1); g.fillRect(6,10,6,8); // backpack left
  // left arm up (frame 0)
  g.fillStyle(0xd32f2f,1); g.fillRect(8,8,4,10);
  // right arm down
  g.fillStyle(0xd32f2f,1); g.fillRect(20,14,4,10);
  // legs
  g.fillStyle(0x244f8a,1); g.fillRect(12,20,4,10);
  g.fillStyle(0x244f8a,1); g.fillRect(16,20,4,10);
  this.textures.addCanvas('climber0', g.generateTexture('climber0', 32, 32));
  g.clear();

  // climber frame 1 (right arm up)
  // draw similar but flip arms
  g.fillStyle(0xffcc99,1); g.fillRect(12,2,8,8);
  g.fillStyle(0xd32f2f,1); g.fillRect(10,0,12,4);
  g.fillStyle(0x1b7be0,1); g.fillRect(12,10,8,10);
  g.fillStyle(0xffd23b,1); g.fillRect(6,10,6,8);
  // left arm down
  g.fillStyle(0xd32f2f,1); g.fillRect(8,14,4,10);
  // right arm up
  g.fillStyle(0xd32f2f,1); g.fillRect(20,8,4,10);
  // legs
  g.fillStyle(0x244f8a,1); g.fillRect(12,20,4,10);
  g.fillStyle(0x244f8a,1); g.fillRect(16,20,4,10);
  this.textures.addCanvas('climber1', g.generateTexture('climber1', 32, 32));
  g.destroy();

  // --- Scene objects ---
  // clouds group (simple rectangles)
  clouds = this.add.group();
  for (let i=0;i<6;i++){
    const c = this.add.rectangle(
      Phaser.Math.Between(30, WIDTH-30),
      Phaser.Math.Between(0, HEIGHT),
      Phaser.Math.Between(60,110),
      26,
      0xffffff, 0.85
    );
    clouds.add(c);
  }

  // ladders (two lanes) — visible vertical rectangles with rungs
  ladders = [WIDTH/3, (WIDTH/3)*2];
  ladders.forEach(x => {
    // pole
    this.add.rectangle(x, HEIGHT/2, 18, HEIGHT, 0xffffff);
    // rungs
    for (let ry=40; ry<HEIGHT; ry+=40){
      this.add.rectangle(x, ry, 28, 6, 0x888888);
    }
  });

  // turbine top (start offscreen above)
  turretTop = this.add.rectangle(WIDTH/2, -300, WIDTH * 1.1, 70, 0xaaaaaa);
  // outline
  this.add.rectangle(WIDTH/2, -300, WIDTH * 1.1, 70).setStrokeStyle(2, 0x666666);

  // --- Player sprite created from generated textures ---
  player = this.physics.add.sprite(ladders[0], HEIGHT - 120, 'climber0');
  player.setOrigin(0.5, 0.5);
  player.setDisplaySize(32, 32);
  player.body.setSize(20, 32);
  player.setCollideWorldBounds(true);

  // animation state for climber (we'll toggle textures manually)
  playerFrame = 0;
  playerFrameTimer = 0;

  // --- Birds groups ---
  birdsFalling = this.add.group(); // we will use containers for wing animation or sprites
  birdsFlying = this.add.group();

  // create simple overlap detection using arcade bodies (add bodies to groups)
  this.physics.add.overlap(player, birdsFalling, onHitBird, null, this);
  this.physics.add.overlap(player, birdsFlying, onHitBird, null, this);

  // HUD
  distanceText = this.add.text(12, 10, 'Height: 200.0 ft', { fontSize: '18px', color: '#000' });
  livesText = this.add.text(12, 34, 'Lives: 3', { fontSize: '18px', color: '#000' });

  // input
  this.keys = this.input.keyboard.addKeys({ W: 'W', S: 'S', A: 'A', D: 'D' });

  // spawners
  this.time.addEvent({ delay: 900, callback: spawnFallingBird, callbackScope: this, loop: true });
  this.time.addEvent({ delay: 1200, callback: spawnFlyingBird, callbackScope: this, loop: true });
}

function update(time, delta) {
  if (gameOver) return;
  lastDelta = delta;

  const keys = this.keys;
  const climbSpeed = 120 * (delta/1000); // pixels per frame scaled
  let climbing = false;

  // climb up
  if (keys.W.isDown) {
    // if above threshold, scroll scene; else move player up
    if (player.y > climbThresholdY) {
      player.y -= climbSpeed;
    } else {
      // scroll clouds, birds, turretTop downward to simulate ascent
      clouds.getChildren().forEach(c => { c.y += climbSpeed * 0.5; if (c.y > HEIGHT+30) c.y = -30; });
      // move birds downwards to keep relative position
      birdsFalling.getChildren().forEach(b => { b.y += climbSpeed; if (b.y > HEIGHT+50) b.destroy(); });
      birdsFlying.getChildren().forEach(b => { b.y += climbSpeed; if (b.y > HEIGHT+50) b.destroy(); });
      turretTop.y += climbSpeed;
      scrollOffset += climbSpeed;
    }
    climbing = true;
  }
  // descend
  if (keys.S.isDown) {
    player.y += climbSpeed;
    climbing = true;
  }

  // ladder switch A/D (instant)
  if (Phaser.Input.Keyboard.JustDown(keys.A)) player.x = ladders[0];
  if (Phaser.Input.Keyboard.JustDown(keys.D)) player.x = ladders[1];

  // Player frame animation while moving (swap frames every 150ms)
  if (climbing) {
    playerFrameTimer += delta;
    if (playerFrameTimer >= 150) {
      playerFrameTimer = 0;
      playerFrame = 1 - playerFrame; // toggle 0/1
      player.setTexture(playerFrame === 0 ? 'climber0' : 'climber1');
    }
  } else {
    // idle frame
    player.setTexture('climber0');
  }

  // Decrease distance only while climbing up (active W press)
  if (keys.W.isDown) {
    // Reduce 200 ft over ~30 seconds of continuous climbing
    const decreasePerMs = 200 / 30000; // ft per ms
    distanceFt -= decreasePerMs * delta;
    if (distanceFt < 0) distanceFt = 0;
    distanceText.setText('Height: ' + distanceFt.toFixed(1) + ' ft');
  }

  // If turbine top is scrolled into visible area (near top of screen) and distance == 0 => win
  if (distanceFt <= 0) {
    endGame(true, this);
  }

  // Move birds (flying have vx property)
  birdsFlying.getChildren().forEach(b => {
    b.x += (b.vx * (delta/1000)); // vx already low, ms-based
    // wing animation handled using frame swap timer property
    b.frameTimer = (b.frameTimer || 0) + delta;
    if (b.frameTimer >= 220) {
      b.frameTimer = 0;
      b.currentFrame = 1 + ((b.currentFrame === 1) ? 2 : 1); // toggle 1/2
      b.setTexture(b.currentFrame === 1 ? 'bird1' : 'bird2');
    }
    if (b.x < -40 || b.x > WIDTH + 40) {
      b.destroy();
    }
  });

  birdsFalling.getChildren().forEach(b => {
    b.y += (b.vy * (delta/1000));
    // slight rotation while falling
    b.angle += b.spin * (delta/1000);
    if (b.y > HEIGHT + 50) b.destroy();
  });
}

// --- Spawners & helpers ---

function spawnFallingBird() {
  if (gameOver) return;
  // half the previous speed => lower vy
  const vy = Phaser.Math.Between(50, 100);
  const x = Phaser.Math.Between(40, WIDTH - 40);
  const b = this.physics.add.sprite(x, -20, 'bird0');
  b.setDisplaySize(24,24);
  b.vy = vy;
  b.spin = Phaser.Math.FloatBetween(-80, 80); // degrees/sec for cosmetic spin
  birdsFalling.add(b);
  // give physics body for collision
  b.body.setAllowGravity(false);
}

function spawnFlyingBird() {
  if (gameOver) return;
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -30 : WIDTH + 30;
  const y = Phaser.Math.Between(80, HEIGHT - 120);
  // half previous horizontal speed
  const vx = (fromLeft ? Phaser.Math.Between(75, 110) : -Phaser.Math.Between(75, 110));
  const b = this.physics.add.sprite(x, y, 'bird1');
  b.setDisplaySize(24,24);
  b.vx = vx; // pixels/sec
  b.currentFrame = 1;
  b.frameTimer = 0;
  birdsFlying.add(b);
  b.body.setAllowGravity(false);
}

// hit detection
function onHitBird(playerSprite, birdSprite) {
  if (gameOver) return;
  // destroy bird and lose a life
  birdSprite.destroy();
  lives -= 1;
  livesText.setText('Lives: ' + lives);
  // flash player
  player.setTint(0xff0000);
  setTimeout(()=> player.clearTint(), 200);

  if (lives <= 0) {
    endGame(false, this);
  }
}

function endGame(won, scene) {
  gameOver = true;
  // show message
  const msg = won ? 'You Reached The Top!' : 'GAME OVER';
  scene.add.rectangle(WIDTH/2, HEIGHT/2, 340, 80, won ? 0x00aa00 : 0xaa0000);
  scene.add.text(WIDTH/2, HEIGHT/2, msg, { fontSize: '24px', color: '#fff' }).setOrigin(0.5);
}

// Simple turbine top show helper (if you want a one-time decoration)
function showTurbineTopOnce(scene){
  // not needed: turretTop exists and scrolls into screen as we climb
}
