// coerce /dist files into a clickable app:
//
//
// npm install --save-dev inline-source-cli
// npm install --save-dev gulp gulp-replace
//
// inline the asset files, by injecting into HTMLDivElement: canvas-asset-registry
// scan the asset/images directory and slurp in each .png file:
//
// ng build --configuration production --base-href ./ && gulp bundle-html

// npx gulp generate-asset-tags && \
// npx ng build --configuration production --base-href ./ && \
// npx inline-source --root ./dist/columns/ ./dist/columns/index.html ./dist-standalone/columns.html

const gulp = require('gulp');
const replace = require('gulp-replace');

gulp.task('generate-asset-tags', () => {
  const imgTags = [];

  // 1. Match all images in assets and its subfolders using a glob pattern
  return gulp.src('./src/assets/**/*.{png,jpg,jpeg,ico}')
    .on('data', (file) => {
      // Extract the path relative to the 'src/' directory (e.g., "assets/images/fileName.png")
      const relativePath = file.relative;

      // Generate a clean ID by swapping path slashes with dashes and dropping the extension
      // (e.g., "assets/images/hero.png" becomes "asset-assets-images-hero")
      const cleanId = 'assets-' + relativePath.replace(/\//g, '-').replace(/\.[^/.]+$/, "");

      imgTags.push(`<img id="${cleanId}" src="${relativePath}" inline style="display:none;" />`);
    })
    .on('end', () => {
      const updatedRegistryBlock = `<div id="assets-image-registry" style="display:none;">\n  ${imgTags.join('\n  ')}\n</div>`;
      const searchRegex = /<div id="assets-image-registry"[\s\S]*?<\/div>/;

      // 2. Inject the gathered tags back into your target template
      return gulp.src('./src/app/app.component.html')
        .pipe(replace(searchRegex, updatedRegistryBlock))
        .pipe(gulp.dest('./src/app/'));
    })
  });
