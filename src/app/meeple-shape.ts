import { stime, type XY, type XYWH } from "@thegraid/common-lib";
import { NamedContainer, PaintableShape, RectShape, type Paintable } from "@thegraid/easeljs-lib";
import { Bitmap, Graphics } from "@thegraid/easeljs-module";
import { AliasLoader } from "@thegraid/hexlib";


/** a NamedContainer acting as PaintableShape */
export class MeepleShape extends NamedContainer implements Paintable {
  /** if supplied in contructor, cgf extends a clone [otherwise use new Graphics()] */
  _g0?: Graphics;
  /** initial/baseline Graphics, cgf extends to create cgfGraphics */
  get g0() {
    return this._g0?.clone() ?? new Graphics(); // clone, so original is not mutated.
  }
  /** last Graphics from cgf */
  cgfGraphics!: Graphics; // set by mscgf

  calcBounds(): XYWH {
    const { x, y, width: w, height: h } = this.getBounds();
    return { x, y, w, h }
  }

  /** last painted color */
  get colorn() { return this.colorRect.colorn; }
  colorRect;
  // Tile.paint() -> baseShape.paint()
  paint(fillc = this.colorn, force?: boolean) {
    if (fillc !== this.colorn || force) {
      this.cgfGraphics = this.colorRect.paint(fillc, force)
    }
    return this.cgfGraphics;
  }

  constructor(color: string, size: XY = { x: PaintableShape.defaultRadius, y: PaintableShape.defaultRadius }) {
    super('MeepleShape');
    const msBitmap = AliasLoader.loader.getBitmap('meeple-shape', size);
    const w = msBitmap.image.width, h = msBitmap.image.height;
    msBitmap.setBounds(0, 0, w, h)
    this.addChild(msBitmap);

    const { x, y, width, height } = this.getBounds();
    this.colorRect = new RectShape({x, y, w: width, h: height}, color,'')
    this.colorRect.compositeOperation = "source-atop";
    this.addChild(this.colorRect);
    return;
  }

  setCacheID() {
    if (!this.cacheID) {
      const { x, y, width, height } = this.getBounds()
      this.cache(x, y, width, height, 4)
    }
  }
}

// similar to ImagePixels, but using the createjs BitmapCache.getCacheDataURL
class BitmapPixels {
  rgbaData: Uint32Array;
  width: number;
  height: number;
  constructor(bitmap: Bitmap) {
    const { x, y, width, height } = bitmap.getBounds();
    if (!bitmap.cacheID) bitmap.cache(x, y, width, height);
    this.width = width;
    this.height = height;
    const canvas = (bitmap.cacheCanvas as HTMLCanvasElement)
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const imageData = context.getImageData(x, y, width, height)
    this.rgbaData = new Uint32Array(imageData.data.buffer);
  }

  getPixel(xcol: number, yrow: number): number {
    return this.rgbaData[xcol + yrow * this.width];
  }
  setPixel(xcol: number, yrow: number, rgba: number) {
    this.rgbaData[xcol + yrow * this.width] = rgba;
  }
  setRectangle(x0: number, y0: number, width: number, height: number, rgba: number) {
    for (let y = y0; y < y0 + height; y++) {
      for (let x = x0; x < x0 + width; x++) {
        this.setPixel(x, y, rgba);
      }
    }
  }
  getRectangle(x0: number, y0: number, width: number, height: number, f?: (n: number) => any) {
    const out: number[][] = [];
    for (let yrow = y0; yrow < y0 + height; yrow++) {
      for (let xcol = x0; xcol < x0 + width; xcol++) {
        if (!out[yrow]) out[yrow] = [];
        const pixel = this.getPixel(xcol, yrow);
        out[yrow][xcol] = f ? f(pixel) : pixel;
      }
    }
    return out;
  }

  viewBitmap(bm: Bitmap) {
    const { x, y, width, height } = bm.getBounds()
    const ip = new BitmapPixels(bm);
    console.log(stime(this, `.viewPixels:`), ip.getRectangle(64, 64, 100, 100, (n) => n.toString(16)))
  }

}
