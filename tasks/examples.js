var aliasify = require('aliasify'),
    babelify = require('babelify'),
    browserify = require('browserify'),
    chalk = require('chalk'),
    connect = require('gulp-connect'),
    del = require('del'),
    gutil = require('gulp-util'),
    sass = require('gulp-sass'),
    pug = require('gulp-pug'),
    sourcemaps = required('gulp-sourcemaps'),
    merge = require('merge-stream'),
    shim = require('browserify-shim'),
    source = require('vinyl-source-stream'),
    watchify = require('watchify');

module.exports = function (gulp, config) {
	function doBundle (target, name, dest) {
		return target.bundle()
			.on('error', function (e) {
				gutil.log('Browserify Error', e);
			})
			.pipe(source(name))
			.pipe(gulp.dest(dest))
			.pipe(connect.reload());
	}

	function watchBundle (target, name, dest) {
		return watchify(target)
			.on('update', function (scriptIds) {
				scriptIds = scriptIds
					.filter(function (x) { return x.substr(0, 2) !== './'; })
					.map(function (x) { return chalk.blue(x.replace(__dirname, '')); });

				if (scriptIds.length > 1) {
					gutil.log(scriptIds.length + ' Scripts updated:\n* ' + scriptIds.join('\n* ') + '\nrebuilding...');
				} else {
					gutil.log(scriptIds[0] + ' updated, rebuilding...');
				}

				doBundle(target, name, dest);
			})
			.on('time', function (time) {
				gutil.log(chalk.green(name + ' built in ' + (Math.round(time / 10) / 100) + 's'));
			});
	}

	function buildExampleScripts (dev) {
		var dest = config.example.dist;
		var opts = dev ? watchify.args : {};
		opts.debug = !!dev;
		opts.hasExports = true;

		return function () {
			var common = browserify(opts);

			var bundle = browserify(opts);
			bundle.transform(babelify.configure({
				plugins: [require('babel-plugin-object-assign')]
			}));
			config.aliasify && bundle.transform(aliasify);
			bundle.require('./' + config.component.src + '/' + config.component.file, { expose: config.component.pkgName });

			var standalone = false;
			if (config.example.standalone) {
				standalone = browserify('./' + config.component.src + '/' + config.component.file, { standalone: config.component.name });
				standalone.transform(babelify.configure({
					plugins: [require('babel-plugin-object-assign')]
				}));
				config.aliasify && standalone.transform(aliasify);
				standalone.transform(shim);
			}

			var examples = config.example.scripts.map(function (file) {
				var fileBundle = browserify(opts);
				fileBundle.exclude(config.component.pkgName);
				fileBundle.add('./' + config.example.src + '/' + file);
				fileBundle.transform(babelify.configure({
					plugins: [require('babel-plugin-object-assign')]
				}));
				fileBundle.transform('brfs');
				config.aliasify && fileBundle.transform(aliasify);
				return {
					file: file,
					bundle: fileBundle
				};
			});

			config.component.dependencies.forEach(function (pkg) {
				common.require(pkg);
				bundle.exclude(pkg);
				if (standalone) standalone.exclude(pkg);
				examples.forEach(function (eg) {
					eg.bundle.exclude(pkg);
				});
			});

			if (dev) {
				watchBundle(common, 'common.js', dest);
				watchBundle(bundle, 'bundle.js', dest);
				if (standalone) watchBundle(standalone, 'standalone.js', dest);
				examples.forEach(function (eg) {
					watchBundle(eg.bundle, eg.file, dest);
				});
			}

			var bundles = [
				doBundle(common, 'common.js', dest),
				doBundle(bundle, 'bundle.js', dest)
			];

			if (standalone) {
				bundles.push(doBundle(standalone, 'standalone.js', dest));
			}

			return merge(bundles.concat(examples.map(function (eg) {
				return doBundle(eg.bundle, eg.file, dest);
			})));
		};
	}

	gulp.task('clean:examples', function () { return del([config.example.dist]); });
	gulp.task('watch:example:scripts', buildExampleScripts(true));
	gulp.task('build:example:scripts', buildExampleScripts());

	gulp.task('build:example:files', function () {
		return gulp.src(config.example.files, { cwd: config.example.src, base: config.example.src })
			.pipe(gulp.dest(config.example.dist))
			.pipe(connect.reload());
	});

	gulp.task('build:example:css', function(){
		if (!config.example.sass) return;

		return gulp.src(config.example.src + '/' + config.example.sass)
			.pipe(sass())
			.pipe(gulp.dest(config.example.dist))
			.pipe(connect.reload());
	});

	gulp.task('build:example:html', function(){
		if (!config.example.pug) return;

		return gulp.src(config.example.src + '/' + config.example.pug)
			.pipe(pug())
			.pipe(gulp.dest(config.example.dist))
			.pipe(connect.reload());
	});

	gulp.task('build:examples', [
		'build:example:files',
		'build:example:css',
		'build:example:scripts'
	]);

	gulp.task('watch:examples', [
		'build:example:files',
		'build:example:css'
	], function () {
		buildExampleScripts(true)();
		gulp.watch(config.example.files.map(function (i) {
			return config.example.src + '/' + i;
		}), ['build:example:files']);

		var watchPug = [];
		if (config.example.pug && config.example.pug.length > 0) {
			config.example.pug.forEach(function(fileName) {
				watchPug.push(config.example.src + '/' + fileName);
			});
		}

		if (config.component.pug && config.component.pug.path) {
			watchPug.push(config.example.src + '/**/*.pug');
		}

        var watchSASS = [];
        if (config.example.sass && config.example.sass.length > 0) {
            config.example.sass.forEach(function(fileName) {
                watchSASS.push(config.example.src + '/' + fileName);
            })
        }

        if (config.component.sass && config.component.sass.path) {
            watchSASS.push(config.component.sass.path + '/**/*.scss');
        }

		gulp.watch(watchPug, ['build:example:html']);
        gulp.watch(watchSASS, ['build:example:css']);
	});
};