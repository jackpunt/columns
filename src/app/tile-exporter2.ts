import { ImageGrid, PageSpec, type NamedObject, } from "@thegraid/easeljs-lib";
import type { Container } from "@thegraid/easeljs-module";
import JSZip from 'jszip';
import { TileExporter } from "./tile-exporter";
class ImageGridFile extends ImageGrid {

  pageCont!: Container;  // guarantee to set before using

  // View button was clicked, process a nrow X ncol grid of frontObjs.
  // in this case, all we have are the single-sided fronts.
  // first we write them to a directory, upload to the 'library' and see what choice we have for single-sided.
  override addObjects(pageSpec: PageSpec): Container {
    const cont = super.addObjects(pageSpec); // so they appear as pages on screen: fill nRow X nCol on a canvas
    this.pageCont = cont;
    return cont;
  }

  // Ignore the canvas, use the Container of Card/Tile objects
  // render toDataURL()
  override async downloadCanvas(canvas: HTMLCanvasElement, filename?: string) {
    const zip = new JSZip();
    const logId = filename?.replace(/\.png/, '');
    for (const [n, dObj] of this.pageCont.children.entries()) {
      const { x, y, width, height } = dObj.getBounds();
      dObj.cache(x, y, width, height);
      const imageURL = (dObj.cacheCanvas as HTMLCanvasElement).toDataURL("image/png");
      const name = (dObj as NamedObject).Aname ?? `dObj${n}`;
      // Extract the raw base64 string from the Data URL
      const base64Data = imageURL.split(',')[1];
      // Add file to the zip archive hierarchy (base64: true tells JSZip to decode it)
      zip.file(`cursus/${name}.png`, base64Data, { base64: true });
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(zipBlob, `${logId}.zip`, logId);
  }
}


export class TileExporter2 extends TileExporter {
    constructor() {
    super(ImageGridFile);
    this.imageGrid.setScale('.2');  // start small
  }
}
