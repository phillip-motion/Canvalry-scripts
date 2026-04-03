/*
  Trefoil Knot Distribution
  Distributes points along a 3D trefoil knot path:
    x = sin(t) + 2 * sin(2t)
    y = cos(t) - 2 * cos(2t)
    z = -sin(3t)
  With 3D rotation and CSS-style perspective projection.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Scale                (default: 100)
    n1  Point Count          (default: 500)
    n2  Rotation X degrees   (default: 0)
    n3  Rotation Y degrees   (default: 0)
    n4  Rotation Z degrees   (default: 0)
    n5  Perspective           (default: 800, set to 0 for orthographic)
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

function projectPoint(x, y, z, perspective) {
    if (perspective > 0) {
        var scale = perspective / (perspective - z);
        if (scale <= 0) { scale = 0.001; }
        return { x: x * scale, y: y * scale, scale: scale };
    }
    return { x: x, y: y, scale: 1 };
}

function trefoilKnotDistribution() {
    var scale = (typeof n0 !== "undefined") ? n0 : 100;
    var count = (typeof n1 !== "undefined") ? Math.max(Math.round(n1), 1) : 500;
    var rx = (typeof n2 !== "undefined") ? n2 * Math.PI / 180 : 0;
    var ry = (typeof n3 !== "undefined") ? n3 * Math.PI / 180 : 0;
    var rz = (typeof n4 !== "undefined") ? n4 * Math.PI / 180 : 0;
    var perspective = (typeof n5 !== "undefined") ? n5 : 800;

    var cloud = new cavalry.PointCloud();

    for (var i = 0; i < count; i += 1) {
        var t = 2 * Math.PI * i / count;

        var px = (Math.sin(t) + 2 * Math.sin(2 * t)) * scale;
        var py = (Math.cos(t) - 2 * Math.cos(2 * t)) * scale;
        var pz = -Math.sin(3 * t) * scale;

        var rotated = rotatePoint3D(px, py, pz, rx, ry, rz);
        var projected = projectPoint(rotated.x, rotated.y, rotated.z, perspective);
        cloud.appendPoint(new cavalry.Point(projected.x, projected.y));
        cloud.appendSize(new cavalry.Point(projected.scale, projected.scale));
    }

    return cloud;
}

trefoilKnotDistribution();
