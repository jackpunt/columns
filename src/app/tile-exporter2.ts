import { stime } from "@thegraid/common-lib";
import { ImageGrid, PageSpec, type Claz, type GridSpec, type NamedContainer, type NamedObject, } from "@thegraid/easeljs-lib";
import { Container } from "@thegraid/easeljs-module";
import JSZip from 'jszip';
import { TileExporter } from "./tile-exporter";

/** zip each card image, suitable for makeplayingcards.com (MPC) */
class ImageGridFile extends ImageGrid {

  // pageCont: Container<Cards> for each canvas
  pageCont = new Map<string, Container>();

  // View button was clicked, process a nrow X ncol grid of frontObjs.
  // in this case, all we have are the single-sided fronts.
  // first we write them to a directory, upload to the 'library' and see what choice we have for single-sided.
  override addObjects(pageSpec: PageSpec): Container {
    const cont = super.addObjects(pageSpec); // so they appear as pages on screen: fill nRow X nCol on a canvas
    this.pageCont.set(this.canvas.id, cont);
    this.dpi = pageSpec.layoutSpec?.dpi ?? 300; // DUBIOUS!?
    return cont;
  }
  dpi = 300;

  addToZip(zip: JSZip, cont: Container, logId: string, dpi = this.dpi) {
    for (const [n, dObj] of cont.children.entries()) {
      const { x, y, width, height } = dObj.getBounds();
      console.log(stime(this, `.downloadCanvas dObj:`), x, y, width, height, dObj.rotation)
      dObj.cache(x, y, width, height);
      const imageURL = (dObj.cacheCanvas as HTMLCanvasElement).toDataURL("image/png");
      const imageURL_300DPI = this.injectDPI(imageURL, dpi);
      const name = `${(dObj as NamedObject).Aname ?? dObj}`;
      // Extract the raw base64 string from the Data URL
      const base64Data = imageURL_300DPI.split(',')[1];
      // Add file to the zip archive hierarchy (base64: true tells JSZip to decode it)
      zip.file(`${logId}/${name}.png`, base64Data, { base64: true });
    }
  }

  // Ignore the canvas, use the pageCont Container of Card/Tile objects
  // render toDataURL()
  override async downloadCanvas(canvas: HTMLCanvasElement, filename: string, dpi = this.dpi) {
    const zip = new JSZip();
    const logId = filename?.replace(/\.png/, '');

    // this.downloadPerCanvas(zip, canvas, filename, dpi);
    this.downloadAllCanvas(zip, logId, dpi);

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(zipBlob, `${logId}.zip`, logId);

  }

  async downloadAllCanvas(zip: JSZip, logId: string, dpi: number) {
    for (const cont of this.pageCont.values() ) {
      this.addToZip(zip, cont, logId, dpi)
    }
  }

  async downloadPerCanvas(zip: JSZip, canvas: HTMLCanvasElement, logId: string, dpi = this.dpi) {
    const cont = this.pageCont.get(canvas.id) ?? new Container();
    if (cont.numChildren == 0) { debugger; }
    this.addToZip(zip, cont, logId)
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(zipBlob, `${logId}.zip`, logId);
  }

  // TODO: move to common-lib:
  injectDPI(dataURL: string, dpi: number): string {
    // 1. Convert DPI to pixels per meter (1 inch = 0.0254 meters)
    const ppm = Math.round(dpi / 0.0254); 11811; 11812

    // 2. Extract base64 payload and decode to a Uint8Array
    const base64Parts = dataURL.split(',');
    const header = base64Parts[0] + ',';
    const binaryString = atob(base64Parts[1]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 3. Create the pHYs chunk data (9 bytes)
    // 4 bytes: Pixels per unit, X axis (Big-endian)
    // 4 bytes: Pixels per unit, Y axis (Big-endian)
    // 1 byte:  Unit specifier (1 = meter)
    const chunkData = new Uint8Array(9);
    const view = new DataView(chunkData.buffer);
    view.setUint32(0, ppm, false);
    view.setUint32(4, ppm, false);
    view.setUint8(8, 1);

    // 4. Create the complete pHYs chunk layout
    // [4 bytes: Length] [4 bytes: Type ('pHYs')] [9 bytes: Data] [4 bytes: CRC]
    const typeBytes = new Uint8Array([112, 72, 89, 115]); // "pHYs" ASCII
    const pHYsChunk = new Uint8Array(4 + 4 + 9 + 4);
    const pHYsView = new DataView(pHYsChunk.buffer);

    pHYsView.setUint32(0, 9, false); // Length of data only
    pHYsChunk.set(typeBytes, 4);
    pHYsChunk.set(chunkData, 8);

    // 5. Calculate CRC-32 over Type and Data bytes
    const crcTarget = new Uint8Array(4 + 9);
    crcTarget.set(typeBytes, 0);
    crcTarget.set(chunkData, 4);

    // Standard CRC32 Generation
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < crcTarget.length; i++) {
      let c = (crc ^ crcTarget[i]) & 0xFF;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crc = (crc >>> 8) ^ c;
    }
    crc = crc ^ 0xFFFFFFFF;
    pHYsView.setUint32(17, crc, false);

    // 6. Splice pHYs right after the IHDR chunk
    // Standard PNG structure: Signature (8 bytes) + IHDR Chunk (Length 4 + Type 4 + Data 13 + CRC 4 = 25 bytes) = 33 bytes
    const targetOffset = 33;
    const newBytes = new Uint8Array(bytes.length + pHYsChunk.length);

    newBytes.set(bytes.subarray(0, targetOffset), 0);
    newBytes.set(pHYsChunk, targetOffset);
    newBytes.set(bytes.subarray(targetOffset), targetOffset + pHYsChunk.length);

    // 7. Convert back to binary string and return as Data URL
    let newBinary = '';
    const chunkArray = Array.from(newBytes);
    // Process in segments to avoid call stack limits on String.fromCharCode
    for (let i = 0; i < chunkArray.length; i += 8192) {
      newBinary += String.fromCharCode.apply(null, chunkArray.slice(i, i + 8192));
    }

    return header + btoa(newBinary);
  }
}


export class TileExporter2 extends TileExporter {
    constructor() {
    super(ImageGridFile);
    this.imageGrid.setScale('.1');  // start small
  }
  override composeTile(claz: Claz, args: any[], gridSpec: GridSpec, back?: boolean, edge?: "L" | "R" | "C"): NamedContainer {
    const cont = super.composeTile(claz, args, gridSpec, back, edge);
    const {x,y, width, height} = cont.getBounds();
    cont.setBounds(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
    return cont;
  }
}
