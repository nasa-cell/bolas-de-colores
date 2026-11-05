/**
 * 2D Particle & Ball Physics Engine for Projection Mapping
 * Simula la caída de bolas con gravedad, rebotes realistas contra obstáculos,
 * estelas de luz, y explosiones de partículas al colisionar.
 */

class PhysicsEngine {
  constructor(canvas, effectsCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effectsCanvas = effectsCanvas;
    this.effectsCtx = effectsCanvas.getContext('2d');

    // Bolas activas
    this.balls = [];
    this.particles = [];

    // Parámetros de física
    this.gravity = 0.45;
    this.bounciness = 0.75;
    this.friction = 0.992;
    this.ballRadius = 10;
    this.maxBalls = 120;
    this.spawnRate = 8; // Bolas por segundo
    this.lastSpawnTime = 0;

    // Modos de emisión
    this.spawnerMode = 'rain'; // 'rain', 'center', 'moving', 'interactive'
    this.pendulumAngle = 0;

    // Paletas de color
    this.ballStyle = 'neon-cyber';
    this.colorPalettes = {
      'neon-cyber': ['#00e5ff', '#ff007f', '#ffe600', '#00ff66'],
      'rainbow': ['#ff0055', '#ff9900', '#ffee00', '#00ff99', '#00ccff', '#9933ff'],
      'fire': ['#ffcc00', '#ff6600', '#ff0033', '#ffffff'],
      'bioluminescent': ['#00f0ff', '#00ffaa', '#0077ff', '#ffffff'],
      'monochrome': ['#ffffff', '#e0f7ff', '#b3e5fc']
    };

    // Opciones visuales
    this.trailAlpha = 0.18; // Opacidad del rastro de luz
    this.enableSplatter = true;
    this.highlightStickers = true;
    this.debugMode = false;

    // Callback al colisionar (para síntesis de audio)
    this.onCollision = null;

    // Redimensionamiento
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.effectsCanvas.width = this.width;
    this.effectsCanvas.height = this.height;
  }

  /**
   * Genera una nueva bola en la simulación
   */
  spawnBall(customX = null, customY = null, customVx = null, customVy = null) {
    if (this.balls.length >= this.maxBalls) {
      // Eliminar la bola más vieja
      this.balls.shift();
    }

    let x = customX;
    let y = customY !== null ? customY : -this.ballRadius;
    let vx = customVx !== null ? customVx : (Math.random() - 0.5) * 1.5;
    let vy = customVy !== null ? customVy : Math.random() * 2 + 1;

    if (x === null) {
      switch (this.spawnerMode) {
        case 'rain':
          x = Math.random() * (this.width - 60) + 30;
          break;
        case 'center':
          x = this.width / 2 + (Math.random() - 0.5) * 40;
          break;
        case 'moving':
          this.pendulumAngle += 0.08;
          x = (this.width / 2) + Math.sin(this.pendulumAngle) * (this.width * 0.4);
          break;
        default:
          x = Math.random() * this.width;
          break;
      }
    }

    const palette = this.colorPalettes[this.ballStyle] || this.colorPalettes['neon-cyber'];
    const color = palette[Math.floor(Math.random() * palette.length)];

    this.balls.push({
      x,
      y,
      vx,
      vy,
      radius: this.ballRadius * (0.8 + Math.random() * 0.4),
      color,
      prevX: x,
      prevY: y,
      trail: [],
      life: 0
    });
  }

