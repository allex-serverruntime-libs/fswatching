function createFsWatcher (execlib, Node, FsUtils, ArryOperations, FsTraverser) {
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    fs = Node.Fs,
    Path = Node.Path;

  function WatcherCollection () {
    this.watchers = new lib.Map();
  }
  WatcherCollection.prototype.destroy = function () {
    if (this.watchers) {
      lib.containerDestroyAll(this.watchers);
      this.watchers.destroy();
    }
    this.watchers = null;
  };
  WatcherCollection.prototype.addWatcher = function (parnt, depth, path, ctor, param, param2) {
    this.watchers.add(FsUtils.surePath(path), lib.isVal(param2) ? new ctor (parnt, depth, path, param, param2) : new ctor(parnt, depth, path, param));
  };

  function WatcherBase (parnt, depth, path) {
    this.parnt = parnt;
    this.depth = depth;
    this.path = path;
    this.timeout = null;
    this.listener = fs.watch(FsUtils.surePath(path), this.onChange.bind(this));
  }
  WatcherBase.prototype.destroy = function () {
    if (this.listener) {
      this.listener.close();
    }
    this.listener = null;
    if (this.timeout) {
      lib.clearTimeout(this.timeout);
    }
    this.timeout = null;
    if (this.path && this.parnt && this.parnt.watchers) {
      this.parnt.watchers.remove(FsUtils.surePath(this.path));
    }
    this.path = null;
    this.destroy = null;
    this.parnt = null;
  };
  WatcherBase.prototype.onChange = function (eventtype, filename) {
    if (eventtype === 'rename' && filename === this.path[this.path.length-1]) {
      //perhaps it's a child of mine that has my name?
      try {
        if (!FsUtils.fileType(FsUtils.pathForFilename(this.path, filename))) {
          this.destroy();
        }
        return;
        //however, perhaps I was being rm-ed, but my child of the same name was also being rm-ed
      } catch (ignore) {
        this.destroy();
        return;
      }
    }
    var evnt = ArryOperations.findElementWithProperty(this.eventTypes, 'name', eventtype);
    if (!evnt) {
      return;
    }
    if (!evnt.timeout) {
      this['checkFor_'+eventtype](filename);
      return;
    }
    if (this.timeout) {
      lib.clearTimeout(this.timeout);
    }
    this.timeout = lib.runNext(this['checkFor_'+eventtype].bind(this,filename), evnt.timeout);
  };


  function DirWatcher (parnt, depth, path, childctor, cbs) {
    WatcherBase.call(this, parnt, depth, path);
    WatcherCollection.call(this);
    this.childctor = childctor;
    this.cbs = cbs;
  }
  lib.inherit(DirWatcher, WatcherBase);
  lib.inheritMethods(DirWatcher, WatcherCollection,
    'addWatcher'
  );
  DirWatcher.prototype.destroy = function () {
    this.cbs = null;
    this.childctor = null;
    WatcherCollection.prototype.destroy.call(this);
    WatcherBase.prototype.destroy.call(this);
  };
  DirWatcher.prototype.checkFor_rename = function (filename) {
    var pathffn;
    if (!this.childctor) {
      return;
    }
    try {
      pathffn = FsUtils.pathForFilename(this.path, filename);
      if (FsUtils.fileType(pathffn) === 'd') {
        if (!this.removeWatcher(pathffn)) {
          this.createSubWatcher(filename);
        }
      } else {
        this.removeWatcher(pathffn);
      }
    } catch(ignore) {/*console.error(ignore);*/}
  };
  DirWatcher.prototype.removeWatcher = function (watcherfnpath) {
    var watcher = this.watchers.remove(watcherfnpath);
    if (watcher) {
      watcher.destroy();
      return true;
    }
    return false;
  };
  DirWatcher.prototype.createSubWatcher = function (filename) {
    this.addWatcher(this, this.depth+1, this.path.concat(filename), this.childctor, this.cbs);
  };
  DirWatcher.prototype.eventTypes = [{name: 'rename', timeout:100}];

  function FinalDirWatcher (parnt, depth, path, cbs) {
    WatcherBase.call(this, parnt, depth, path);
    this.cbs = cbs;
  }
  lib.inherit(FinalDirWatcher, WatcherBase);
  FinalDirWatcher.prototype.destroy = function () {
    this.cbs = null;
    WatcherBase.prototype.destroy.call(this);
  }
  FinalDirWatcher.prototype.checkFor_change = function (filename) {
    try {
      if (FsUtils.fileType(FsUtils.pathForFilename(this.path, filename)) === 'f') {
        this.invokeCreationOnFilename(filename);
      }
    } catch(ignore) {/*console.error(ignore);*/}
  };
  FinalDirWatcher.prototype.checkFor_rename = function (filename) {
    try {
      if (!FsUtils.fileType(FsUtils.pathForFilename(this.path, filename))) {
        this.invokeDestructionOnFilename(filename);
      }
    } catch(ignore) {/*console.error(ignore);*/}
  };
  FinalDirWatcher.prototype.invokeCreationOnFilename = function (filename) {
    return this.invokeCbOnFilename('creation', filename);
  };
  FinalDirWatcher.prototype.invokeDestructionOnFilename = function (filename) {
    return this.invokeCbOnFilename('destruction', filename);
  };
  FinalDirWatcher.prototype.invokeCbOnFilename = function (cbname, filename) {
    if (!(this.cbs && this.cbs[cbname])) {
      return;
    }
    this.cbs[cbname](this.path.slice(1).concat(filename));
  };
  FinalDirWatcher.prototype.eventTypes = [
    {name: 'change', timeout: 5*lib.intervals.Second},
    {name: 'rename', timeout: 100}
  ];

  function pathToArry (path) {
    if (lib.isString(path)) {
      return [path];
    }
    return path;
  }

  function FsWatcher (rootdir, depth, cbs, finalwatcherctor) {
    DirWatcher.call(this, null, 0, pathToArry(rootdir), finalwatcherctor || FinalDirWatcher, cbs);
    this.depth = depth;
    this.handlePath([FsUtils.surePath(this.path)], 0);
  }
  lib.inherit(FsWatcher, DirWatcher);
  FsWatcher.prototype.destroy = function () {
    this.cbs = null;
    this.depth = null;
    this.path = null;
    DirWatcher.prototype.destroy.call(this);
  };
  FsWatcher.prototype.handlePath = function (path, depth) {
    depth = depth || 0;
    depth++;
    if (depth > this.depth) {
      return;
    }
    var fst = new FsTraverser(path, 1, this.onPathItem.bind(this, path, depth), 'd');
    fst.go().then(fst.destroy.bind(fst));
  };
  FsWatcher.prototype.onPathItem = function (path, depth, items) {
    if (!lib.isArray(items)) {
      return;
    }
    if (!this.watchers) {
      return;
    }
    path = path.slice();
    path.push(items[1]);
    this.addWatcher(this, depth, path, depth===this.depth ? this.childctor : DirWatcher, this.paramForNewWatcher(depth), this.param2ForNewWatcher(depth));
    this.handlePath(path, depth);
  };
  FsWatcher.prototype.createSubWatcher = function (filename) {
    var depth = 1;
    this.addWatcher(this, depth, this.path.concat(filename), depth===this.depth ? this.childctor : DirWatcher, this.paramForNewWatcher(depth), this.param2ForNewWatcher(depth));
  };
  FsWatcher.prototype.paramForNewWatcher = function (depth) {
    if (depth < this.depth-1) {
      return DirWatcher;
    }
    if (depth < this.depth) {
      return this.childctor;
    }
    return this.cbs;
  };
  FsWatcher.prototype.param2ForNewWatcher = function (depth) {
    if (depth < this.depth-1) {
      return;
    }
    if (depth < this.depth) {
      return this.cbs;
    }
  };
  FsWatcher.FinalDirWatcher = FsWatcher;

  return FsWatcher;
}

module.exports = createFsWatcher;
