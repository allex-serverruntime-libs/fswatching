function createFsWatcher (lib) {
  'use strict';

  var Node = require('allex_nodehelpersserverruntimelib')(lib),
    FsUtils = require('allex_fsutilsserverruntimelib')(lib),
    FsTraverser = require('allex_fstraversingserverruntimelib')(lib),
    ArryOperations = require('allex_arrayoperationslowlevellib')(lib.extend, lib.readPropertyFromDotDelimitedString, lib.isFunction, lib.Map, lib.AllexJSONizingError),
    FsWatcher = require('./creator')(lib, Node, FsUtils, ArryOperations, FsTraverser);

  return FsWatcher;
}

module.exports = createFsWatcher;