  /**
   * Ráfaga de bolas instantánea
   */
  burst(count = 30) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const x = (this.width / 2) + (Math.random() - 0.5) * (this.width * 0.6);
        this.spawnBall(x, 10, (Math.random() - 0.5) * 6, Math.random() * 3 + 2);
      }, i * 35);
    }
  }

  clearBalls() {
    this.balls = [];
    this.particles = [];
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.effectsCtx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Actualiza y dibuja la simulación en cada frame
   */
  update(obstacles, timestamp) {
    // 1. Spawner automático
    if (this.spawnRate > 0) {
      const interval = 1000 / this.spawnRate;
      if (timestamp - this.lastSpawnTime >= interval) {
        this.spawnBall();
        this.lastSpawnTime = timestamp;
      }
    }

    // 2. Fondo y estelas (Fade hacia negro puro)
    this.ctx.fillStyle = `rgba(0, 0, 0, ${this.trailAlpha})`;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.effectsCtx.clearRect(0, 0, this.width, this.height);

    // 3. Resaltar Post-its físicos si está activado
    if (this.highlightStickers && obstacles.length > 0) {
      this.drawStickerHighlights(obstacles);
    }

    // 4. Actualizar partículas de explosión/chispas
    this.updateParticles();

    // 5. Convertir obstáculos normalizados a píxeles de pantalla
    const pixelObstacles = obstacles.map(ob => ({
      x: ob.x * this.width,
      y: ob.y * this.height,
      w: ob.width * this.width,
      h: ob.height * this.height,
      raw: ob
    }));

    // 6. Actualizar y resolver física de cada bola
    const activeBalls = [];

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];

      b.prevX = b.x;
      b.prevY = b.y;

      // Aplicar gravedad y rozamiento del aire
      b.vy += this.gravity;
      b.vx *= this.friction;
      b.vy *= this.friction;

      // Mover bola
      b.x += b.vx;
      b.y += b.vy;
      b.life++;

      // Colisión con paredes laterales
      if (b.x - b.radius < 0) {
        b.x = b.radius;
        b.vx = -b.vx * this.bounciness;
      } else if (b.x + b.radius > this.width) {
        b.x = this.width - b.radius;
        b.vx = -b.vx * this.bounciness;
      }

      // Colisión con los obstáculos (Post-its)
      for (const ob of pixelObstacles) {
        this.checkBallObstacleCollision(b, ob);
      }

      // Dibujar la bola con glow neón
      this.drawBall(b);

      // Conservar si sigue dentro de la pantalla
      if (b.y - b.radius < this.height + 40 && b.x > -60 && b.x < this.width + 60) {
        activeBalls.push(b);
      }
    }

    this.balls = activeBalls;
  }

  /**
   * Resuelve la colisión círculo vs rectángulo del Post-it
   */
  checkBallObstacleCollision(ball, ob) {
    // Encontrar el punto más cercano en el rectángulo al centro de la bola
    const nearestX = Math.max(ob.x, Math.min(ball.x, ob.x + ob.w));
    const nearestY = Math.max(ob.y, Math.min(ball.y, ob.y + ob.h));

    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq < ball.radius * ball.radius) {
      const dist = Math.sqrt(distanceSq);

      let nx = 0;
      let ny = -1;

      if (dist > 0.0001) {
        nx = dx / dist;
        ny = dy / dist;
      } else {
        // La bola está exactamente dentro: empujar hacia arriba
        ny = -1;
      }

      // Despenetración
      const overlap = ball.radius - dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;

      // Velocidad relativa a lo largo de la normal
      const velAlongNormal = ball.vx * nx + ball.vy * ny;

      // Solo rebotar si se mueven hacia el obstáculo
      if (velAlongNormal < 0) {
        const impulse = -(1 + this.bounciness) * velAlongNormal;
        ball.vx += nx * impulse;
        ball.vy += ny * impulse;

        // Añadir una pequeña deflexión lateral aleatoria para dinamismo
        ball.vx += (Math.random() - 0.5) * 1.2;

        const impactSpeed = Math.hypot(ball.vx, ball.vy);

        // Generar partículas de chispas
        if (this.enableSplatter && impactSpeed > 2.5) {
          this.spawnSplatter(nearestX, nearestY, ball.color, nx, ny, impactSpeed);
        }

        // Notificar callback de audio
        if (this.onCollision && impactSpeed > 1.5) {
          this.onCollision({
            x: ball.x / this.width,
            y: ball.y / this.height,
            speed: impactSpeed,
            color: ball.color
          });
        }
      }
    }
  }

  /**
   * Genera chispas fluorescentes al impactar un Post-it
   */
  spawnSplatter(x, y, color, nx, ny, speed) {
    const count = Math.min(18, Math.floor(speed * 1.5) + 4);
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(ny, nx) + (Math.random() - 0.5) * Math.PI * 0.9;
      const pSpeed = (Math.random() * 0.7 + 0.3) * speed * 0.6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * pSpeed,
        vy: Math.sin(angle) * pSpeed - Math.random() * 1.5,
        radius: Math.random() * 2.5 + 1.2,
        color,
        alpha: 1.0,
        decay: Math.random() * 0.04 + 0.03
      });
    }
  }

  updateParticles() {
    const nextParticles = [];
    this.effectsCtx.save();
    this.effectsCtx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // Gravedad suave para las chispas
      p.alpha -= p.decay;

      if (p.alpha > 0) {
        this.effectsCtx.fillStyle = p.color;
        this.effectsCtx.globalAlpha = p.alpha;
        this.effectsCtx.beginPath();
        this.effectsCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.effectsCtx.fill();
        nextParticles.push(p);
      }
    }

    this.effectsCtx.restore();
    this.particles = nextParticles;
  }

  /**
   * Dibuja una bola con resplandor luminoso (efecto proyector neón)
   */
  drawBall(b) {
    this.ctx.save();

    // Rastro interior (línea entre la posición anterior y la actual)
    this.ctx.lineWidth = b.radius * 1.6;
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = b.color;
    this.ctx.beginPath();
    this.ctx.moveTo(b.prevX, b.prevY);
    this.ctx.lineTo(b.x, b.y);
    this.ctx.stroke();

    // Resplandor radial exterior
    const gradient = this.ctx.createRadialGradient(b.x, b.y, b.radius * 0.2, b.x, b.y, b.radius * 2.2);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.35, b.color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(b.x, b.y, b.radius * 2.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Núcleo brillante
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Proyecta un contorno y aura de luz sobre las notas físicas en la pared
   */
  drawStickerHighlights(obstacles) {
    this.ctx.save();
    const time = performance.now() * 0.003;

    for (const ob of obstacles) {
      const rx = ob.x * this.width;
      const ry = ob.y * this.height;
      const rw = ob.width * this.width;
      const rh = ob.height * this.height;

      // Aura pulsante de neón
      const pulse = 0.5 + Math.sin(time + rx) * 0.2;
      this.ctx.shadowColor = '#00e5ff';
      this.ctx.shadowBlur = 18;

      this.ctx.strokeStyle = `rgba(0, 229, 255, ${pulse})`;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(rx - 2, ry - 2, rw + 4, rh + 4);

      // Relleno sutil
      this.ctx.fillStyle = 'rgba(0, 229, 255, 0.06)';
      this.ctx.fillRect(rx, ry, rw, rh);
    }

    this.ctx.restore();
  }
}

window.PhysicsEngine = PhysicsEngine;
