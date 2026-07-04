import { stime } from "@thegraid/common-lib";
import { TileExporter } from "./tile-exporter";
import { ImageGrid, PageSpec, TileExporter as TileExporterLib, type CountClaz, type GridSpec } from "@thegraid/easeljs-lib";

class ImageGridFile extends ImageGrid {

  // in this case, all we have are the single-sided fronts.
  // first we write them to a directory, upload to the 'library' and see what choice we have for single-sided.
  override makePage(pageSpec: PageSpec, canvas?: HTMLCanvasElement | string ) {
    // extract overall size of page/canvas
    this.setStageAndCanvas(pageSpec.layoutSpec!, canvas); // sets this.stage & this.canvas
    const nc = this.addObjects(pageSpec)
    this.stage.update();
    pageSpec.canvas = this.canvas; // canvas to view & download

    const { id } = this.canvas;
    const info = { id, nc, layout: pageSpec.layoutSpec }; // not essential...
    console.log(stime(this, `.makePage: info =`), info);
    return pageSpec;
  }
  // Ignore the canvas, use the cached list of Card/Tile objects
  // render toDataURL()
  override downloadImage(canvas: HTMLCanvasElement, filename?: string, downloadId?: string): void {
    const imageURL = canvas.toDataURL("image/png");
    this.downloadImage2(imageURL, filename, downloadId, canvas.id);
  }

  downloadImage2(imageURL: string, filename = 'image.png', downloadId = 'download', logId = "image") {
    const anchor = document.getElementById(downloadId) as HTMLAnchorElement;
    const octetURL = imageURL.replace("image/png", "image/octet-stream");
    anchor.download = filename;
    anchor.href = octetURL;
    console.log(stime(this, `.downloadImage: ${logId} -> ${filename} length = ${octetURL.length}`))
  }
}


export class TileExporter2 extends TileExporter {
    constructor() {
    super(ImageGridFile);
    this.imageGrid.setScale('.2');  // start small
  }
}
