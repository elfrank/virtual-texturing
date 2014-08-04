/**
 * @author Francico Avila - http://franciscoavila.mx
 */

(function () {
  "use strict";

  /*global THREE,Float32Array,Uint8Array*/
  /*jslint browser: true*/
  /*jslint bitwise: true*/

  var VT = {};

  var StatusNotAvailable = 0;
  var StatusAvailable = 1;
  var StatusPendingDelete = 2;

  //
  //
  //

  VT.Page = function () {
    this.valid = false;
    this.priority = 0;
    this.mipLevel = 0;
    this.forced = false;
    this.reserved = 0;
    this.pageId = null;
  };

  //
  //
  //

  VT.PageId = {

    create: function (page, mipLevel) {
      return ((page & 0xFFFFFF) << 4) | (mipLevel & 0xF);
    },

    getMipMapLevel: function (id) {
      return id & 0xF;
    },

    getPageNumber: function (id) {
      return id >> 4;
    },

    isValid: function (page) {
      return page >= 0;
    },

    createInvalid: function () {
      return -1;
    }
  };

  /**
 * VT.UsageTable
 */

  VT.UsageTable = function (size) {
    this.width = size;
    this.height = size;
    this.size = 0;

    this.maxMipMapLevel = Math.floor(Math.log(size) / Math.log(2));

    this.table = {};
  };

  VT.UsageTable.prototype = {
    constructor: VT.UsageTable,

    set: function (pageX, pageY, mipMapLevel) {
      var size = 1 << (this.maxMipMapLevel - mipMapLevel);
      var coord = pageY * size + pageX;

      this.add(coord, mipMapLevel);
    },

    add: function (pageNumber, mipMapLevel) {
      var id = VT.PageId.create(pageNumber, mipMapLevel);

      if (undefined !== this.table[id]) {
        ++this.table[id].hits;
        ++this.size;
      } else {
        this.table[id] = {
          hits: 1
        };
      }
    },

    clear: function () {
      this.table = {};
      this.size = 0;
    },

    get pageCount() {
      return this.width * this.height;
    },

    set pageCount(value) {
      throw new Error('Cannot set pageCount to ' + value + ' manually, it\'s computed from width * height.');
    },

    get entryCount() {
      return this.size;
    },

    set entryCount(value) {
      throw new Error('Cannot set entryCount to ' + value + ' manually.');
    },

    isUsed: function (id) {
      return this.table[id] !== undefined;
    }
  };

  //
  //
  //

  VT.Tile = function (numMipMapLevels, id, hits, parentId) {
    this.parentId = (undefined === parentId) ? VT.PageId.createInvalid() : parentId;
    this.id = id;
    this.hits = (undefined !== hits) ? hits : 0;
    this.pageNumber = VT.PageId.getPageNumber(id);
    this.mipMapLevel = VT.PageId.getMipMapLevel(id);
    this.loaded = false;
    this.tileName = (numMipMapLevels - this.mipMapLevel) + '-' + this.pageNumber + ".jpg";
    this.images = [];
    this.partsLoaded = 0;
    this.partsCount = 0;
  };

  VT.Tile.prototype = {
    load: function (locations, callback) {
      var type, filePath, image;

      var scope = this;
      function onLoadImage() {
        if (scope.partsCount === ++scope.partsLoaded) {
          scope.loaded = true;
          console.log('Tile ' + scope.pageNumber + ' at level ' + scope.mipMapLevel + ' loaded');

          if (callback && ('function' === typeof callback)) {
            callback();
          }
        }
      }

      try {
        for (type in locations) {
          if (locations.hasOwnProperty(type)) {
            ++this.partsCount;
            filePath = locations[type] + this.tileName;
            image = new Image();

            image.onload = onLoadImage;

            image.crossOrigin = 'Anonymous';
            image.src = filePath;

            this.images.push(image);
          }
        }
      } catch (e) {
        console.log(e.stack);
      }
    },

    isLoaded: function () {
      return this.loaded;
    },

    hasParent: function () {
      return VT.PageId.isValid(this.parentId);
    }
  };

  //
  //
  //

  VT.TileQueue = function (size, locations) {
    this.maxLoading = size;
    this.onLoading = 0;

    this.locations = locations;
    this.callback = null;

    this.content = [];
    this.sorted = false;

    this.loadCount = 0;
  };

  VT.TileQueue.prototype.push = function (item) {
    this.content.push({object: item, priority: item.hits});
    this.sorted = false;

    this.process();
  };

  VT.TileQueue.prototype.process = function () {
    if (this.onLoading < this.maxLoading) {
      var item = this.pop();

      if (item) {

        this.onLoading++;
        var scope = this;

        item.load(this.locations, function () {
          scope.callback(item);
          --scope.onLoading;

          ++scope.loadCount;
          console.log("Tiles loaded count=" + scope.loadCount + " | Images loaded count=" + (scope.loadCount * 3));

          scope.process();
        });
      }
    }
  };

  VT.TileQueue.prototype.pop = function () {
    if (!this.sorted) {
      this.sort();
    }

    var element = this.content.pop();
    if (element) {
      return element.object;
    }

    return undefined;
  };

  VT.TileQueue.prototype.empty = function () {
    return 0 === this.content.length;
  };

  VT.TileQueue.prototype.contains = function (id) {
    var i;
    for (i = this.content.length - 1; i >= 0; --i) {
      if (id === this.content[i].object.id) {
        return true;
      }
    }

    return false;
  };

  VT.TileQueue.prototype.size = function () {
    return this.content.length;
  };

  VT.TileQueue.prototype.top = function () {
    if (!this.sorted) {
      this.sort();
    }

    var element = this.content[this.content.length - 1];
    if (element) {
      return element.object;
    }

    return undefined;
  };

  VT.TileQueue.prototype.sort = function () {
    this.content.sort(function (a, b) {
      return a.priority - b.priority;
    });

    this.sorted = true;
  };

  //
  //
  //

  VT.Cache = function (context, tileSize, padding, width, height) {

    this.context = context;
    this.width = width;
    this.height = height;

    this.realTileSize = {
      x: tileSize + (2 * padding),
      y: tileSize + (2 * padding)
    };

    this.tileCountPerSide = {
      x: parseInt(this.width / this.realTileSize.x, 10),
      y: parseInt(this.height / this.realTileSize.y, 10)
    };

    this.tileCount = this.tileCountPerSide.x * this.tileCountPerSide.y;

    this.usablePageSize = tileSize;
    this.padding = padding;
    this.size = {
      x: width,
      y: height
    };

    this.relativePadding = {
      x: padding / this.width,
      y : padding / this.height
    };

    this.textures = {
      tDiffuse : null,
      tNormal : null,
      tSpecular : null
    };

    this.cachedPages = {};
    this.freeSlots = [];
    this.slots = [];
    this.loadingQueue = [];

    this.init();
    this.clear();
  };

  VT.Cache.prototype = {

    init: function () {
      var i, type, texture;

      for (i = 0; i < this.tileCount; ++i) {
        this.slots.push(new VT.Page());
      }

      for (type in this.textures) {
        if (this.textures.hasOwnProperty(type)) {
          texture = new THREE.DataTexture(
            null,
            this.width,
            this.height,
            THREE.RGBAFormat,
            THREE.UnsignedByteType,
            new THREE.UVMapping(),
            THREE.ClampToEdgeWrapping,
            THREE.ClampToEdgeWrapping,
            THREE.LinearFilter,
            THREE.LinearFilter
          );

          texture.needsUpdate = true;
          this.textures[type] = texture;
        }
      }
    },

    getNextFreeSlot: function () {
      try {
        if (!this.hasFreeSlot()) {
          this.freeSlot();
        }

        // get the first slot
        var id, slot;
        //for (var slot in this.freeSlots) {
        for (slot = 0; slot < this.freeSlots.length; ++slot) {
          if (true === this.freeSlots[slot]) {
            this.freeSlots[slot] = false;
            id = slot;

            // end iteration, we just want one item
            break;
          }
        }

        if (undefined === id) {
          console.error("FreeSlotNotFound");
        }

        return parseInt(id, 10);

      } catch (e) {
        console.log(e.stack);
      }
    },

    getPageCoordinates: function (id) {
      var topLeftCorner = [
        ((id % this.tileCountPerSide.x) * this.realTileSize.x) / this.size.x,
        (Math.floor(id / this.tileCountPerSide.y) * this.realTileSize.y) / this.size.y];

      // add offset
      topLeftCorner[0] += this.relativePadding.x;
      topLeftCorner[1] += this.relativePadding.y;

      return topLeftCorner;
    },

    getPageSizeInTextureSpace: function () {
      var space = [
        this.usablePageSize / this.size.x,
        this.usablePageSize / this.size.y];

      return space;
    },

    releasePage: function (id) {
      // if possible, move page to the free list
      if (undefined !== this.cachedPages[id]) {
        var slot = this.cachedPages[id];
        this.freeSlots[slot] = true;
      }
    },

    getPageMipLevel: function (id) {
      if (this.slots[id] === undefined) {
        console.error("page on slot " + id + " is undefined");
      }

      return this.slots[id].mipLevel;
    },

    onPageDropped: function (id) {
      if (this.pageDroppedCallback) {
        this.pageDroppedCallback(
          VT.PageId.getPageNumber(id),
          VT.PageId.getMipMapLevel(id)
        );
      }
    },

    getPageStatus: function (id) {
      if (!this.cachedPages[id]) {
        return StatusNotAvailable;
      }

      if (!this.slots[this.cachedPages[id]].valid) {
        return StatusNotAvailable;
      }

      if (true === this.freeSlots[this.cachedPages[id]]) {
        return StatusPendingDelete;
      }

      return StatusAvailable;
    },

    restorePage: function (id) {
      try {
        if (!this.cachedPages[id]) {
          return {
            wasRestored: false,
            id: -1
          };
        }

        if (this.slots[this.cachedPages[id]].pageId !== parseInt(id, 10)) {
          console.error("ErrorOnId");
        }

        this.freeSlots[this.cachedPages[id]] = false;

        return {
          wasRestored: true,
          id: this.cachedPages[id]
        };
      } catch (e) {
        console.log(e.stack);
      }
    },

    getStatus: function (slotsUsed, slotsMarkedFree, slotsEmpty) {
      var i;
      slotsUsed = slotsMarkedFree = slotsEmpty = 0;

      for (i = 0; i < this.slots.length; ++i) {
        if (true === this.slots[i].valid) {
          ++slotsUsed;
        } else {
          ++slotsMarkedFree;
        }
      }

      for (i = 0; i < this.freeSlots.length; ++i) {
        if (true === this.freeSlots[i]) {
          ++slotsEmpty;
        }
      }

      return {
        used: slotsUsed,
        markedFree: slotsMarkedFree,
        free: slotsEmpty
      };
    }
  };

  VT.Cache.prototype.clear = function () {
    this.cachedPages = {};
    this.freeSlots = [];

    var i;

    for (i = 0; i < this.tileCount; ++i) {
      this.slots[i].valid = false;
      this.freeSlots[i] = true;
    }
  };

  VT.Cache.prototype.freeSlot = function () {
    // find one slot and free it
    // this function gets called when no slots are free
    try {
      var i, page, minMipLevel = Number.MAX_VALUE;

      for (i = 0; i < this.tileCount; ++i) {
        if ((false === this.slots[i].forced) && (this.slots[i].mipLevel < minMipLevel)) {
          minMipLevel = this.slots[i].mipLevel;
          page = i;
        }
      }

      if ((undefined === page) || (true === this.slots[page].forced)) {
        console.error("FreeSlotNotFound");
      }

      this.freeSlots[page] = true;
    } catch (e) {
      console.log(e.stack);
    }
  };

  VT.Cache.prototype.hasFreeSlot = function () {
    var i;
    for (i = 0; i < this.freeSlots.length; ++i) {
      if (true === this.freeSlots[i]) {
        return true;
      }
    }

    return false;
  };

  VT.Cache.prototype.reset = function () {
    try {
      var id = VT.PageId.create(0, 4);
      var tile = new VT.Tile(id);

      this.cachePage(tile, true);

    } catch (e) {
      console.log(e.stack);
    }
  };

  VT.Cache.prototype.drawToTexture = function (tile, x, y) {
    // update cache texture 
    var i;
    if (tile.loaded) {
      var gl = this.context;
      var types = ["tDiffuse", "tNormal", "tSpecular"];
      for (i = 0; i < tile.images.length; ++i) {
        gl.bindTexture(gl.TEXTURE_2D, this.textures[types[i]].__webglTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, tile.images[i]);
      }
    } else {
      for (i = 0; i < tile.images.length; ++i) {
        console.error('Tile ' + tile.images[i].src + ' was not available yet.');
      }
    }
  };

  VT.Cache.prototype.writeToCache = function (id, forced) {
    // try to restore
    if (this.restorePage(id).wasRestored) {
      return this.cachedPages[id];
    }

    // get the next free page
    var page = this.getNextFreeSlot();
    this.cachedPages[id] = page;

    if (this.slots[page].valid) {
      this.onPageDropped(this.slots[page].pageId);
      // remove it now, (otherwise handles leak)
      delete this.cachedPages[this.slots[page].pageId];
      //this.cachedPages[this.slots[page].pageId] = undefined;
    }

    // update slot
    this.slots[page].forced = forced;
    this.slots[page].mipLevel = VT.PageId.getMipMapLevel(id);
    this.slots[page].pageId = id;
    this.slots[page].valid = true;

    return page;
  };

  VT.Cache.prototype.cachePage = function (tile, forced) {
    try {
      var id = tile.id;
      var page = this.writeToCache(id, forced);

      // compute x,y coordinate
      var x = parseInt((page % this.tileCountPerSide.x) * this.realTileSize.x, 10);
      var y = parseInt(Math.floor((page / this.tileCountPerSide.y)) * this.realTileSize.y, 10);

      this.drawToTexture(tile, x, y);

      return page;
    } catch (e) {
      console.log(e.stack);
    }
  };

  VT.NodeTree = function (id, value, level) {
    this.children = [null, null, null, null];
    this.id = id;
    this.level = level;
    this.needsUpdate = false;
    this.value = value;
    this.visited = false;
  };

  VT.NodeTree.prototype = {
    update: function (value) {
      this.value = parseInt(value, 10);
    },

    setChildren: function (children0, children1, children2, children3) {
      this.children[0] = children0;
      this.children[1] = children1;
      this.children[2] = children2;
      this.children[3] = children3;
    },

    canMergeWith: function (node) {
      return node.value === this.value;
    },

    canMergeChildren: function () {

      var child0 = this.children[0];
      var child1 = this.children[1];
      var child2 = this.children[2];
      var child3 = this.children[3];

      var result = false;
      var ab = child0.canMergeWith(child1);
      var cd = child2.canMergeWith(child3);
      if (ab && cd) {
        var abcd = child0.canMergeWith(child2);
        if (abcd) {
          result = true;
        }
      }

      this.needsUpdate = result;
    }
  };

  //
  //
  //

  /**
   * Mipmap table
   * level 0 has size*size entries
   * level 1 has (size>>1) * (size>>1)
   * level n-th has only 1 entry
  */

  VT.IndirectionTable = function (context, size) {

    // quad-tree representation
    this.nodes = null;
    this.offsets = [];
    this.maxLevel = 0;
    this.size = size;
    this.numElementsPerLevel = [];

    // graphics and webgl stuff
    this.dataArray = new Float32Array(size * size * 4);
    this.canvas = null;
    this.imageData = null;
    this.texture = null;
    this.context = context;
    this.dataPerLevel = [];

    this.init(size);
  };

  VT.IndirectionTable.prototype = {
    init: function (size) {
      this.maxLevel = Math.floor(Math.log(size) / Math.log(2));

      var i, j, offset, numElements;
      var accumulator = 0;
      var sizeOnLevel = size;
      for (i = 0; i <= this.maxLevel; ++i) {

        this.offsets.push(accumulator);

        numElements = sizeOnLevel * sizeOnLevel;
        this.numElementsPerLevel.unshift(numElements);
        this.dataPerLevel.push(new Float32Array(numElements * 4));
        accumulator += numElements;

        sizeOnLevel >>= 1;
      }

      //this.nodes = new Array(accumulator);
      this.nodes = [];
      for (i = 0; i < accumulator; ++i) {
        this.nodes[i] = undefined;
      }

      for (i = 0; i < this.dataPerLevel.length; ++i) {
        numElements = this.numElementsPerLevel[i];
        for (j = 0; j < numElements; j += 4) {
          this.dataPerLevel[i][j] = 0.0;
          this.dataPerLevel[i][j + 1] = 0.0;
          this.dataPerLevel[i][j + 2] = 0.0;
          this.dataPerLevel[i][j + 3] = 255.0;
        }
      }

      // ------------------------------------------------
      this.canvas = document.createElement('canvas');
      this.canvas.width = size;
      this.canvas.height = size;
      this.imageData = this.canvas.getContext('2d').createImageData(this.canvas.width, this.canvas.height);

      numElements = size * size;
      for (i = 0; i < numElements; ++i) {
        offset = i * 4;
        this.dataArray[offset] = 0.0;
        this.dataArray[offset + 1] = 0.0;
        this.dataArray[offset + 2] = 0.0;
        this.dataArray[offset + 3] = 255.0;
      }

      this.texture = new THREE.DataTexture(
        this.dataArray,
        size, //width 
        size, //height
        THREE.RGBAFormat,
        THREE.FloatType,
        new THREE.UVMapping(),
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.NearestFilter,
        THREE.LinearMipMapLinearFilter
      );

      this.texture.needsUpdate = true;
    },

    debug: function (params) {

      var scope = this;

      var verticalPosition = (params && params.verticalPosition) ? params.verticalPosition : 130;
      var horizontalPosition = (params && params.horizontalPosition) ? params.horizontalPosition : 10;
      var position = (params && params.position) ? params.position : "absolute";
      var zIndex = (params && params.zIndex) ? params.zIndex : "100";
      var borderColor = (params && params.borderColor) ? params.borderColor : "blue";
      var borderStyle = (params && params.borderStyle) ? params.borderStyle : "solid";
      var borderWidth = (params && params.borderWidth) ? params.borderWidth : 1;

      var fontSize = (params && params.fontSize) ? params.fontSize : 13; // in pixels
      var fontFamily = (params && params.fontFamily) ? params.fontFamily : "Arial";
      var lineHeight = (params && params.lineHeight) ? params.lineHeight : 20; // in pixels

      // create div title
      var divTitle = document.createElement('div');

      divTitle.style.color = "#000000";
      divTitle.style.fontFamily = fontFamily;
      divTitle.style.fontSize = fontSize + "px";
      divTitle.style.fontWeight = "bold";
      divTitle.style.zIndex = 100;
      divTitle.style.position = "absolute";
      divTitle.style.top = verticalPosition + "px";
      divTitle.style.left = horizontalPosition + "px";

      divTitle.innerHTML = "Indirection Table";
      document.body.appendChild(divTitle);

      scope.canvas.style.top = verticalPosition + lineHeight + "px";
      scope.canvas.style.left = horizontalPosition + "px";
      scope.canvas.style.position = position;
      scope.canvas.style.zIndex = zIndex;
      scope.canvas.style.borderColor = borderColor;
      scope.canvas.style.borderStyle = borderStyle;
      scope.canvas.style.borderWidth = borderWidth + "px";

      document.body.appendChild(scope.canvas);
    },

    setChildren: function (entry, level, value, predicate) {
      if (0 === level) {
        return;
      }

      var i, iy, ix, currentEntry, element;
      var x = entry % this.getLevelWidth(level);
      var y = Math.floor(entry / this.getLevelHeight(level));

      var size = 1;
      for (i = level - 1; i >= 0; --i) {
        x <<= 1;
        y <<= 1;
        size <<= 1;

        for (iy = 0; iy < size; ++iy) {
          for (ix = 0; ix < size; ++ix) {
            currentEntry = this.getEntryIndex(x + ix, y + iy, i);
            element = this.getElementAt(currentEntry, i).value;

            if (predicate === element) {
              this.set(currentEntry, i, value);
            }
          }
        }
      }
    },

    update: function (cache) {

      var i, x, y, root, height, width, scope, lowerX, lowerY, idx, node, mipMapLevel;

      scope = this;

      root = this.nodes[this.nodes.length - 1];
      root.needsUpdate = true;
      root.visited = false;

      function setData(quadTreeLevel) {
        var _idx, _node, _coords, _mipMapLevel, _offset;
        var _length = scope.getElementCountAtLevel(quadTreeLevel);

        for (_idx = 0; _idx < _length; ++_idx) {
          _node = scope.getElementAt(_idx, 0);
          _coords = cache.getPageCoordinates(_node.value);
          _mipMapLevel = scope.maxLevel - cache.getPageMipLevel(_node.value);

          // idx => page
          _offset = _idx * 4;

          scope.dataArray[_offset] = _coords[0];
          scope.dataArray[_offset + 1] = _coords[1];
          scope.dataArray[_offset + 2] = _mipMapLevel;
          scope.dataArray[_offset + 3] = 255.0;

          scope.imageData.data[_offset] = parseInt(255 * _coords[0], 10);
          scope.imageData.data[_offset + 1] = parseInt(255 * _coords[1], 10);
          scope.imageData.data[_offset + 2] = parseInt(255 * _mipMapLevel, 10);
          scope.imageData.data[_offset + 3] = 255;
        }
      }

      function writeToCanvas() {
        var _x = 0;
        var _y = 0;
        scope.canvas.getContext('2d').putImageData(scope.imageData, _x, _y);
      }

      function writeToTexture() {
        // update indirection texture on GPU memory
        if (scope.texture.__webglTexture) {
          var gl = scope.context;
          gl.bindTexture(gl.TEXTURE_2D, scope.texture.__webglTexture);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, scope.size, scope.size, gl.RGBA, gl.FLOAT, scope.dataArray);
        }
      }

      function setUpdate(_x, _y, _level, _handle, _mipMapLevel) {
        var _entry = scope.getEntryIndex(_x, _y, _level);
        var _node = scope.getElementAt(_entry, _level);

        var _isEmpty = ((-1) === _node.value);

        if (_isEmpty || (cache.getPageMipLevel(_node.value) > _mipMapLevel)) {
          scope.set(_entry, _level, _handle);
        }

        return false;
      }

      for (i = this.maxLevel; i >= 1; --i) {
        height = this.getLevelHeight(i);

        for (y = 0; y < height; ++y) {
          width = this.getLevelWidth(i);

          for (x = 0; x < width; ++x) {

            // update corresponding elements
            lowerX = x << 1;
            lowerY = y << 1;

            idx = this.getEntryIndex(x, y, i);
            node = this.getElementAt(idx, i);

            if (-1 === node.value) {
              console.error("Not Found");
            }

            mipMapLevel = cache.getPageMipLevel(node.value);

            // update four children     ---------
            //              | a | b |
            //              |---  |---  |
            //              | c | d |
            //              ---------
            // a
            setUpdate(lowerX, lowerY, i - 1, node.value, mipMapLevel);
            // b
            setUpdate(lowerX + 1, lowerY, i - 1, node.value, mipMapLevel);
            // c
            setUpdate(lowerX, lowerY + 1, i - 1, node.value, mipMapLevel);
            // d
            setUpdate(lowerX + 1, lowerY + 1, i - 1, node.value, mipMapLevel);

            node.children[0].visited = false;
            node.children[1].visited = false;
            node.children[2].visited = false;
            node.children[3].visited = false;

            // merge cells
            node.canMergeChildren();
          }
        }
        //console.log('LEVEL');
      }

      setData(0);
      writeToCanvas();
      writeToTexture();

      //console.log(scope.numElementsPerLevel);
      //console.log(scope.dataPerLevel);
      //console.log(scope.dataArray);
    },

    getLevelWidth: function (level) {
      return 1 << (this.maxLevel - level);
    },

    getLevelHeight: function (level) {
      return 1 << (this.maxLevel - level);
    },

    getEntryIndex: function (x, y, level) {
      var countX = this.getLevelWidth(level);
      if (x > countX) {
        console.error('x is > total width of level ' + level + ' (' + countX + ')');
      }

      var offsetY = y * countX;
      var index = offsetY + x;

      return index;
    },

    getElementAt: function (entry, level) {
      var offset = this.offsets[level];
      var stride = offset + entry;
      var value = parseInt(this.nodes[stride].value, 10);

      if (isNaN(value)) {
        console.error('elemenet is NaN.');
      }

      return this.nodes[stride];
    },

    set: function (entry, level, newValue) {
      if (isNaN(entry) || isNaN(level) || isNaN(newValue)) {
        console.error('NaN detected on VT.IndirectionTable.set');
        return false;
      }

      var offset = this.offsets[level];
      var stride = offset + entry;

      newValue = parseInt(newValue, 10);
      this.nodes[stride].update(newValue);
    },

    clear: function (clearValue) {
      var y, x, a, b, c, d, lowerX, lowerY, idx, node, mipMapLevel;

      var scope = this;
      function setUpdate(x, y, level, newValue) {
        var entry = scope.getEntryIndex(x, y, level);

        var offset = scope.offsets[level];
        var stride = offset + entry;
        var child = new VT.NodeTree(entry, newValue, level);
        scope.nodes[stride] = child;

        return child;
      }

      clearValue = parseInt(clearValue, 10);

      this.nodes[this.nodes.length - 1] = new VT.NodeTree(0, clearValue, 0);
      for (mipMapLevel = scope.maxLevel; mipMapLevel >= 1; --mipMapLevel) {
        for (y = 0; y < scope.getLevelHeight(mipMapLevel); ++y) {
          for (x = 0; x < scope.getLevelWidth(mipMapLevel); ++x) {

            // update corresponding elements
            lowerX = x << 1;
            lowerY = y << 1;

            idx = scope.getEntryIndex(x, y, mipMapLevel);
            node = scope.getElementAt(idx, mipMapLevel);

            a = setUpdate(lowerX, lowerY, mipMapLevel - 1, node.value);
            b = setUpdate(lowerX + 1, lowerY, mipMapLevel - 1, node.value);
            c = setUpdate(lowerX, lowerY + 1, mipMapLevel - 1, node.value);
            d = setUpdate(lowerX + 1, lowerY + 1, mipMapLevel - 1, node.value);

            node.setChildren(a, b, c, d);
          }
        }
      }
    },

    getElementCountAtLevel: function (level) {
      var countX = this.getLevelWidth(level);
      var countY = this.getLevelHeight(level);
      var total = countX * countY;
      return total;
    }
  };

  //
  //
  //

  VT.TileDetermination = function () {
    this.scene = new THREE.Scene();
    this.canvas = null;
    this.renderTarget = null;
    this.data = null;
    this.imgData = null;
  };

  VT.TileDetermination.prototype.init = function (_width, _height) {
    var renderTargetParameters = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBufer: false
    };

    // TODO: resize rt on window resize
    this.renderTarget = new THREE.WebGLRenderTarget(
      Math.floor(_width * 0.125),
      Math.floor(_height * 0.125),
      renderTargetParameters
    );

    var width = this.renderTarget.width;
    var height = this.renderTarget.height;

    this.canvas = document.createElement('canvas');
    this.canvas.width =  width;
    this.canvas.height = height;

    this.data = new Uint8Array(width * height * 4);
    this.imgData = this.canvas.getContext('2d').createImageData(width, height);
  };

  VT.TileDetermination.prototype.debug = function () {
    var scope = this;

    var verticalPosition = 0;
    var horizontalPosition = 10;
    var position = "absolute";
    var zIndex = "100";
    var borderColor = "red";
    var borderStyle = "solid";
    var borderWidth = 1;

    var fontSize = 13; // in pixels
    var fontFamily = "Arial";
    var lineHeight = 20; // in pixels

    // create div title
    var divTitle = document.createElement('div');

    divTitle.style.color = "#000000";
    divTitle.style.fontFamily = fontFamily;
    divTitle.style.fontSize = fontSize + "px";
    divTitle.style.fontWeight = "bold";
    divTitle.style.zIndex = 100;
    divTitle.style.position = "absolute";
    divTitle.style.top = verticalPosition + "px";
    divTitle.style.left = horizontalPosition + "px";

    divTitle.innerHTML = "Visible Tiles (Feedback Buffer)";
    document.body.appendChild(divTitle);

    scope.canvas.style.top = verticalPosition + lineHeight + "px";
    scope.canvas.style.left = horizontalPosition + "px";
    scope.canvas.style.position = position;
    scope.canvas.style.zIndex = zIndex;
    scope.canvas.style.borderColor = borderColor;
    scope.canvas.style.borderStyle = borderStyle;
    scope.canvas.style.borderWidth = borderWidth + "px";

    document.body.appendChild(scope.canvas);
  };


  VT.TileDetermination.prototype.parseImage = function (context, sparseTable) {
    var scope = this;

    function parse(sparseTable) {
      var i, offset, r, g, b;
      var numPixels = scope.renderTarget.width * scope.renderTarget.height;

      for (i = 0; i < numPixels; ++i) {
        offset = i * 4;

        if (0 !== scope.data[offset + 3]) {
          r = scope.data[offset];
          g = scope.data[offset + 1];
          b = scope.data[offset + 2];

          sparseTable.set(r, g, b);
        }
      }
    }

    // copy render buffer to imgData.data
    var gl = context;
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.readPixels(0, 0, this.renderTarget.width, this.renderTarget.height, gl.RGBA, gl.UNSIGNED_BYTE, this.data);

    // parse uv and page id from render target
    parse(sparseTable);

    //if (this.debug.enabled) {
      // copy the flipped texture to data
    this.imgData.data.set(this.data);
    this.canvas.getContext('2d').putImageData(this.imgData, 0, 0);
    //}
  };

  //
  //
  //

  THREE.VirtualTexture = function (context, params) {
    if (!params) {
      console.error('\'params\' is not defined. Virtual Texturing cannot start.');
      return;
    }

    this.maxMipMapLevel = params.maxMipMapLevel;
    this.tileSize = params.tileSize;
    this.tilePadding = params.tilePadding;
    this.cacheSize = params.cacheSize;

    this.context = context;

    // init tile queue
    this.tileQueue = new VT.TileQueue(2, params.tileLocations);

    var lengthPerSide = 1 << Math.log(this.tileSize) / Math.log(2) + this.maxMipMapLevel;
    this.size = lengthPerSide;

    console.log('Virtual Texture: width: ' + this.size + ' height: ' + this.size);

    this.tileCount = {
      x: this.size / this.tileSize,
      y: this.size / this.tileSize
    };

    // objects
    this.tileDetermination = null;
    this.indirectionTable = null;
    this.cache = null;
    this.usageTable = null;

    this.needsUpdate = false;
    this.init();
  };

  THREE.VirtualTexture.prototype = {
    render: function (renderer, camera) {

      renderer.render(this.tileDetermination.scene, camera, this.tileDetermination.renderTarget, false);

      //this.needsUpdate = true;
      this.update();
    },

    init: function () {

      // init tile determination program
      this.tileDetermination = new VT.TileDetermination();
      this.tileDetermination.init(window.innerWidth, window.innerHeight);
      this.tileDetermination.scene.add();

      // init page table
      var cacheSize = this.size / this.tileSize;
      this.indirectionTable = new VT.IndirectionTable(
        this.context,
        cacheSize
      );
      console.log("Indirection table size: " + cacheSize);

      // init page cache
      this.cache = new VT.Cache(
        this.context,
        this.tileSize,           // pageSizeRoot,
        this.tilePadding,          // padding, 
        this.cacheSize,
        this.cacheSize  // cacheSizeRoot
      );

      var scope = this;
      this.cache.pageDroppedCallback = function (page, mipLevel) {
        var handle = scope.indirectionTable.getElementAt(page, mipLevel).value;
        scope.indirectionTable.set(page, mipLevel, -1);
        scope.indirectionTable.setChildren(page, mipLevel, -1, handle);
      };

      // init usage table
      this.usageTable = new VT.UsageTable(this.indirectionTable.size);

      this.tileQueue.callback = function (tile) {

        var status = scope.cache.getPageStatus(tile.parentId);
        var tileAlreadyOnCache = (StatusAvailable === status);

        if (!tileAlreadyOnCache) {

          var handle = scope.cache.cachePage(tile, false);
          var pageNumber = VT.PageId.getPageNumber(tile.id);
          var mipMapLevel = VT.PageId.getMipMapLevel(tile.id);

          scope.indirectionTable.set(pageNumber, mipMapLevel, handle);
          //++boundPages;
        }

        scope.needsUpdate = true;
        //++erasedCount;
      };

      this.resetCache();

      // init debug helpers
      this.tileDetermination.debug();
      this.indirectionTable.debug();

      this.needsUpdate = true;
    },

    resetCache: function () {
      // delete all entries in cache and set all slots as free
      this.cache.clear();

      // set all slots in page table as -1 (invalid)
      this.indirectionTable.clear(-1);

      var pageId = VT.PageId.create(0, this.indirectionTable.maxLevel);
      //var pageId = VT.PageId.create(0, 0);
      var tile = new VT.Tile(this.maxMipMapLevel, pageId, Number.MAX_VALUE);
      this.tileQueue.push(tile);
    },

    update: function () {

      // parse render taget pixels (mip map levels and visible tile)
      this.tileDetermination.parseImage(this.context, this.usageTable);

      //console.log(this.cache)
      var element, level, isUsed;
      var releasedPagesCount = 0;
      var restoredPagesCount = 0;
      var alreadyCachedPagesCount = 0;
      var tilesRequestedCount = 0;

      for (element in this.cache.cachedPages) {
        if (this.cache.cachedPages.hasOwnProperty(element)) {
          element = parseInt(element, 10);

          level = VT.PageId.getMipMapLevel(element);
          isUsed = this.usageTable.isUsed(element);

          if ((!isUsed) && (level < this.maxMipMapLevel)) {
            this.cache.releasePage(element);
            ++releasedPagesCount;
          }
        }
      }

      var i, x, y, restored, wasRestored, pageId, pageNumber, mipMapLevel, elementCountAtLevel, status,
        useProgressiveLoading, maxParentMipMapLevel, newNumber, newPageId, newPageStatus, tmpId, hits, tile;

      // find the items which are not cached yet
      for (pageId in this.usageTable.table) {
        if (this.usageTable.table.hasOwnProperty(pageId)) {
          wasRestored = false;

          pageId = parseInt(pageId, 10);
          pageNumber = VT.PageId.getPageNumber(pageId);
          mipMapLevel = VT.PageId.getMipMapLevel(pageId);
          elementCountAtLevel = this.indirectionTable.getElementCountAtLevel(mipMapLevel);

          if (pageNumber >= elementCountAtLevel) {
            // FIXME: Pending bug
            console.error('Out of bounds error:\npageNumber: ' + pageNumber + "\nmipMapLevel: " + mipMapLevel);
            continue;
          }

          status = this.cache.getPageStatus(pageId);

          // if page is already cached, continue
          if (StatusAvailable === status) {
            ++alreadyCachedPagesCount;

          } else if (StatusPendingDelete === status) {

            // if page is pending delete, try to restore it
            restored = this.cache.restorePage(pageId);
            if (restored.wasRestored) {
              this.indirectionTable.set(pageNumber, mipMapLevel, restored.id);

              wasRestored = true;
              ++restoredPagesCount;
            }
          }

          if ((StatusAvailable !== status) && !wasRestored) {

            useProgressiveLoading = true;
            maxParentMipMapLevel = useProgressiveLoading ? this.indirectionTable.maxLevel : (mipMapLevel + 1);

            // request the page and all parents
            for (i = mipMapLevel; i < maxParentMipMapLevel; ++i) {
              x = pageNumber % this.indirectionTable.getLevelWidth(mipMapLevel);
              y = Math.floor(pageNumber / this.indirectionTable.getLevelHeight(mipMapLevel));

              x >>= (i - mipMapLevel);
              y >>= (i - mipMapLevel);

              newNumber = y * this.indirectionTable.getLevelWidth(i) + x;
              newPageId = VT.PageId.create(newNumber, i);

              newPageStatus = this.cache.getPageStatus(newPageId);

              // FIXME: should try to restore page?
              //restored = this.cache.restorePage(newPageId);
              //if ((StatusAvailable !== newPageStatus) && !restored.wasRestored) {
              if ((StatusAvailable !== newPageStatus)) {
                if (!this.tileQueue.contains(newPageId)) {
                  tmpId = ((newPageId !== pageId) ? pageId : VT.PageId.createInvalid());
                  hits = this.usageTable.table[pageId].hits;
                  tile = new VT.Tile(this.maxMipMapLevel, newPageId, hits, tmpId);

                  this.tileQueue.push(tile);
                  ++tilesRequestedCount;
                }
              }
            } // for (var i = mipMapLevel; i < maxParentMipMapLevel; ++i) {
          }
        }
      } // for (var pageId in this.sparseTable.table) {

      var cacheStatusData = this.cache.getStatus(0, 0, 0);

      console.log('# Released Pages: ' + releasedPagesCount + '\n' +
        '# Restored Pages: ' + restoredPagesCount + '\n' +
        '# Already Cached Pages: ' + alreadyCachedPagesCount + '\n' +
        '# Tiles Requested: ' + tilesRequestedCount);

      console.log("EntryCount:\t"   + this.usageTable.entryCount +
            "\nUsed:\t\t"   + cacheStatusData.used +
            "\nFree:\t\t"   + cacheStatusData.free +
            "\nMarkedFree:\t"   + cacheStatusData.markedFree);

      this.indirectionTable.update(this.cache);
      this.usageTable.clear();
    }
  };
}());
