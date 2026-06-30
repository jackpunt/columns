// coerce /dist files into a clickable app:
//
// npm install --save-dev gulp gulp-replace inline-source-cli
//
// inline the asset files, by injecting into HTMLDivElement: canvas-asset-registry
// scan the asset/images directory and slurp in each .png file:
//
// ng build --configuration production --base-href ./ && gulp bundle-html

// npx gulp generate-asset-tags && npx ng build --configuration production --base-href ./ && npx inline-source --root ./dist/columns/ ./dist/columns/index.html ./dist-standalone/columns.html

const gulp = require('gulp');
const fs = require('fs');
const replace = require('gulp-replace');

gulp.task('generate-asset-tags', (done) => {
    const assetsDir = './src/assets/';

    fs.readdir(assetsDir, (err, files) => {
        if (err) return done(err);

        // Map every asset file into an image tag marked with the inline attribute
        const imgTags = files
            .filter(file => /\.(png|jpg|jpeg|ico)$/i.test(file))
            .map(file => `<img id="asset-${file.split('.')[0]}" src="assets/${file}" inline style="display:none;" />`)
            .join('\n');

        // Reconstruct the full element housing your generated collection
        const updatedRegistryBlock = `<div id="assets-image-registry" style="display:none;">\n${imgTags}\n</div>`;

        // Match the element container and anything inside it (including newlines)
        const searchRegex = /<div id="assets-image-registry"[\s\S]*?<\/div>/;

        gulp.src('./src/app/app.component.html')
            .pipe(replace(searchRegex, updatedRegistryBlock))
            .pipe(gulp.dest('./src/app/'))
            .on('end', done);
    });
});
