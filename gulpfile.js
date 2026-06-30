// coerce /dist files into a clickable app:
//
// npm install --save-dev gulp gulp-inline-source gulp-replace
//
// ng build --configuration production --base-href ./ && gulp bundle-html

const gulp = require('gulp');
const inlinesource = require('gulp-inline-source');
const replace = require('gulp-replace');

gulp.task('bundle-html', () => {
    // Target the index.html directly inside your flat project build folder
    return gulp.src('./dist/columns/index.html')
        // Force gulp-inline-source to recognize your specific hashed scripts by adding the inline attribute
        .pipe(replace('type="module"', 'type="module" inline'))
        .pipe(replace('rel="stylesheet"', 'rel="stylesheet" inline'))
        // Execute the script and style asset inlining step
        .pipe(inlinesource({
            compress: false,
            rootpath: './dist/columns/' // Points directly to your root build assets
        }))
        // Output the single self-contained index file into your standalone folder
        .pipe(gulp.dest('./dist-standalone'));
});
