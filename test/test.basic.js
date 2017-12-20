var Node = require('allex_nodehelpersserverruntimelib')(lib),
  FsUtils = require('allex_fsutilsserverruntimelib')(lib),
  FsTraverser = require('allex_fstraversingserverruntimelib')(lib),
  ArryOperations = require('allex_arrayoperationslowlevellib')(lib.extend, lib.readPropertyFromDotDelimitedString, lib.isFunction, lib.Map, lib.AllexJSONizingError);


function writeToFile (filepath) {
  var d = q.defer(), _d = d, ret = d.promise;
  Node.Fs.writeFile(filepath, 'blah', function (err, res) {
    if (err) {
      _d.reject(err);
    } else {
      _d.resolve(res);
    }
    _d = null;
  });
  return ret;
}

function writeToFiles (dirpath, count) {
  var i, promises = [];
  for (i=0; i<count; i++) {
    promises.push(writeToFile(Node.Path.join(dirpath, 'blah'+i)));
  }
  return q.all(promises);
}

function WatcherTest (dir, targetdir, filecount) {
  this.defer = null;
  this.dir = dir;
  this.targetdir = targetdir;
  this.filecount = filecount;
  this.watcher = new FsWatcher(dir, lib.isArray(targetdir) ? targetdir.length : 0, {
    creation: this.onFile.bind(this),
    destruction: this.onFileRemoved.bind(this)
  });
}
WatcherTest.prototype.destroy = function () {
  if (this.watcher) {
    this.watcher.destroy();
  }
  this.watcher = null;
  this.filecount = null;
  this.targetdir = null;
  this.dir = null;
  this.defer = null;
};
WatcherTest.prototype.onFile = function (patharry) {
  console.log('onFile', patharry);
  if (!this.defer) {
    return;
  }
  this.defer.resolve(true);
  this.destroy();
};
WatcherTest.prototype.onFileRemoved = function (patharry) {
  console.log('onFileRemoved', patharry);
};
WatcherTest.prototype.go = function () {
  if (this.defer) {
    return this.defer.promise;
  }
  return q.delay(1000, true).then(this.doWrite.bind(this));
};
WatcherTest.prototype.doWrite = function () {
  if (this.defer) {
    return this.defer.promise;
  }
  this.defer = q.defer();
  writeToFiles(Node.Path.join(FsUtils.surePath(this.dir), FsUtils.surePath(this.targetdir)), this.filecount).then(
    this.onWritten.bind(this),
    this.onWriteFailed.bind(this)
  );
  //Node.Fs.writeFile(Node.Path.join(FsUtils.surePath(this.dir), FsUtils.surePath(this.targetdir), 'blah'), 'blah', this.onWritten.bind(this));
  return this.defer.promise;
};
WatcherTest.prototype.onWritten = function (result) {
  if (!this.defer) {
    return;
  }
  lib.runNext(this.finalCheck.bind(this), lib.intervals.Second*20);   
};
WatcherTest.prototype.onWriteFailed = function (reason) {
  if (!this.defer) {
    return;
  }
  this.defer.reject(reason);
  this.destroy();
};
WatcherTest.prototype.finalCheck = function () {
  if (this.defer) {
    this.defer.reject(new lib.Error('WATCHER_NOT_TRIGGERED', 'FsWatcher was not triggered even after 20 seconds'));
    this.destroy();
    return;
  }
};

function testWatcher (dir, targetdir, filecount) {
  var wt = new WatcherTest(dir, targetdir, filecount);
  return wt.go();
}

function testWatcherIt (caption, dir, targetdir, filecount) {
  var tw = testWatcher;
  return it (caption, function () {
    var ret;
    this.timeout(22*1000);
    ret = tw(dir, targetdir, filecount);
    dir = null;
    targetdir = null;
    filecount = null;
    tw = null;
    return ret;
  });
}


describe('Basic Test', function () {
  it ('Load lib', function () {
    return setGlobal('FsWatcher', require('..')(execlib.lib));
  });
  testWatcherIt('Test for depth 0, 1 file', [__dirname, 'basictestdir'], [], 1);
  testWatcherIt('Test for depth 1, 1 file', [__dirname, 'basictestdir'], ['level0'], 1);
  testWatcherIt('Test for depth 2, 1 file', [__dirname, 'basictestdir'], ['level0', 'level1'], 1);
  testWatcherIt('Test for depth 0, 2 files', [__dirname, 'basictestdir'], [], 2);
  testWatcherIt('Test for depth 1, 2 files', [__dirname, 'basictestdir'], ['level0'], 2);
  testWatcherIt('Test for depth 2, 2 files', [__dirname, 'basictestdir'], ['level0', 'level1'], 2);
});
