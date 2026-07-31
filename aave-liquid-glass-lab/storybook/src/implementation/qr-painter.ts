const QR_SPLASH_COLORS = ['#9896FF', '#39D1F9', '#FFB400', '#FF3200'];

interface PaintPoint {
  x: number;
  y: number;
  age: number;
  color: string;
}

interface QrSplashOptions {
  context:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  size: number;
  color: string;
  speed: number;
  clearColor: string;
  innerRadius: number;
  outerRadius: number;
}

class QrSplash {
  private radius = 0;
  private innerRadius: number;
  private readonly outerRadius: number;
  private fadeOpacity = 1;
  isComplete = false;

  constructor(private readonly options: QrSplashOptions) {
    this.innerRadius = options.innerRadius;
    this.outerRadius = options.outerRadius;
  }

  private update(delta: number) {
    const speed = this.options.speed;
    if (this.innerRadius < 1 - speed / 1000) {
      this.innerRadius = Math.min(
        this.outerRadius,
        this.innerRadius + (speed / 1000) * delta
      );
    }
    if (this.radius < 3 * this.options.size) {
      this.radius +=
        this.options.size * (speed / 1000) * delta;
    }
    if (this.innerRadius >= this.outerRadius) {
      this.fadeOpacity -= (speed / 1000) * delta;
      if (this.fadeOpacity <= 0) {
        this.fadeOpacity = 0;
        this.isComplete = true;
      }
    }
  }

  draw(delta: number) {
    const { context, size, color, clearColor } = this.options;
    const previousAlpha = context.globalAlpha;
    context.globalAlpha = this.fadeOpacity;
    context.beginPath();
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      this.radius
    );
    gradient.addColorStop(0, clearColor);
    gradient.addColorStop(this.innerRadius, color);
    gradient.addColorStop(this.outerRadius, color);
    gradient.addColorStop(1, 'transparent');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.globalAlpha = previousAlpha;
    this.update(delta);
  }
}

export interface QrPainterOptions {
  canvas?: HTMLCanvasElement;
  size: number;
  maxAge: number;
  radius: number;
  intensityFactor: number;
  useColor?: boolean;
  clearColor?: string;
  splashSpeed?: number;
  ringStart?: number;
  ringEnd?: number;
}

function p3Color(hex: string, alpha = 1): string {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    ?.map(channel => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return hex;
  return `color(display-p3 ${channels[0]} ${channels[1]} ${channels[2]} / ${alpha})`;
}

function nextSplashColor(color: string): string {
  const index = QR_SPLASH_COLORS.indexOf(color);
  return QR_SPLASH_COLORS[(index + 1) % QR_SPLASH_COLORS.length];
}

/**
 * Low-resolution painting texture used by the QR shader. One instance controls
 * dot radius and another controls dot color; they intentionally share the same
 * point/ring lifecycle but use different maxAge, radius and intensity values.
 */
export class QrPainter {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly context:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  readonly points: PaintPoint[] = [];
  readonly splashes: QrSplash[] = [];
  readonly size: number;
  readonly radius: number;
  private readonly maxAge: number;
  private readonly intensityFactor: number;
  private readonly useColor: boolean;
  private readonly splashSpeed: number;
  private clearColor: string;
  private ringStart: number;
  private ringEnd: number;
  private color: string;
  private mousePosition = { x: -10_000, y: -10_000 };

  constructor({
    canvas,
    size,
    maxAge,
    radius,
    intensityFactor,
    useColor = false,
    clearColor = 'black',
    splashSpeed,
    ringStart = 0.7,
    ringEnd = 0.9
  }: QrPainterOptions) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.size = Math.ceil(size * dpr);
    this.radius = radius * dpr;
    this.maxAge = maxAge;
    this.intensityFactor = intensityFactor;
    this.useColor = useColor;
    this.clearColor = clearColor;
    this.splashSpeed = splashSpeed ?? (useColor ? 10 : 13);
    this.ringStart = ringStart;
    this.ringEnd = ringEnd;
    this.color = useColor ? QR_SPLASH_COLORS[0] : '#ffffff';
    this.canvas =
      canvas ?? new OffscreenCanvas(this.size, this.size);
    this.canvas.width = this.size;
    this.canvas.height = this.size;

    const options: CanvasRenderingContext2DSettings = {
      alpha: false,
      willReadFrequently: true
    };
    let context:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null = null;
    try {
      context = this.canvas.getContext('2d', {
        ...options,
        colorSpace: 'display-p3'
      }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    } catch {
      context = this.canvas.getContext('2d', options) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    }
    if (!context) throw new Error('QR painting texture requires Canvas 2D');
    this.context = context;
    this.clear();
  }

  private clear() {
    this.context.fillStyle = this.clearColor;
    this.context.fillRect(0, 0, this.size, this.size);
  }

  private drawPoint(point: PaintPoint) {
    const x = point.x * this.size;
    const y = (1 - point.y) * this.size;
    const remaining = 1 - point.age / this.maxAge;
    const shadowOffset = 5 * this.size;
    this.context.shadowOffsetX = shadowOffset;
    this.context.shadowOffsetY = shadowOffset;
    this.context.shadowBlur = this.radius;
    this.context.shadowColor = p3Color(
      point.color,
      this.intensityFactor * remaining
    );
    this.context.beginPath();
    this.context.fillStyle = p3Color(point.color);
    this.context.arc(
      x - shadowOffset,
      y - shadowOffset,
      this.radius,
      0,
      Math.PI * 2
    );
    this.context.fill();
    this.context.closePath();
  }

  updateMousePosition(position: { x: number; y: number }) {
    this.mousePosition = position;
  }

  updateClearColor(color: string) {
    this.clearColor = color;
  }

  updateRingStart(value: number) {
    this.ringStart = value;
  }

  updateRingEnd(value: number) {
    this.ringEnd = value;
  }

  onClick(): string {
    const innerRadius = Math.max(
      0,
      Math.min(this.ringStart, this.ringEnd - 0.01)
    );
    const outerRadius = Math.max(
      innerRadius + 0.01,
      Math.min(1, this.ringEnd)
    );
    const color = this.color;
    this.splashes.push(
      new QrSplash({
        context: this.context,
        size: this.size,
        color,
        speed: this.splashSpeed,
        clearColor: this.clearColor,
        innerRadius,
        outerRadius
      })
    );
    if (this.useColor) this.color = nextSplashColor(this.color);
    return color;
  }

  update(delta: number, addPointerPoint: boolean) {
    this.clear();
    for (let index = this.splashes.length - 1; index >= 0; index -= 1) {
      const splash = this.splashes[index];
      if (splash.isComplete) {
        this.splashes.splice(index, 1);
      } else {
        splash.draw(delta);
      }
    }

    for (let index = this.points.length - 1; index >= 0; index -= 1) {
      const point = this.points[index];
      const ageProgress = 1 - (1 - point.age / this.maxAge) ** 3;
      point.age += delta * (0.5 + 0.5 * ageProgress);
      if (point.age > this.maxAge) {
        this.points.splice(index, 1);
      } else {
        this.drawPoint(point);
      }
    }

    if (addPointerPoint) {
      this.points.push({
        x: this.mousePosition.x,
        y: this.mousePosition.y,
        age: 0,
        color: this.color
      });
    }
  }

  dispose() {
    this.clear();
    this.points.length = 0;
    this.splashes.length = 0;
    this.context.reset();
  }
}
