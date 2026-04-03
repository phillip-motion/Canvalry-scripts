/*
  Sierpinski Triangle Distribution
  Recursively subdivided triangle. At each depth level, the three corner
  sub-triangles are kept and the centre triangle is removed. Points are
  placed at all resulting unique vertices.

  Depth 0 = 3 points, Depth 1 = 6, Depth 5 = 1095, Depth 6 = 3282.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Scale / Side Length  (default: 500)
    n1  Depth                (default: 5)   recursion depth (0-7 recommended)
*/

function sierpinskiTriangleDistribution() {
    var scale = (typeof n0 !== "undefined") ? n0 : 500;
    var depth = (typeof n1 !== "undefined") ? Math.max(Math.round(n1), 0) : 5;

    if (depth > 8) { depth = 8; }

    var halfS = scale / 2;
    var h = scale * Math.sqrt(3) / 2;
    var topY = h * 2 / 3;
    var botY = -h / 3;

    var triangles = [
        [[-halfS, botY], [halfS, botY], [0, topY]]
    ];

    for (var d = 0; d < depth; d += 1) {
        var next = [];
        for (var t = 0; t < triangles.length; t += 1) {
            var tri = triangles[t];
            var a = tri[0], b = tri[1], c = tri[2];

            var ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            var bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
            var ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];

            next.push([a, ab, ca]);
            next.push([ab, b, bc]);
            next.push([ca, bc, c]);
        }
        triangles = next;
    }

    var seen = {};
    var cloud = new cavalry.PointCloud();

    for (var i = 0; i < triangles.length; i += 1) {
        var tri2 = triangles[i];
        for (var v = 0; v < 3; v += 1) {
            var key = Math.round(tri2[v][0] * 10) + "," + Math.round(tri2[v][1] * 10);
            if (!seen[key]) {
                seen[key] = true;
                cloud.appendPoint(new cavalry.Point(tri2[v][0], tri2[v][1]));
            }
        }
    }

    return cloud;
}

sierpinskiTriangleDistribution();
