/**
 * Homography & Perspective Transform Utility
 * Permite mapear las 4 esquinas de la cámara a la superficie proyectada en la pared.
 */

class PerspectiveMapper {
  constructor() {
    // 4 esquinas normalizadas en el espacio de la cámara (0.0 a 1.0)
    // [0] Top-Left, [1] Top-Right, [2] Bottom-Right, [3] Bottom-Left
    this.srcCorners = [
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.05 },
      { x: 0.95, y: 0.95 },
      { x: 0.05, y: 0.95 }
    ];

    // Matriz de homografía 3x3 calculada
    this.matrix = null;
    this.invMatrix = null;
    this.computeHomography();
  }

  setCorner(index, x, y) {
    if (index >= 0 && index < 4) {
      this.srcCorners[index].x = Math.max(0, Math.min(1, x));
      this.srcCorners[index].y = Math.max(0, Math.min(1, y));
      this.computeHomography();
    }
  }

  resetCorners() {
    this.srcCorners = [
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.05 },
      { x: 0.95, y: 0.95 },
      { x: 0.05, y: 0.95 }
    ];
    this.computeHomography();
  }

  /**
   * Resuelve el sistema lineal de 8 ecuaciones para mapear un cuadrilátero a un cuadrado unitario [0,1]^2
   */
  computeHomography() {
    // Mapeamos de las 4 esquinas arbitrarias a [ (0,0), (1,0), (1,1), (0,1) ]
    const p = this.srcCorners;
    const dst = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ];

    this.matrix = this.findHomography(p, dst);
    if (this.matrix) {
      this.invMatrix = this.invert3x3(this.matrix);
    }
  }

  /**
   * Transforma una coordenada normalizada de cámara (u, v) a coordenada normalizada de pantalla (x, y)
   */
  transform(u, v) {
    if (!this.matrix) return { x: u, y: v };
    const m = this.matrix;
    const w = m[6] * u + m[7] * v + m[8];
    if (Math.abs(w) < 0.000001) return { x: u, y: v };

    const x = (m[0] * u + m[1] * v + m[2]) / w;
    const y = (m[3] * u + m[4] * v + m[5]) / w;

    return { x, y };
  }

  /**
   * Transforma una coordenada normalizada de pantalla (x, y) a coordenada de cámara (u, v)
   */
  inverseTransform(x, y) {
    if (!this.invMatrix) return { u: x, v: y };
    const m = this.invMatrix;
    const w = m[6] * x + m[7] * y + m[8];
    if (Math.abs(w) < 0.000001) return { u: x, v: y };

    const u = (m[0] * x + m[1] * y + m[2]) / w;
    const v = (m[3] * x + m[4] * y + m[5]) / w;

    return { u, v };
  }

  /**
   * Calcula la matriz 3x3 de homografía entre 4 puntos origen y 4 destino usando DLT
   */
  findHomography(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const sx = src[i].x;
      const sy = src[i].y;
      const dx = dst[i].x;
      const dy = dst[i].y;

      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
    }

    // Eliminación Gaussiana simplificada para sistema 8x8 con término constante
    const M = [];
    const b = [];
    for (let i = 0; i < 8; i++) {
      M.push(A[i].slice(0, 8));
      b.push(A[i][8]);
    }

    const h = this.solveGaussian(M, b);
    if (!h) return null;

    return [
      h[0], h[1], h[2],
      h[3], h[4], h[5],
      h[6], h[7], 1.0
    ];
  }

  solveGaussian(A, b) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(A[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }

      for (let k = i; k < n; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      const tmpB = b[maxRow];
      b[maxRow] = b[i];
      b[i] = tmpB;

      if (Math.abs(A[i][i]) < 1e-9) return null;

      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j < n; j++) {
          if (i === j) {
            A[k][j] = 0;
          } else {
            A[k][j] += c * A[i][j];
          }
        }
        b[k] += c * b[i];
      }
    }

    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = b[i] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        b[k] -= A[k][i] * x[i];
      }
    }
    return x;
  }

  invert3x3(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[3], a11 = m[4], a12 = m[5];
    const a20 = m[6], a21 = m[7], a22 = m[8];

    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;

    const det = a00 * b01 + a01 * b11 + a02 * b21;
    if (Math.abs(det) < 1e-9) return null;

    const invDet = 1.0 / det;
    return [
      b01 * invDet,
      (-a22 * a01 + a02 * a21) * invDet,
      (a12 * a01 - a02 * a11) * invDet,
      b11 * invDet,
      (a22 * a00 - a02 * a20) * invDet,
      (-a12 * a00 + a02 * a10) * invDet,
      b21 * invDet,
      (-a21 * a00 + a01 * a20) * invDet,
      (a11 * a00 - a01 * a10) * invDet
    ];
  }
}

window.PerspectiveMapper = PerspectiveMapper;
