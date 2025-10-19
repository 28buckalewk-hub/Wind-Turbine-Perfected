// main.js — Wind Turbine Climb (pixel-based art only)

const config = {
  type: Phaser.AUTO,
  width: 400,
  height: 600,
  backgroundColor: '#87CEEB',
  parent: 'game',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: { preload, create, update }
};

let player, cursors;
let birds, clouds;
let distance = 200;
let distanceText;
let scrollOffset = 0;
let gameOver = false;
let ladderX = 150;
let otherLadderX = 250;

const game = new Phaser.Game(config);

function preload() {}

function create() {
  // Clouds
  clouds = this.add.group();
  for (let i = 0; i < 6; i++) {
    const cloud = this.add.rectangle(
      Phaser.Math.Between(0, 400),
      Phaser.Math.Between(0, 600),
      80,
      30,
      0xffffff,
      0.8
    );
    clouds.add(cloud);
  }

  // Climber (pixel-built)
  player = this.add.container(200, 500);
  const body = this.add.rectangle(0, 0, 10, 18, 0x3333ff);
  const head = this.add.rectangle(0, -14, 10, 10, 0xffcc99);
  const leftArm = this.add.rectangle(-7, 0, 4, 14, 0x3333ff);
  const rightArm = this.add.rectangle(7, 0, 4, 14, 0x3333ff);
  const leftLeg = this.add.rectangle(-4, 16, 4, 10, 0x1111aa);
  const rightLeg = this.add.rectangle(4, 16, 4, 10, 0x1111aa);
  player.add([body, head, leftArm, rightArm, leftLeg, rightLeg]);
  this.physics.add.existing(player);
  player.body.setCollideWorldBounds(true);
  player.body.setSize(16, 32);
  player.speed = 150;

  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.addKeys({
    W: Phaser.Input.Keyboard.KeyCodes.W,
    S: Phaser.Input.Keyboard.KeyCodes.S,
    A: Phaser.Input.Keyboard.KeyCodes.A,
    D: Phaser.Input.Keyboard.KeyCodes.D
  });

  // Birds
  birds = this.physics.add.group();

  // Distance text
  distanceText = this.add.text(10, 10, 'Distance: 200ft', { fontSize: '20px', fill: '#000' });

  // Collisions
  this.physics.add.overlap(player, birds, hitBird, null, this);

  // Bird spawner
  this.time.addEvent({
    delay: 800,
    loop: true,
    callback: () => spawnBird(this),
  });
}

function update(time, delta) {
  if (gameOver) return;

  const keys = this.input.keyboard.keys;
  let moving = false;

  // Move up/down
  if (keys[Phaser.Input.Keyboard.KeyCodes.W].isDown) {
    player.y -= player.speed * (delta / 1000);
    distance -= 0.1;
    moving = true;
  } else if (keys[Phaser.Input.Keyboard.KeyCodes.S].isDown) {
    player.y += player.speed * (delta / 1000);
    distance += 0.05;
    moving = true;
  }

  // Switch ladders
  if (Phaser.Input.Keyboard.JustDown(keys[Phaser.Input.Keyboard.KeyCodes.A])) {
    player.x = ladderX;
  }
  if (Phaser.Input.Keyboard.JustDown(keys[Phaser.Input.Keyboard.KeyCodes.D])) {
    player.x = otherLadderX;
  }

  // Clouds scroll when climbing
  if (moving) {
    scrollOffset += 0.5;
    clouds.getChildren().forEach(cloud => {
      cloud.y += 0.5;
      if (cloud.y > 620) {
        cloud.y = -20;
        cloud.x = Phaser.Math.Between(0, 400);
      }
    });
  }

  // Update distance
  if (distance < 0) {
    distanceText.setText('Reached Top!');
    showTurbineTop(this);
    gameOver = true;
  } else {
    distanceText.setText(`Distance: ${Math.max(distance, 0).toFixed(1)}ft`);
  }

  // Bird movement
  birds.getChildren().forEach(bird => {
    bird.x += bird.vx;
    bird.y += bird.vy;
    if (bird.x < -30 || bird.x > 430 || bird.y > 630) bird.destroy();
  });
}

function spawnBird(scene) {
  const type = Phaser.Math.Between(0, 1); // 0 = flying, 1 = falling
  const bird = scene.add.container(Phaser.Math.Between(0, 400), -20);

  const wingColor = 0x444444;
  const bodyColor = 0x222222;
  const body = scene.add.rectangle(0, 0, 10, 6, bodyColor);
  const wingL = scene.add.rectangle(-7, 0, 6, 3, wingColor);
  const wingR = scene.add.rectangle(7, 0, 6, 3, wingColor);

  bird.add([wingL, body, wingR]);
  scene.physics.add.existing(bird);
  bird.body.setAllowGravity(false);

  if (type === 0) {
    // flying horizontally
    const dir = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    bird.vx = 100 * dir;
    bird.vy = 0;
    bird.x = dir === 1 ? -20 : 420;
    bird.y = Phaser.Math.Between(100, 400);

    // Animate wings
    scene.tweens.add({
      targets: [wingL, wingR],
      angle: { from: -25, to: 25 },
      yoyo: true,
      repeat: -1,
      duration: 200
    });
  } else {
    // falling bird
    bird.vx = 0;
    bird.vy = Phaser.Math.Between(100, 200);
    bird.x = Phaser.Math.Between(50, 350);
  }

  birds.add(bird);
}

function hitBird(player, bird) {
  bird.destroy();
  player.list.forEach(part => (part.fillColor = 0xff0000)); // flash red
  setTimeout(() => player.list.forEach(part => (part.fillColor = 0x3333ff)), 200);
}

function showTurbineTop(scene) {
  const top = scene.add.rectangle(200, 300, 200, 40, 0x666666);
  scene.add.text(130, 290, 'TURBINE TOP', {
    fontSize: '18px',
    fill: '#fff',
    fontStyle: 'bold'
  });
}
