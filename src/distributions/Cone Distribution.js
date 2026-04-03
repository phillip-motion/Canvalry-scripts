/*
  Cone Distribution
  Distributes points on the surface of a cone. Radius shrinks linearly from
  base to apex. Includes optional base cap, 3D rotation, CSS-style
  perspective projection, and backface culling.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Base Radius          (default: 200)
    n1  Height               (default: 400)
    n2  Point Count          (default: 150)
    n3  Rotation X degrees   (default: 0)
    n4  Rotation Y degrees   (default: 0)
    n5  Rotation Z degrees   (default: 0)
    n6  Perspective           (default: 800, set to 0 for orthographic)
    n7  Cull Backfaces        (0 = off, 1 = on)
    n8  Include Base Cap      (0 = off, 1 = on)
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

function coneDistribution() {
    var baseRadius = (typeof n0 !== "undefined") ? n0 : 200;
    var height = (typeof n1 !== "undefined") ? n1 : 400;
    var count = (typeof n2 !== "undefined") ? Math.max(Math.round(n2), 1) : 150;
    var rx = (typeof n3 !== "undefined") ? n3 * Math.PI / 180 : 0;
    var ry = (typeof n4 !== "undefined") ? n4 * Math.PI / 180 : 0;
    var rz = (typeof n5 !== "undefined") ? n5 * Math.PI / 180 : 0;
    var perspective = (typeof n6 !== "undefined") ? n6 : 800;
    var cullBackfaces = (typeof n7 !== "undefined") ? (n7 >= 1) : false;
    var includeCap = (typeof n8 !== "undefined") ? (n8 >= 1) : false;

    var cloud = new cavalry.PointCloud();
    var halfH = height / 2;

    var slopeAngle = Math.atan2(baseRadius, height);
    var slopeNx = Math.cos(slopeAngle);
    var slopeNy = Math.sin(slopeAngle);

    var sideCount = includeCap ? Math.round(count * 0.75) : count;
    var cols = Math.max(Math.round(Math.sqrt(sideCount * 2)), 3);
    var rows = Math.max(Math.round(sideCount / cols), 2);

    for (var row = 0; row < rows; row += 1) {
        var t = row / (rows - 1);
        var r = baseRadius * (1 - t);
        var py = -halfH + height * t;

        for (var col = 0; col < cols; col += 1) {
            var theta = 2 * Math.PI * col / cols;
            var px = r * Math.cos(theta);
            var pz = r * Math.sin(theta);

            var rotated = rotatePoint3D(px, py, pz, rx, ry, rz);

            var cullFactor = 1;
            if (cullBackfaces) {
                var nx = slopeNx * Math.cos(theta);
                var nz = slopeNx * Math.sin(theta);
                var rn = rotatePoint3D(nx, slopeNy, nz, rx, ry, rz);
                cullFactor = smoothstep(rn.z / 0.3);
            }

            var projected = projectPoint(rotated.x, rotated.y, rotated.z, perspective);
            var s = projected.scale * cullFactor;
            cloud.appendPoint(new cavalry.Point(projected.x, projected.y));
            cloud.appendSize(new cavalry.Point(s, s));
        }
    }

    if (includeCap) {
        var capCount = count - sideCount;
        var capRings = Math.max(Math.round(Math.sqrt(capCount)), 1);

        var capCullFactor = 1;
        if (cullBackfaces) {
            var cn = rotatePoint3D(0, -1, 0, rx, ry, rz);
            capCullFactor = smoothstep(cn.z / 0.5);
        }

        for (var ring = 0; ring < capRings; ring += 1) {
            var ringR = baseRadius * (ring + 1) / capRings;
            var ringPts = Math.max(Math.round(2 * Math.PI * (ring + 1)), 3);
            for (var p = 0; p < ringPts; p += 1) {
                var a = 2 * Math.PI * p / ringPts;
                var cpx = ringR * Math.cos(a);
                var cpz = ringR * Math.sin(a);

                var cRotated = rotatePoint3D(cpx, -halfH, cpz, rx, ry, rz);
                var cProjected = projectPoint(cRotated.x, cRotated.y, cRotated.z, perspective);
                var cs = cProjected.scale * capCullFactor;
                cloud.appendPoint(new cavalry.Point(cProjected.x, cProjected.y));
                cloud.appendSize(new cavalry.Point(cs, cs));
            }
        }
    }

    return cloud;
}

coneDistribution();
