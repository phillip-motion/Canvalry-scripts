/*
  Cube Distribution
  Distributes points evenly across the 6 faces of a cube, with 3D rotation,
  CSS-style perspective projection, and per-face backface culling.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Half-size            (default: 200)
    n1  Point Count          (default: 150)
    n2  Rotation X degrees   (default: 0)
    n3  Rotation Y degrees   (default: 0)
    n4  Rotation Z degrees   (default: 0)
    n5  Perspective           (default: 800, set to 0 for orthographic)
    n6  Cull Backfaces        (0 = off, 1 = on)
*/

function rotatePoint3D(x, y, z, rx, ry, rz) {
    var cosX = Math.cos(rx), sinX = Math.sin(rx);
    var y1 = y * cosX - z * sinX;
    var z1 = y * sinX + z * cosX;

    var cosY = Math.cos(ry), sinY = Math.sin(ry);
    var x2 = x * cosY + z1 * sinY;
    var z2 = -x * sinY + z1 * cosY;

    var cosZ = Math.cos(rz), sinZ = Math.sin(rz);
    var x3 = x2 * cosZ - y1 * sinZ;
    var y3 = x2 * sinZ + y1 * cosZ;

    return { x: x3, y: y3, z: z2 };
}

function smoothstep(t) {
    if (t <= 0) { return 0; }
    if (t >= 1) { return 1; }
    return t * t * (3 - 2 * t);
}

function projectPoint(x, y, z, perspective) {
    if (perspective > 0) {
        var scale = perspective / (perspective - z);
        if (scale <= 0) { scale = 0.001; }
        return { x: x * scale, y: y * scale, scale: scale };
    }
    return { x: x, y: y, scale: 1 };
}

function cubeDistribution() {
    var halfSize = (typeof n0 !== "undefined") ? n0 : 200;
    var totalCount = (typeof n1 !== "undefined") ? Math.max(Math.round(n1), 6) : 150;
    var rx = (typeof n2 !== "undefined") ? n2 * Math.PI / 180 : 0;
    var ry = (typeof n3 !== "undefined") ? n3 * Math.PI / 180 : 0;
    var rz = (typeof n4 !== "undefined") ? n4 * Math.PI / 180 : 0;
    var perspective = (typeof n5 !== "undefined") ? n5 : 800;
    var cullBackfaces = (typeof n6 !== "undefined") ? (n6 >= 1) : false;

    var cloud = new cavalry.PointCloud();

    var faces = [
        { axis: 0, sign:  1 },
        { axis: 0, sign: -1 },
        { axis: 1, sign:  1 },
        { axis: 1, sign: -1 },
        { axis: 2, sign:  1 },
        { axis: 2, sign: -1 }
    ];

    var perFace = Math.floor(totalCount / 6);
    var gridSize = Math.max(Math.round(Math.sqrt(perFace)), 1);

    for (var f = 0; f < 6; f += 1) {
        var face = faces[f];

        var cullFactor = 1;
        if (cullBackfaces) {
            var fnx = (face.axis === 0) ? face.sign : 0;
            var fny = (face.axis === 1) ? face.sign : 0;
            var fnz = (face.axis === 2) ? face.sign : 0;
            var rotatedNormal = rotatePoint3D(fnx, fny, fnz, rx, ry, rz);
            cullFactor = smoothstep(rotatedNormal.z / 0.5);
        }

        for (var row = 0; row < gridSize; row += 1) {
            for (var col = 0; col < gridSize; col += 1) {
                var u = (gridSize > 1) ? -halfSize + (2 * halfSize * col / (gridSize - 1)) : 0;
                var v = (gridSize > 1) ? -halfSize + (2 * halfSize * row / (gridSize - 1)) : 0;

                var px, py, pz;
                if (face.axis === 0) {
                    px = halfSize * face.sign;
                    py = u;
                    pz = v;
                } else if (face.axis === 1) {
                    px = u;
                    py = halfSize * face.sign;
                    pz = v;
                } else {
                    px = u;
                    py = v;
                    pz = halfSize * face.sign;
                }

                var rotated = rotatePoint3D(px, py, pz, rx, ry, rz);
                var projected = projectPoint(rotated.x, rotated.y, rotated.z, perspective);
                var s = projected.scale * cullFactor;
                cloud.appendPoint(new cavalry.Point(projected.x, projected.y));
                cloud.appendSize(new cavalry.Point(s, s));
            }
        }
    }

    return cloud;
}

cubeDistribution();
