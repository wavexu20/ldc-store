export const PRODUCT_IMAGE_WIDTH = 1200;
export const PRODUCT_IMAGE_HEIGHT = 900;
export const PRODUCT_IMAGE_TARGET_BYTES = 320 * 1024;
export const PRODUCT_IMAGE_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

interface Size {
  width: number;
  height: number;
}

export interface DrawRect extends Size {
  x: number;
  y: number;
}

export function calculateContainRect(source: Size, target: Size, paddingRatio = 0) : DrawRect {
  const innerWidth = target.width * (1 - paddingRatio * 2);
  const innerHeight = target.height * (1 - paddingRatio * 2);
  const scale = Math.min(innerWidth / source.width, innerHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: (target.width - width) / 2,
    y: (target.height - height) / 2,
    width,
    height,
  };
}

export function calculateCoverRect(source: Size, target: Size): DrawRect {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: (target.width - width) / 2,
    y: (target.height - height) / 2,
    width,
    height,
  };
}

export function isNearProductAspectRatio(source: Size) {
  const sourceRatio = source.width / source.height;
  const targetRatio = PRODUCT_IMAGE_WIDTH / PRODUCT_IMAGE_HEIGHT;
  return Math.abs(sourceRatio - targetRatio) / targetRatio <= 0.025;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("浏览器无法处理该图片")),
      "image/webp",
      quality
    );
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("当前浏览器不支持图片自动适配，请升级浏览器后重试");
  }
  return createImageBitmap(file);
}

function outputName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, "-");
  return `${base || "product"}-4x3.webp`;
}

export async function adaptProductImage(file: File) {
  if (file.size > PRODUCT_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error(`图片「${file.name}」超过 10 MB`);
  }

  const bitmap = await loadBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error(`图片「${file.name}」尺寸无效`);

    const canvas = document.createElement("canvas");
    canvas.width = PRODUCT_IMAGE_WIDTH;
    canvas.height = PRODUCT_IMAGE_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建图片处理画布");

    const source = { width: bitmap.width, height: bitmap.height };
    const target = { width: PRODUCT_IMAGE_WIDTH, height: PRODUCT_IMAGE_HEIGHT };

    if (isNearProductAspectRatio(source)) {
      const rect = calculateCoverRect(source, target);
      context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
    } else {
      const background = calculateCoverRect(source, target);
      context.save();
      context.filter = "blur(34px) brightness(0.58) saturate(0.9)";
      context.drawImage(bitmap, background.x - 42, background.y - 42, background.width + 84, background.height + 84);
      context.restore();
      context.fillStyle = "rgba(0, 0, 0, 0.18)";
      context.fillRect(0, 0, target.width, target.height);

      const foreground = calculateContainRect(source, target, 0.035);
      context.save();
      context.shadowColor = "rgba(0, 0, 0, 0.32)";
      context.shadowBlur = 24;
      context.drawImage(bitmap, foreground.x, foreground.y, foreground.width, foreground.height);
      context.restore();
    }

    let blob = await canvasToBlob(canvas, 0.84);
    for (const quality of [0.76, 0.68, 0.6]) {
      if (blob.size <= PRODUCT_IMAGE_TARGET_BYTES) break;
      blob = await canvasToBlob(canvas, quality);
    }

    return new File([blob], outputName(file.name), {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

export async function adaptProductImages(files: File[]) {
  return Promise.all(files.map(adaptProductImage));
}
