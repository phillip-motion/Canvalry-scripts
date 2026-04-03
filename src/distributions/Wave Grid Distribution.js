/*
  Wave Grid Distribution
  A flat grid where each point's Z is displaced by layered sine waves,
  then projected with perspective. Creates an undulating terrain surface.
  Connect the Phase to the current frame for animation.

  Connect this JavaScript Utility to a Duplicator's Custom Distribution.

  Node attributes (add via the + button on the JavaScript tab):
    n0   Grid Width          (default: 600)
    n1   Grid Height         (default: 600)
    n2   Columns             (default: 20)
    n3   Rows                (default: 20)
    n4   Wave Amplitude      (default: 100)
    n5   Wave Frequency      (default: 0.02)
    n6   Phase               (default: 0)   connect to frame for animation
    n7   Rotation X degrees  (default: 0)
    n8   Rotation Y degrees  (default: 0)
    n9   Rotation Z degrees  (default: 0)
    n10  Perspective          (default: 800, set to 0 for orthographic)
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

function waveGridDistribution() {
    var gridW = (typeof n0 !== "undefined") ? n0 : 600;
    var gridH = (typeof n1 !== "undefined") ? n1 : 600;
    var cols = (typeof n2 !== "undefined") ? Math.max(Math.round(n2), 2) : 20;
    var rows = (typeof n3 !== "undefined") ? Math.max(Math.round(n3), 2) : 20;
    var amplitude = (typeof n4 !== "undefined") ? n4 : 100;
    var freq = (typeof n5 !== "undefined") ? n5 : 0.02;
    var phase = (typeof n6 !== "undefined") ? n6 : 0;
    var rx = (typeof n7 !== "undefined") ? n7 * Math.PI / 180 : 0;
    var ry = (typeof n8 !== "undefined") ? n8 * Math.PI / 180 : 0;
    var rz = (typeof n9 !== "undefined") ? n9 * Math.PI / 180 : 0;
    var perspective = (typeof n10 !== "undefined") ? n10 : 800;

    var cloud = new cavalry.PointCloud();
    var halfW = gridW / 2;
    var halfH = gridH / 2;

    for (var row = 0; row < rows; row += 1) {
        var gy = -halfH + gridH * row / (rows - 1);
        for (var col = 0; col < cols; col += 1) {
            var gx = -halfW + gridW * col / (cols - 1);

            var pz = amplitude * Math.sin(gx * freq + phase) * Math.cos(gy * freq + phase);

            var rotated = rotatePoint3D(gx, gy, pz, rx, ry, rz);
            var projected = projectPoint(rotated.x, rotated.y, rotated.z, perspective);
            cloud.appendPoint(new cavalry.Point(projected.x, projected.y));
            cloud.appendSize(new cavalry.Point(projected.scale, projected.scale));
        }
    }

    return cloud;
}

waveGridDistribution();
