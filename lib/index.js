
/*
Copyright (c) 2012 Adam Pritchard <pritchard.adam@gmail.com>

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

(function() {
  var Follower, deduce_newline_value, default_options, events, follow, fs, get_lines, util, watchit, _,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __slice = Array.prototype.slice;

  events = require('events');

  util = require('util');

  fs = require('fs');

  watchit = require('watchit');

  _ = require('underscore');

  default_options = {
    persistent: true
  };

  /*
  Watch for changes on `filename`.
  `options` is an optional object that looks like the following:
    {
      persistent: boolean, (default: true; ref: http://nodejs.org/docs/latest/api/fs.html#fs.watch)
    }
  
  listener is an optional callback that takes three arguments: `(event, filename, value)`. 
  
  Returns an instance of the Follower object, which is an EventEmitter.
  
  If a specific event is listened for, the callback will be passed `(filename, value)`.
  The 'all' event can also be listened for. Its callback will be passed
  `(event, filename, value)` (exactly like the listener callback passed into `follow`).
  
  The possible events are:
    * `'success'`: The follower started up successfully. Will be delayed if file 
                   does not exist. `value` is undefined.
    * `'line'`: `value` will be the new line that has been added to the file.
    * `'close'`: The follower has been closed. `value` is undefined.
    * `'error'`: An error has occurred. `value` will contain error information.
  
  The returned emitter also has a `close()` member that ends the following.
  */

  follow = function(filename, options, listener) {
    var follower, onchange, prev_mtime, prev_size, success_emitted, watcher;
    if (options == null) options = {};
    if (listener == null) listener = null;
    if (!(listener != null) && typeof options === 'function') {
      listener = options;
      options = {};
    }
    if (typeof filename !== 'string') {
      throw TypeError('`filename` must be a string');
    }
    if (typeof options !== 'object') {
      throw TypeError('if supplied, `options` must be an object');
    }
    if ((listener != null) && typeof listener !== 'function') {
      throw TypeError('if supplied, `listener` must be a function');
    }
    options = _.defaults(options, default_options);
    watcher = watchit(filename, {
      debounce: false,
      retain: true,
      persistent: options.persistent
    });
    prev_size = 0;
    prev_mtime = null;
    watcher.on('create', function() {
      return prev_size = 0;
    });
    watcher.on('unlink', function() {
      return prev_size = 0;
    });
    follower = new Follower(watcher, filename);
    if (listener != null) follower.addListener('all', listener);
    fs.stat(filename, function(error, stats) {
      if (error != null) {
        if (error.code !== 'ENOENT') follower.emit('error', filename, error);
        return;
      }
      if (!stats.isFile()) follower.emit('error', filename, "not a file");
      prev_size = stats.size;
      return prev_mtime = stats.mtime;
    });
    success_emitted = false;
    watcher.on('success', function() {
      if (!success_emitted) follower.emit('success', filename);
      return success_emitted = true;
    });
    watcher.on('failure', function() {
      return follower.emit('error', filename, 'watchit failure');
    });
    watcher.on('close', function() {
      return _.defer(function() {
        return follower.emit('close', filename);
      });
    });
    onchange = function(filename) {
      return fs.stat(filename, function(error, stats) {
        var accumulated_data, read_stream;
        if (error != null) {
          if (error.code !== 'ENOENT') follower.emit('error', filename, error);
          return;
        }
        if (stats.size <= prev_size) return;
        prev_mtime = stats.mtime;
        accumulated_data = '';
        read_stream = fs.createReadStream(filename, {
          encoding: 'utf8',
          start: prev_size
        });
        read_stream.on('error', function(error) {
          if (error.code !== 'ENOENT') {
            return follower.emit('error', filename, error);
          }
        });
        return read_stream.on('data', function(new_data) {
          var bytes_consumed, lines, _ref;
          accumulated_data += new_data;
          _ref = get_lines(accumulated_data), bytes_consumed = _ref[0], lines = _ref[1];
          accumulated_data = accumulated_data.slice(bytes_consumed);
          prev_size += bytes_consumed;
          return lines.forEach(function(line) {
            return follower.emit('line', filename, line);
          });
        });
      });
    };
    watcher.on('change', onchange);
    return follower;
  };

  /*
  Helpers
  */

  /*
  The emitter that's returned from follow(). It can be used to listen for events,
  and it can also be used to close the follower.
  */

  Follower = (function(_super) {

    __extends(Follower, _super);

    function Follower(watcher, filename) {
      this.watcher = watcher;
      this.filename = filename;
    }

    Follower.prototype.emit = function() {
      var etc, event, filename;
      event = arguments[0], filename = arguments[1], etc = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      if (event === 'newListener') return;
      Follower.__super__.emit.apply(this, [event, filename].concat(__slice.call(etc)));
      return Follower.__super__.emit.apply(this, ['all', event, filename].concat(__slice.call(etc)));
    };

    Follower.prototype.close = function() {
      if (this.watcher != null) {
        return this.watcher.close();
      } else {
        return _.defer(function() {
          return emit('close', this.filename);
        });
      }
    };

    return Follower;

  })(events.EventEmitter);

  /*
  Figure out if the text uses \n (unix) or \r\n (windows) newlines.
  */

  deduce_newline_value = function(sample) {
    if (sample.indexOf('\r\n') >= 0) return '\r\n';
    return '\n';
  };

  /*
  Splits the text into complete lines (must end with newline). 
  Returns a tuple of [bytes_consumed, [line1, line2, ...]]
  */

  get_lines = function(text) {
    var bytes_consumed, lines, newline;
    newline = deduce_newline_value(text);
    lines = text.split(newline);
    lines.pop();
    if (lines.length === 0) return [0, []];
    bytes_consumed = _.reduce(lines, function(memo, line) {
      return memo + line.length;
    }, 0);
    bytes_consumed += lines.length * newline.length;
    return [bytes_consumed, lines];
  };

  module.exports = follow;

  module.exports.__get_debug_exports = function() {
    return {
      deduce_newline_value: deduce_newline_value,
      get_lines: get_lines
    };
  };

}).call(this);