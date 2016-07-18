/****************************************************************************
 Copyright (c) 2013-2016 Chukong Technologies Inc.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

var Orientation = null;
var TileFlag = null;
var FLIPPED_MASK = null;

_ccsg.TMXLayer.CanvasRenderCmd = function(renderable){
    _ccsg.Node.CanvasRenderCmd.call(this, renderable);
    this._needDraw = true;

    if (!Orientation) {
        Orientation = cc.TiledMap.Orientation;
        TileFlag = cc.TiledMap.TileFlag;
        FLIPPED_MASK = TileFlag.FLIPPED_MASK;
    }
};

var proto = _ccsg.TMXLayer.CanvasRenderCmd.prototype = Object.create(_ccsg.Node.CanvasRenderCmd.prototype);
proto.constructor = _ccsg.TMXLayer.CanvasRenderCmd;

proto.visit = function (parentCmd) {
    var node = this._node, renderer = cc.renderer;
    // quick return if not visible
    if (!node._visible)
        return;

    parentCmd = parentCmd || this.getParentRenderCmd();
    if (parentCmd)
        this._curLevel = parentCmd._curLevel + 1;

    if (isNaN(node._customZ)) {
        node._vertexZ = renderer.assignedZ;
        renderer.assignedZ += renderer.assignedZStep;
    }

    this._syncStatus(parentCmd);

    // Visit children
    var children = node._children, child, cmd,
        spTiles = node._spriteTiles,
        i, len = children.length;
    if (len > 0) {
        node.sortAllChildren();
        // draw children zOrder < 0
        for (i = 0; i < len; i++) {
            child = children[i];
            if (child._localZOrder < 0) {
                cmd = child._renderCmd;
                cmd.visit(this);
            }
            else {
                break;
            }
        }

        renderer.pushRenderCommand(this);
        for (; i < len; i++) {
            child = children[i];
            if (child._localZOrder === 0 && spTiles[child.tag]) {
                if (isNaN(child._customZ)) {
                    child._vertexZ = renderer.assignedZ;
                    renderer.assignedZ += renderer.assignedZStep;
                }
                child._renderCmd.updateStatus(this, true);
                continue;
            }
            child._renderCmd.visit(this);
        }
    } else {
        renderer.pushRenderCommand(this);
    }
    this._dirtyFlag = 0;
};

proto.rendering = function (ctx, scaleX, scaleY) {
    var node = this._node, hasRotation = (node._rotationX || node._rotationY),
        layerOrientation = node.layerOrientation,
        tiles = node.tiles,
        alpha = this._displayedOpacity / 255;

    if (!tiles || alpha <= 0) {
        return;
    }

    var maptw = node._mapTileSize.width,
        mapth = node._mapTileSize.height,
        tilew = node.tileset._tileSize.width / cc.director._contentScaleFactor,
        tileh = node.tileset._tileSize.height / cc.director._contentScaleFactor,
        extw = tilew - maptw,
        exth = tileh - mapth,
        winw = cc.winSize.width,
        winh = cc.winSize.height,
        rows = node._layerSize.height,
        cols = node._layerSize.width,
        grids = node._texGrids,
        spTiles = node._spriteTiles,
        wt = this._worldTransform,
        ox = -node._contentSize.width * node._anchorPoint.x,
        oy = -node._contentSize.height * node._anchorPoint.y,
        a = wt.a, b = wt.b, c = wt.c, d = wt.d,
        mapx = ox * a + oy * c + wt.tx,
        mapy = ox * b + oy * d + wt.ty;

    var wrapper = ctx || cc._renderContext, context = wrapper.getContext();

    // Culling
    var startCol = 0, startRow = 0,
        maxCol = cols, maxRow = rows;
    if (!hasRotation && layerOrientation === Orientation.ORTHO) {
        startCol = Math.floor(-(mapx - extw * a) / (maptw * a));
        startRow = Math.floor((mapy - exth * d + mapth * rows * d - winh) / (mapth * d));
        maxCol = Math.ceil((winw - mapx + extw * a) / (maptw * a));
        maxRow = rows - Math.floor(-(mapy + exth * d) / (mapth * d));
        // Adjustment
        if (startCol < 0) startCol = 0;
        if (startRow < 0) startRow = 0;
        if (maxCol > cols) maxCol = cols;
        if (maxRow > rows) maxRow = rows;
    }

    var i, row, col, colOffset = startRow * cols, z, 
        gid, grid, tex, cmd,
        top, left, bottom, right, dw = tilew * scaleX, dh = tileh * scaleY,
        w = tilew * a, h = tileh * d, gt, gl, gb, gr,
        flippedX = false, flippedY = false;

    // Draw culled sprite tiles
    z = colOffset + startCol;
    for (i in spTiles) {
        if (i < z && spTiles[i]) {
            cmd = spTiles[i]._renderCmd;
            if (spTiles[i]._localZOrder === 0 && !!cmd.rendering) {
                cmd.rendering(ctx, scaleX, scaleY);
            }
        }
        else if (i >= z) {
            break;
        }
    }

    wrapper.setTransform(wt, scaleX, scaleY);
    wrapper.setGlobalAlpha(alpha);

    for (row = startRow; row < maxRow; ++row) {
        for (col = startCol; col < maxCol; ++col) {
            z = colOffset + col;
            // Skip sprite tiles
            if (spTiles[z]) {
                cmd = spTiles[z]._renderCmd;
                if (spTiles[z]._localZOrder === 0 && !!cmd.rendering) {
                    cmd.rendering(ctx, scaleX, scaleY);
                    wrapper.setTransform(wt, scaleX, scaleY);
                    wrapper.setGlobalAlpha(alpha);
                }
                continue;
            }

            gid = node.tiles[z];
            grid = grids[(gid & FLIPPED_MASK) >>> 0];
            if (!grid) {
                continue;
            }
            tex = node._textures[grid.texId];
            if (!tex || !tex._htmlElementObj) {
                continue;
            }

            switch (layerOrientation) {
            case Orientation.ORTHO:
                left = col * maptw;
                bottom = -(rows - row - 1) * mapth;
                break;
            case Orientation.ISO:
                left = maptw / 2 * ( cols + col - row - 1);
                bottom = -mapth / 2 * ( rows * 2 - col - row - 2);
                break;
            case Orientation.HEX:
                left = col * maptw * 3 / 4;
                bottom = -(rows - row - 1) * mapth + ((col % 2 === 1) ? (-mapth / 2) : 0);
                break;
            }
            right = left + tilew;
            top = bottom - tileh;
            // TMX_ORIENTATION_ISO trim
            if (!hasRotation && layerOrientation === Orientation.ISO) {
                gb = -mapy + bottom*d;
                if (gb < -winh-h) {
                    col += Math.floor((-winh - gb)*2/h) - 1;
                    continue;
                }
                gr = mapx + right*a;
                if (gr < -w) {
                    col += Math.floor((-gr)*2/w) - 1;
                    continue;
                }
                gl = mapx + left*a;
                gt = -mapy + top*d;
                if (gl > winw || gt > 0) {
                    col = maxCol;
                    continue;
                }
            }

            // Rotation and Flip
            if (gid > TileFlag.DIAGONAL) {
                flippedX = (gid & TileFlag.HORIZONTAL) >>> 0;
                flippedY = (gid & TileFlag.VERTICAL) >>> 0;
            }

            if (flippedX) {
                left = -right;
                context.scale(-1, 1);
            }
            if (flippedY) {
                top = -bottom;
                context.scale(1, -1);
            }

            context.drawImage(tex._htmlElementObj,
                grid.x, grid.y, grid.width, grid.height,
                left*scaleX, top*scaleY, dw, dh);
            // Revert flip
            if (flippedX) {
                context.scale(-1, 1);
            }
            if (flippedY) {
                context.scale(1, -1);
            }
            cc.g_NumberOfDraws++;
        }
        colOffset += cols;
    }

    // Draw culled sprite tiles
    for (i in spTiles) {
        if (i > z && spTiles[i]) {
            cmd = spTiles[i]._renderCmd;
            if (spTiles[i]._localZOrder === 0 && !!cmd.rendering) {
                cmd.rendering(ctx, scaleX, scaleY);
            }
        }
    }
};
