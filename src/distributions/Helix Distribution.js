/*
  Helix Distribution
  Distributes points along a spiral coil (helix) path, with 3D rotation
  and CSS-style perspective projection. Great for DNA or spring layouts.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0  Radius               (default: 150)
    n1  Height               (default: 500)
    n2  Turns                (default: 5)   number of coil wraps
    n3  Point Count          (default: 200)
    n4  Rotation X degrees   (default: 0)
    n5  Rotation Y degrees   (default: 0)
    n6  Rotation Z degrees   (default: 0)
    n7  Perspective           (default: 800, set to 0 for orthographic)
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

function helixDistribution() {
    var radius = (typeof n0 !== "undefined") ? n0 : 150;
    var height = (typeof n1 !== "undefined") ? n1 : 500;
    var turns = (typeof n2 !== "undefined") ? Math.max(n2, 0.1) : 5;
    var count = (typeof n3 !== "undefined") ? Math.max(Math.round(n3), 1) : 200;
    var rx = (typeof n4 !== "undefined") ? n4 * Math.PI / 180 : 0;
    var ry = (typeof n5 !== "undefined") ? n5 * Math.PI / 180 : 0;
    var rz = (typeof n6 !== "undefined") ? n6 * Math.PI / 180 : 0;
    var perspective = (typeof n7 !== "undefined") ? n7 : 800;

    var cloud = new cavalry.PointCloud();
    var totalAngle = turns * 2 * Math.PI;
    var halfH = height / 2;

    for (var i = 0; i < count; i += 1) {
        var t = i / (count - 1 || 1);
        var theta = totalAngle * t;

        var px = radius * Math.cos(theta);
        var py = -halfH + height * t;
        var pz = radius * Math.sin(theta);

        var rotated = rotatePoint3D(px, py, pz, rx, ry, rz);
        var projected = projectPoint(rotated.x, rotated.y, rotated.z, perspective);
        cloud.appendPoint(new cavalry.Point(projected.x, projected.y));
        cloud.appendSize(new cavalry.Point(projected.scale, projected.scale));
    }

    return cloud;
}

helixDistribution();
