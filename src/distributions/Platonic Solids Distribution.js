/*
  Platonic Solids Distribution
  Distributes points at the vertices of any of the 5 Platonic solids, with
  optional face subdivision for denser coverage. Includes 3D rotation,
  CSS-style perspective projection, and backface culling.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Scale / Radius       (default: 300)
    n1  Solid Type           (default: 4)
          0 = Tetrahedron (4 vertices)
          1 = Cube (8 vertices)
          2 = Octahedron (6 vertices)
          3 = Dodecahedron (20 vertices)
          4 = Icosahedron (12 vertices)
    n2  Subdivisions         (default: 0)   split each face for more points
    n3  Rotation X degrees   (default: 0)
    n4  Rotation Y degrees   (default: 0)
    n5  Rotation Z degrees   (default: 0)
    n6  Perspective           (default: 800, set to 0 for orthographic)
    n7  Cull Backfaces        (0 = off, 1 = on)
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

function normalizeVert(v, radius) {
    var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len < 0.0001) { return [0, 0, 0]; }
    return [v[0] / len * radius, v[1] / len * radius, v[2] / len * radius];
}

function midpoint(a, b) {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function getTetrahedron() {
    var verts = [
        [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]
    ];
    var faces = [[0,1,2], [0,1,3], [0,2,3], [1,2,3]];
    return { verts: verts, faces: faces };
}

function getCube() {
    var verts = [
        [-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
        [-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1]
    ];
    var faces = [
        [0,1,2,3], [4,5,6,7], [0,1,5,4],
        [2,3,7,6], [0,3,7,4], [1,2,6,5]
    ];
    return { verts: verts, faces: faces };
}

function getOctahedron() {
    var verts = [
        [1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]
    ];
    var faces = [
        [0,2,4], [0,4,3], [0,3,5], [0,5,2],
        [1,2,4], [1,4,3], [1,3,5], [1,5,2]
    ];
    return { verts: verts, faces: faces };
}

function getDodecahedron() {
    var phi = (1 + Math.sqrt(5)) / 2;
    var ip = 1 / phi;
    var verts = [
        [-1,-1,-1], [-1,-1,1], [-1,1,-1], [-1,1,1],
        [1,-1,-1], [1,-1,1], [1,1,-1], [1,1,1],
        [0,-ip,-phi], [0,-ip,phi], [0,ip,-phi], [0,ip,phi],
        [-ip,-phi,0], [-ip,phi,0], [ip,-phi,0], [ip,phi,0],
        [-phi,0,-ip], [-phi,0,ip], [phi,0,-ip], [phi,0,ip]
    ];
    var faces = [
        [0,8,4,14,12], [0,12,1,17,16], [0,16,2,10,8],
        [8,10,6,18,4], [4,18,19,5,14], [14,5,9,1,12],
        [1,9,11,3,17], [17,3,13,2,16], [2,13,15,6,10],
        [6,15,7,19,18], [19,7,11,9,5], [7,15,13,3,11]
    ];
    return { verts: verts, faces: faces };
}

function getIcosahedron() {
    var phi = (1 + Math.sqrt(5)) / 2;
    var verts = [
        [-1,phi,0], [1,phi,0], [-1,-phi,0], [1,-phi,0],
        [0,-1,phi], [0,1,phi], [0,-1,-phi], [0,1,-phi],
        [phi,0,-1], [phi,0,1], [-phi,0,-1], [-phi,0,1]
    ];
    var faces = [
        [0,11,5], [0,5,1], [0,1,7], [0,7,10], [0,10,11],
        [1,5,9], [5,11,4], [11,10,2], [10,7,6], [7,1,8],
        [3,9,4], [3,4,2], [3,2,6], [3,6,8], [3,8,9],
        [4,9,5], [2,4,11], [6,2,10], [8,6,7], [9,8,1]
    ];
    return { verts: verts, faces: faces };
}

function subdivideFace(verts, faceIndices, radius, subdivisions) {
    var points = [];
    if (faceIndices.length === 3 && subdivisions > 0) {
        var a = verts[faceIndices[0]];
        var b = verts[faceIndices[1]];
        var c = verts[faceIndices[2]];
        var n = subdivisions + 1;
        for (var i = 0; i <= n; i += 1) {
            for (var j = 0; j <= n - i; j += 1) {
                var k = n - i - j;
                var px = (a[0] * i + b[0] * j + c[0] * k) / n;
                var py = (a[1] * i + b[1] * j + c[1] * k) / n;
                var pz = (a[2] * i + b[2] * j + c[2] * k) / n;
                points.push(normalizeVert([px, py, pz], radius));
            }
        }
    } else if (faceIndices.length > 3 && subdivisions > 0) {
        var cx = 0, cy = 0, cz = 0;
        for (var fi = 0; fi < faceIndices.length; fi += 1) {
            cx += verts[faceIndices[fi]][0];
            cy += verts[faceIndices[fi]][1];
            cz += verts[faceIndices[fi]][2];
        }
        cx /= faceIndices.length;
        cy /= faceIndices.length;
        cz /= faceIndices.length;
        var center = [cx, cy, cz];
        for (var fi2 = 0; fi2 < faceIndices.length; fi2 += 1) {
            var va = verts[faceIndices[fi2]];
            var vb = verts[faceIndices[(fi2 + 1) % faceIndices.length]];
            var triVerts = [center, va, vb];
            var sn = subdivisions + 1;
            for (var si = 0; si <= sn; si += 1) {
                for (var sj = 0; sj <= sn - si; sj += 1) {
                    var sk = sn - si - sj;
                    var spx = (triVerts[0][0] * si + triVerts[1][0] * sj + triVerts[2][0] * sk) / sn;
                    var spy = (triVerts[0][1] * si + triVerts[1][1] * sj + triVerts[2][1] * sk) / sn;
                    var spz = (triVerts[0][2] * si + triVerts[1][2] * sj + triVerts[2][2] * sk) / sn;
                    points.push(normalizeVert([spx, spy, spz], radius));
                }
            }
        }
    } else {
        for (var vi = 0; vi < faceIndices.length; vi += 1) {
            points.push(normalizeVert(verts[faceIndices[vi]], radius));
        }
    }
    return points;
}

function platonicDistribution() {
    var radius = (typeof n0 !== "undefined") ? n0 : 300;
    var solidType = (typeof n1 !== "undefined") ? Math.round(n1) : 4;
    var subdivisions = (typeof n2 !== "undefined") ? Math.max(Math.round(n2), 0) : 0;
    var rx = (typeof n3 !== "undefined") ? n3 * Math.PI / 180 : 0;
    var ry = (typeof n4 !== "undefined") ? n4 * Math.PI / 180 : 0;
    var rz = (typeof n5 !== "undefined") ? n5 * Math.PI / 180 : 0;
    var perspective = (typeof n6 !== "undefined") ? n6 : 800;
    var cullBackfaces = (typeof n7 !== "undefined") ? (n7 >= 1) : false;

    var solid;
    if (solidType === 0) { solid = getTetrahedron(); }
    else if (solidType === 1) { solid = getCube(); }
    else if (solidType === 2) { solid = getOctahedron(); }
    else if (solidType === 3) { solid = getDodecahedron(); }
    else { solid = getIcosahedron(); }

    var cloud = new cavalry.PointCloud();
    var seen = {};

    for (var f = 0; f < solid.faces.length; f += 1) {
        var facePoints = subdivideFace(solid.verts, solid.faces[f], radius, subdivisions);

        for (var p = 0; p < facePoints.length; p += 1) {
            var pt = facePoints[p];
            var key = Math.round(pt[0] * 10) + "," + Math.round(pt[1] * 10) + "," + Math.round(pt[2] * 10);
            if (seen[key]) { continue; }
            seen[key] = true;

            var rotated = rotatePoint3D(pt[0], pt[1], pt[2], rx, ry, rz);

            var cullFactor = 1;
            if (cullBackfaces) {
                var depth = rotated.z / (radius || 1);
                cullFactor = smoothstep(depth / 0.3);
            }

            var projected = projectPoint(rotated.x, rotated.y, rotated.z, perspective);
            var s = projected.scale * cullFactor;
            cloud.appendPoint(new cavalry.Point(projected.x, projected.y));
            cloud.appendSize(new cavalry.Point(s, s));
        }
    }

    return cloud;
}

platonicDistribution();
