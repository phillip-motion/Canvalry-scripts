/*
  Torus Distribution
  Distributes points on the surface of a donut (torus) using two parametric
  angles, with 3D rotation, CSS-style perspective projection, and backface culling.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Major Radius R       (default: 250)  ring size
    n1  Minor Radius r       (default: 80)   tube thickness
    n2  Point Count          (default: 200)
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

function torusDistribution() {
    var R = (typeof n0 !== "undefined") ? n0 : 250;
    var r = (typeof n1 !== "undefined") ? n1 : 80;
    var count = (typeof n2 !== "undefined") ? Math.max(Math.round(n2), 1) : 200;
    var rx = (typeof n3 !== "undefined") ? n3 * Math.PI / 180 : 0;
    var ry = (typeof n4 !== "undefined") ? n4 * Math.PI / 180 : 0;
    var rz = (typeof n5 !== "undefined") ? n5 * Math.PI / 180 : 0;
    var perspective = (typeof n6 !== "undefined") ? n6 : 800;
    var cullBackfaces = (typeof n7 !== "undefined") ? (n7 >= 1) : false;

    var cloud = new cavalry.PointCloud();

    var ringSteps = Math.max(Math.round(Math.sqrt(count * R / (R + r))), 1);
    var tubeSteps = Math.max(Math.round(count / ringSteps), 1);

    for (var i = 0; i < ringSteps; i += 1) {
        var theta = 2 * Math.PI * i / ringSteps;
        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);

        for (var j = 0; j < tubeSteps; j += 1) {
            var phi = 2 * Math.PI * j / tubeSteps;
            var cosPhi = Math.cos(phi);

            var px = (R + r * cosPhi) * cosTheta;
            var py = (R + r * cosPhi) * sinTheta;
            var pz = r * Math.sin(phi);

            var rotated = rotatePoint3D(px, py, pz, rx, ry, rz);

            var cullFactor = 1;
            if (cullBackfaces) {
                var nx = cosPhi * cosTheta;
                var ny = cosPhi * sinTheta;
                var nz = Math.sin(phi);
                var rotatedN = rotatePoint3D(nx, ny, nz, rx, ry, rz);
                cullFactor = smoothstep(rotatedN.z / 0.3);
            }

            var projected = projectPoint(rotated.x, rotated.y, rotated.z, perspective);
            var s = projected.scale * cullFactor;
            cloud.appendPoint(new cavalry.Point(projected.x, projected.y));
            cloud.appendSize(new cavalry.Point(s, s));
        }
    }

    return cloud;
}

torusDistribution();
